import Path from 'path'
import L from 'lodash'
import Q from 'q'
import K from 'kefir'

import * as RPC from './rpc'
import {whenStream, go} from './util/async'
import RunnerState from './state'
import ProcessHost from './process-host'


export async function startDaemon () {
    return initRunnerRPC(await RPC.host())
}

function log (...args) {
    console.log('[up]', ...args)
}

function initRunnerRPC (hub) {
    hub.on('error', err => log(err.stack || err))

    var client = RPC.connectLocally(hub, { name: 'Runner' })
    var runner = new Runner(client)

    var calls = {
        'status-all':  () => runner.statusAll(),
        'status-unit': (unitId) => runner.statusUnit(unitId),
        'set-unit':    (unitId, tasks) => runner.setUnit(unitId, tasks),
        'update-unit': (unitId) => runner.updateUnit(unitId),
        'remove-unit': (unitId) => runner.removeUnit(unitId),
    }

    client.on('request', ({from, request, respond}) => {
        var [func, ...params] = request

        log('request', func, params, 'from', from.name, from.id)

        go(async () => {
            try {
                let result = await calls[func](...params)
                respond(['ok', result])
                log(func, 'ok')
            }
            catch(err) {
                respond(['err', {error: 'failed'}])
                log('!!!', func, 'error')
                log(err.stack)
            }
        })
    })

    log('ready')

}


class Runner {
    constructor (client) {
        this.client = client
        this.host = new ProcessHost()
        this.state = new RunnerState()
    }

    statusAll () {
        return L.map(this.state.getUnits(), (unit, unitId) => {
            var instances = this.state.getLiveInstancesForUnit(unitId)
            return {
                unitId,
                tasks: L.keys(unit.tasks),
                instances: instances.map(inst => ({taskId: inst.taskId, pid: inst.proc.pid}))
            }
        })
    }

    statusUnit (unitId) {
        var unit = this.state.getUnit(unitId)

        if(unit == null)
            return null

        return {
            unitId,
            tasks: unit.tasks,
            instances: this.state.getLiveInstancesForUnit(unitId).map(inst => {
                var {proc: {pid, name}} = inst
                return {...inst, proc: {pid, name}}
            })
        }
    }

    setUnit (unitId, tasks) {
        this.state.putUnit(unitId, { tasks })
        this.markOld(unitId)
    }

    async updateUnit (unitId) {
        var unitInstances = this.state.getLiveInstancesForUnit(unitId)

        var oldInstances = unitInstances.filter(inst => inst.marking == 'old' )

        var newInstances = []

        L.each(this.state.getUnit(unitId).tasks, (_, taskId) => {
            var taskInsts = unitInstances.filter(inst => inst.taskId == taskId)

            var needUpdate = taskInsts.length == 0 || L.all(taskInsts, inst => inst.marking == 'old')

            if(needUpdate)
                newInstances.push(this.startInstance(unitId, taskId))
        })

        if(newInstances.length == 0 && oldInstances.length == 0) {
            log('nothing to do')
            return {
                action: 'update',
                success: true,
                message: 'nothing to update'
            }
        }

        if(await this.whenAllUp(newInstances)) {
            await this.stopInstances(oldInstances)
            return {
                action: 'update',
                success: true,
                message: `updated instances: ${showInstances(newInstances)}, stopped instances: ${showInstances(oldInstances)}`,
            }
        }
        else {
            this.unmarkOld()
            await this.stopInstances(newInstances)
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

    async removeUnit (unitId) {
        this.state.putUnit(unitId, null)
        await this.stopInstances(this.state.getLiveInstancesForUnit(unitId))
        return {
            action: 'remove',
            success: true,
            message: 'removed unit',
        }
    }

    markOld (unitId) {
        this.state.getLiveInstancesForUnit(unitId).forEach(inst => {
            if(instNeedsReload(inst.def, this.state.getUnit(inst.unitId).tasks[inst.taskId]))
                this.state.markInstance(inst.id, 'old')
        })

        function instNeedsReload (last, cur) {
            return cur == null || JSON.stringify(last) != JSON.stringify(cur)
        }
    }

    unmarkOld (unitId) {
        this.state.getLiveInstancesForUnit(unitId).forEach(inst => {
            if(inst.marking == 'old')
                this.state.markInstance(inst.id, 'run')
        })
    }

    startInstance (unitId, taskId) {
        var def = this.state.getUnit(unitId).tasks[taskId]

        var proc = this.host.run({
            name: unitId + '#' + taskId,
            run: [
                process.argv[0],
                Path.resolve(__dirname, './cmd/up-run.js'),
                Path.resolve(__dirname, './process-wrapper.js'),
                ...def.run
            ],
            env: def.env,
            cwd: def.cwd
        })

        log('start', proc.name)

        var inst = this.state.addInstance({
            unitId,
            taskId,
            proc,
            def,
            procState: 'running',
        })

        this.trackInstance(inst.id, proc)

        return inst
    }

    trackInstance (instId, proc) {
        go(async () => {
            await whenStream(this.state.watchInstance(instId), inst => inst.marking == 'stop')
            log('stop', proc.name)
            this.host.stop(proc)
        })

        go(async () => {
            await proc.exited
            this.state.modifyInstance(instId, state => ({ ...state, procState: 'stopped' }))
        })
    }

    stopInstance (instId) {
        this.state.markInstance(instId, 'stop')
        return whenStream(this.state.watchInstance(instId), inst => inst.procState == 'stopped')
    }

    stopInstances (list) {
        return Q.all(list.map(inst => this.stopInstance(inst.id)))
    }

    whenUp (inst) {
        var up =
            K.fromEvents(this.client, 'cast:up')
                .filter(peer => peer.attributes.origin.pid == inst.proc.pid)

        var stopped =
            this.state.watchInstance(inst.id)
                .filter(inst => inst.procState == 'stopped')

        return whenStream(K.merge([
            up.map(() => true),
            stopped.map(() => false)
        ]))
    }

    async whenAllUp (list) {
        return L.all(await Q.all(list.map(::this.whenUp)))
    }
}
