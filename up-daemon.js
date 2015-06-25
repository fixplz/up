import FS from 'fs'
import CP from 'child_process'
import Path from 'path'
import _ from 'lodash'
import Q from 'q'
import K from 'kefir'

import * as RPC from './lib/up-rpc'
import * as Wait from './lib/wait'


export function startDaemon () {
    return RPC.host({log: true}).then(hub => new RunnerRPC(hub))
}


function RunnerRPC (hub) {
    this.client = RPC.connectLocally(hub, { name: 'Runner', log: true })
    this.runner = new ProcessRunner(this.client)

    initRunnerRPC(this)
}

function initRunnerRPC (me) {
    me.client.on('request', (from, req, cb) => {
        var func = rpcMethods[req[0]]
        var params = req.slice(1)

        Q.try(() => func.apply(null, params))
        .then(result => cb(['ok', result]))
        .catch(err => {
            console.log(err.stack)
            cb(['err', {error: 'failed'}])
        })
        .done()
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
    this.units = Object.create(null)
    this.instances = []

    initRunner(this)
}

function initRunner (me) {

    me.setUnit = function (unitId, tasks) {
        me.units[unitId] = {
            tasks: _.mapValues(tasks, task => JSON.stringify(task))
        }

        me.markOld(unitId)
    }

    me.updateUnit = function (unitId) {
        var unitInstances = me.getInstances(unitId)

        var batch = []

        _.each(me.units[unitId].tasks, (_, taskId) => {
            var prevInst = me.getTaskInstances(unitId, taskId)[0]

            var needReload = prevInst == null || (prevInst != null && prevInst.marking == 'old')
            if(! needReload) return

            var inst = newInstance(unitId, taskId)
            batch.push(inst)
            me.instances.push(inst)
        })

        if(batch.length == 0) {
            return {
                action: 'update',
                success: false,
                status: 'no action taken',
                message: 'nothing to update'
            }
        }

        return Q.all(_.map(batch, inst =>
            inst.process.sigStart.then(() => awaitUp(inst))
        ))
            .then(() =>
                me.clearOld(unitId).then(() => ({
                    action: 'update',
                    success: true,
                    status: 'updated old instances',
                    message: 'updated instances: ' + JSON.stringify(_.map(batch, inst => inst.unitId + '#' + inst.taskId)),
                }) ))
            .catch(err => stopInstances(batch).then(() => ({
                action: 'update',
                success: false,
                status: 'rolled back',
                message: 'error: ' + err.message,
            }) ))
    }

    me.clearOld = function (unitId) {
        return stopInstances(
            _.filter(me.getInstances(unitId), { procState: 'running', marking: 'old' }))
    }

    me.markOld = function (unitId) {
        _.each(me.getInstances(unitId), inst => {
            var tasks = me.units[inst.unitId] && me.units[inst.unitId].tasks
            var taskSrc = tasks && tasks[inst.taskId]

            if(taskSrc == null || inst.src != taskSrc) {
                inst.marking = 'old'
            }
        })
    }

    me.getInstances = function (unitId) {
        return _.filter(me.instances, inst =>
            inst.unitId == unitId && inst.procState != 'stopped')
    }

    me.getTaskInstances = function (unitId, taskId) {
        return _.filter(me.instances, inst =>
            inst.unitId == unitId
            && inst.taskId == taskId
            && inst.procState != 'stopped' )
    }

    function newInstance (unitId, taskId) {
        var src = me.units[unitId].tasks[taskId]

        var inst = {
            unitId: unitId,
            taskId: taskId,
            src: src,
            time: Date.now(),
            marking: 'run',
            procState: 'running',
            appState: '?',
            process: execInstance(unitId + '#' + taskId, src),
        }

        inst.process.sigExit.then(() => inst.procState = 'stopped')

        return inst
    }

    function stopInstance (inst) {
        inst.marking = 'stop'
        me.host.stop(inst.process)
        return inst.process.sigExit
    }

    function stopInstances (list) {
        return Q.all(_.map(list, inst => stopInstance(inst)))
    }

    function execInstance (label, task) {
        if(typeof task == 'string') task = JSON.parse(task)

        return me.host.run({
            label: label,
            run: [process.argv[0], __dirname + '/up-starter.js'].concat(task.run),
            env: task.env,
            cwd: task.cwd
        })
    }

    function awaitUp (inst) {
        return Wait.whenStream(
            RPC.watchPeer(me.client, peer => getPeerPid(peer) == inst.process.handle.pid ),
            val => val != null)

        function getPeerPid (peer) {
            var match = /#(\d+)$/.exec(peer.attributes.origin)
            return match && match[1]
        }
    }
}

function ProcessHost () {
    this.processes = []
    this.idCount = 1

    initHost(this)
}

function initHost (host) {
    host.run = function (params) {
        var proc = CP.spawn(
            params.run[0], params.run.slice(1),
            { env: params.env || {}, cwd: params.cwd })

        proc.stdout.on('data', d => process.stdout.write('[host] ' + params.label + ': ' + d))
        proc.stderr.on('data', d => process.stdout.write('[host] ' + params.label + '! ' + d))

        var sigStart = Q.Promise((resolve, reject) => {
            K.merge([
                K.later(100, 'ok'),
                K.fromEvents(proc, 'error'),
                K.fromEvents(proc, 'exit', code => {exited: code})
                ]).take(1)
            .onValue(val => {
                if(val == 'ok') resolve()
                else reject(val)
            })
        })

        var sigExit = Q.Promise(function (resolve) {
            K.fromEvents(proc, 'exit').take(1).onValue(resolve)
            sigStart.catch(resolve)
        })

        var desc = {
            id: host.idCount ++,
            params: params,
            handle: proc,
            sigStart: sigStart,
            sigExit: sigExit,
            inspect: function () { return '<process ' + proc.pid + '>' },
        }

        host.processes.push(desc)

        return desc
    }

    host.stop = function (desc) {
        desc.handle.kill()
    }
}
