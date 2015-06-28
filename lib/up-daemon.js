import FS from 'fs'
import CP from 'child_process'
import Path from 'path'
import L from 'lodash'
import Q from 'q'
import K from 'kefir'

import * as RPC from './up-rpc'
import {whenStream} from './wait'
import Store from './store'


export function startDaemon () {
    return RPC.host().then(hub => new RunnerRPC(hub))
}

function log (...args) {
    console.log('[up]', ...args)
}

function handleAsync (promise) {
    promise.catch(err => {
        log('!!! error')
        log(err.stack || err)
    })
}


function RunnerRPC (hub) {
    this.client = RPC.connectLocally(hub, { name: 'Runner' })
    this.runner = new ProcessRunner(this.client)

    initRunnerRPC(this)

    log('ready')
}

function initRunnerRPC (me) {
    me.client.on('request', (from, req, cb) => {
        var func = req[0]
        var params = req.slice(1)

        log('action', func, params)

        handleAsync(
            Q.try(() => rpcMethods[func].apply(null, params))
            .then(
                result => {
                    log(func, 'ok')
                    cb(['ok', result])
                },
                err => {
                    log('!!!', func, 'error')
                    log(err.stack)
                    cb(['err', {error: 'failed'}])
                }))
    })

    var rpcMethods = {
        'set-unit': (unitId, tasks) => me.runner.setUnit(unitId, tasks),
        'update-unit': (unitId) => me.runner.updateUnit(unitId),
        // ...
    }
}

function ProcessRunner (client) {
    this.client = client
    this.host = new ProcessHost()
    this.units = Store({})
    this.instances = new InstanceStore()

    initRunner(this)
}

function initRunner (me) {

    me.setUnit = function (unitId, tasks) {
        me.units.set(unitId, { tasks })
        markOld(unitId)
    }

    me.updateUnit = function (unitId) {
        var unitInstances = getInstances(unitId)
        var oldInstances = unitInstances.filter(inst => inst.marking == 'old' )

        var newInstances = []

        L.each(me.units.get(unitId).tasks, (_, taskId) => {
            var taskInsts = unitInstances.filter(inst => inst.taskId == taskId)

            var needUpdate = taskInsts.length == 0 || L.all(taskInsts, inst => inst.marking == 'old')

            if(needUpdate)
                newInstances.push(spawnInstance(unitId, taskId))
        })

        if(newInstances.length == 0 && oldInstances.length == 0) {
            log('nothing to do')
            return Q({
                action: 'update',
                success: true,
                message: 'nothing to update'
            })
        }

        return (
            Q.all(newInstances.map(inst => awaitUp(inst)))
            .then(
                () =>
                    stopInstances(oldInstances)
                    .then(() => ({
                        action: 'update',
                        success: true,
                        message: `updated instances: ${showInstances(newInstances)}, stopped instances: ${showInstances(oldInstances)}`,
                    })),
                err =>
                    Q(unmarkOld())
                    .then(() => stopInstances(newInstances))
                    .then(() => ({
                        action: 'update',
                        success: false,
                        message: `error: ${err.message}`,
                    }))
            )
        )

        function showInstances (list) {
            return JSON.stringify(L.map(list, inst => inst.proc.name))
        }
    }

    function markOld(unitId) {
        getInstances(unitId).forEach(inst => {
            var curDef = me.units.get(inst.unitId).tasks[inst.taskId]

            if(curDef == null || JSON.stringify(inst.def) != JSON.stringify(curDef))
                markInstance(inst, 'old')
        })
    }

    function unmarkOld(unitId) {
        getInstances(unitId).forEach(inst => {
            if(inst.marking == 'old')
                markInstance(inst, 'run')
        })
    }

    function getInstances(unitId) {
        return me.instances.list(inst => inst.unitId == unitId && inst.procState != 'stopped')
    }

    function markInstance (inst, marking) {
        me.instances.modify(inst.id, {marking})
    }

    function spawnInstance (unitId, taskId) {
        var def = me.units.get(unitId).tasks[taskId]

        var proc = me.host.run({
            name: unitId + '#' + taskId,
            run: [process.argv[0], Path.resolve(__dirname, '../bin/up-starter.js'), ...def.run],
            env: def.env,
            cwd: def.cwd
        })

        log('spawn', proc.name)

        var inst = me.instances.add({unitId, taskId, proc, def})

        handleAsync(proc.sigStart.then(() => me.instances.modify(inst, { procState: 'running' })))
        handleAsync(proc.sigExit.then(() => me.instances.modify(inst, { procState: 'stopped' })))

        me.instances.when(inst, inst => inst.marking == 'stop').then(() => {
            log('stop', proc.name)
            me.host.stop(proc)
        })

        return inst
    }

    function stopInstance (inst) {
        me.instances.modify(inst, {marking: 'stop'})
        return me.instances.when(inst, inst => inst.procState == 'stopped')
    }

    function stopInstances (list) {
        return Q.all(L.map(list, inst => stopInstance(inst)))
    }

    function awaitUp (inst) {
        return (
            me.instances.when(inst, inst => inst.procState == 'running')
            .then(() => RPC.whenPeer(me.client, peer => peer.attributes.origin.pid == inst.proc.handle.pid))
        )
    }
}

function InstanceStore () {
    this.store = Store({})
    this.idCount = 1

    initInstanceStore(this)
}

function initInstanceStore (me) {
    function getId (inst) {
        if(typeof inst == 'number') return inst
        if(typeof inst.id) return inst.id
        throw new Error(`invalid instance ${inst}`)
    }

    me.get = function (inst) {
        me.store.get(getId(inst))
    }

    me.list = function (pred) {
        return L.filter(this.store.get(), pred)
    }

    me.modify = function (inst, mod) {
        me.store.update(getId(inst), state =>
            typeof mod == 'function' ? mod(state) : {...state, ...mod})
    }

    me.watch = function (inst) {
        return me.store.stream(getId(inst))
    }

    me.when = function (inst, pred) {
        return whenStream(me.watch(inst), pred)
    }

    me.add = function (inst) {
        inst.id = me.idCount ++
        me.store.set(inst.id, inst)
        return inst
    }
}

function ProcessHost () {
    this.processes = []
    this.idCount = 1

    initHost(this)
}

function logHost (...args) {
    console.log('[host]', ...args)
}

function initHost (host) {
    function procLog (prefix, data) {
        var lines = data.toString().split('\n')
        if(L.last(lines) == '') lines.pop()
        logHost(lines.map(l => prefix + l).join('\n'))
    }

    host.run = function (params) {
        var proc = CP.spawn(
            params.run[0], params.run.slice(1),
            { env: params.env || {}, cwd: params.cwd })

        var name = `${params.name} (${proc.pid})`

        proc.stdout.on('data', d => procLog(name + ': ', d))
        proc.stderr.on('data', d => procLog(name + '! ', d))

        var sigStart = whenStream(
            K.merge([
                K.later(100, 'ok'),
                K.fromEvents(proc, 'error').valuesToErrors(),
                K.fromEvents(proc, 'exit', code => {exited: code}).valuesToErrors(),
            ])
        )

        var sigExit = Q.Promise(function (resolve) {
            K.fromEvents(proc, 'exit').take(1).onValue(resolve)
            sigStart.catch(resolve)
        })

        var desc = {
            id: host.idCount ++,
            handle: proc,
            name,
            params,
            sigStart,
            sigExit,
            inspect: function () { return '<process ' + proc.pid + '>' },
        }

        host.processes.push(desc)

        return desc
    }

    host.stop = function (desc) {
        desc.handle.kill()
    }
}
