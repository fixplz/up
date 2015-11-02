import FS from 'fs'
import CP from 'child_process'
import Path from 'path'
import L from 'lodash'
import Q from 'q'
import K from 'kefir'

import * as RPC from './up-rpc'
import {whenStream, go} from './util/async'
import Store from 'mini-store'
import watchStore from 'mini-store/watch-kefir'


export async function startDaemon () {
    return new RunnerRPC(await RPC.host())
}

function log (...args) {
    console.log('[up]', ...args)
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

        go(
            Q.try(() => rpcMethods[func].apply(null, params))
            .then(
                result => {
                    cb(['ok', result])
                    log(func, 'ok')
                },
                err => {
                    cb(['err', {error: 'failed'}])
                    log('!!!', func, 'error')
                    log(err.stack)
                }))
    })

    var rpcMethods = {
        'status-all': () => me.runner.statusAll(),
        'status-unit': (unitId) => me.runner.statusUnit(unitId),
        'set-unit': (unitId, tasks) => me.runner.setUnit(unitId, tasks),
        'update-unit': (unitId) => me.runner.updateUnit(unitId),
        'remove-unit': (unitId) => me.runner.removeUnit(unitId),
    }
}


function ProcessRunner (client) {
    this.client = client
    this.host = new ProcessHost()
    this.units = new Store({})
    this.instances = new Store({})

    initRunner(this)
}

function initRunner (me) {

    function getUnits () {
        return me.units.get()
    }

    function getUnit (unitId) {
        return me.units.get()[unitId]
    }

    function putUnit (unitId, def) {
        me.units.modify(state => ({ ...state, [unitId]: def }))
    }

    function getInstances () {
        return me.instances.get()
    }

    function modifyInstance (instId, func) {
        me.instances.modify(state => ({ ...state, [instId]: func(state[instId]) }))
    }

    function markInstance (instId, marking) {
        modifyInstance(instId, state => ({ ...state, marking }))
    }

    function watchInstance (instId) {
        return watchStore(me.instances).map(state => state[instId])
    }

    function getLiveInstancesForUnit (unitId) {
        return L.filter(getInstances(),
            inst => inst.unitId == unitId && inst.procState != 'stopped')
    }

    var instanceCount = 1

    function addInstance (inst) {
        inst.id = instanceCount ++
        me.instances.modify(state => ({ ...state, [inst.id]: inst }))
        return inst
    }

    me.statusAll = function () {
        return L.map(getUnits(), (unit, unitId) => {
            var instances = getLiveInstancesForUnit(unitId)
            return {
                unitId,
                tasks: L.keys(unit.tasks),
                instances: instances.map(inst => ({taskId: inst.taskId, pid: inst.proc.pid}))
            }
        })
    }

    me.statusUnit = function (unitId) {
        var unit = getUnit(unitId)

        if(unit == null)
            return null

        return {
            unitId,
            tasks: unit.tasks,
            instances: getLiveInstancesForUnit(unitId).map(inst => {
                var {proc: {pid, name}} = inst
                return {...inst, proc: {pid, name}}
            })
        }
    }

    me.setUnit = function (unitId, tasks) {
        putUnit(unitId, { tasks })
        markOld(unitId)
    }

    me.updateUnit = async function (unitId) {
        var unitInstances = getLiveInstancesForUnit(unitId)

        var oldInstances = unitInstances.filter(inst => inst.marking == 'old' )

        var newInstances = []

        L.each(getUnit(unitId).tasks, (_, taskId) => {
            var taskInsts = unitInstances.filter(inst => inst.taskId == taskId)

            var needUpdate = taskInsts.length == 0 || L.all(taskInsts, inst => inst.marking == 'old')

            if(needUpdate)
                newInstances.push(startInstance(unitId, taskId))
        })

        if(newInstances.length == 0 && oldInstances.length == 0) {
            log('nothing to do')
            return {
                action: 'update',
                success: true,
                message: 'nothing to update'
            }
        }

        if(await whenAllUp(newInstances)) {
            await stopInstances(oldInstances)
            return {
                action: 'update',
                success: true,
                message: `updated instances: ${showInstances(newInstances)}, stopped instances: ${showInstances(oldInstances)}`,
            }
        }
        else {
            unmarkOld()
            await stopInstances(newInstances)
            return {
                action: 'update',
                success: false,
                message: 'failed to launch, reverted',
            }
        }

        function showInstances (list) {
            return JSON.stringify(L.map(list, inst => inst.proc.name))
        }
    }

    me.removeUnit = async function (unitId) {
        putUnit(unitId, null)
        await stopInstances(getLiveInstancesForUnit(unitId))
        return {
            action: 'remove',
            success: true,
            message: 'removed unit',
        }
    }

    function markOld(unitId) {
        getLiveInstancesForUnit(unitId).forEach(inst => {
            if(instNeedsReload(inst.def, getUnit(inst.unitId).tasks[inst.taskId]))
                markInstance(inst.id, 'old')
        })

        function instNeedsReload (last, cur) {
            return cur == null || JSON.stringify(last) != JSON.stringify(cur)
        }
    }

    function unmarkOld(unitId) {
        getLiveInstancesForUnit(unitId).forEach(inst => {
            if(inst.marking == 'old')
                markInstance(inst.id, 'run')
        })
    }

    function startInstance (unitId, taskId) {
        var def = getUnit(unitId).tasks[taskId]

        var proc = me.host.run({
            name: unitId + '#' + taskId,
            run: [
                process.argv[0],
                Path.resolve(__dirname, './cmd/up-run.js'),
                Path.resolve(__dirname, './up-starter.js'),
                ...def.run
            ],
            env: def.env,
            cwd: def.cwd
        })

        log('start', proc.name)

        var inst = addInstance({
            unitId,
            taskId,
            proc,
            def,
            procState: 'running',
        })

        trackInstance(inst.id, proc)

        return inst
    }

    function trackInstance (instId, proc) {
        go(async () => {
            await whenStream(watchInstance(instId), inst => inst.marking == 'stop')
            log('stop', proc.name)
            me.host.stop(proc)
        })

        go(async () => {
            await proc.exited
            modifyInstance(instId, state => ({ ...state, procState: 'stopped' }))
        })
    }

    function stopInstance (inst) {
        markInstance(inst.id, 'stop')
        return whenStream(watchInstance(inst.id), inst => inst.procState == 'stopped')
    }

    function stopInstances (list) {
        return Q.all(L.map(list, inst => stopInstance(inst)))
    }

    function whenUp (inst) {
        var up =
            K.fromEvents(me.client, 'cast:up')
                .filter(peer => peer.attributes.origin.pid == inst.proc.pid)

        var stopped =
            watchInstance(inst.id)
                .filter(inst => inst.procState == 'stopped')

        return whenStream(K.merge([
            up.map(() => true),
            stopped.map(() => false)
        ]))
    }

    async function whenAllUp (list) {
        return L.all(await Q.all(list.map(whenUp)))
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

        var exited = whenStream(K.merge([
            K.fromEvents(proc, 'error', error => ({error})),
            K.fromEvents(proc, 'exit', exited => ({exited}))
        ]))

        var desc = {
            id: host.idCount ++,
            handle: proc,
            pid: proc.pid,
            name,
            params,
            exited,
            inspect: function () { return '<process ' + proc.pid + '>' },
        }

        host.processes.push(desc)

        return desc
    }

    host.stop = function (desc) {
        desc.handle.kill()
    }
}
