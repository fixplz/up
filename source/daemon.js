import Path from 'path'
import L from 'lodash'
import Q from 'q'
import K from 'kefir'

import * as RPC from './rpc'
import ProcessHost from './process-host'

import watch from 'mini-store/watch-kefir'
import {whenStream, go} from './util/async'
import Store from 'mini-store/store'
import Tree from 'mini-store/tree'
import TreeStore from 'mini-store/tree-store'


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
        'status':  () => runner.status(),
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


function respondOk (message) {
    return { success: true, message }
}

function respondFail (message) {
    return { success: false, message }
}

class Runner {
    constructor (client) {
        this.client = client
        this.host = new ProcessHost()

        this.store = new TreeStore(new Store(new Tree({})))
        this.units = this.store.at('units')
        this.instances = this.store.at('instances')
        this.instanceCount = this.store.at('instanceCount')
        this.instanceCount.set(1)
    }

    status () {
        return L.map(this.units.get(), (unit, unitId) => {
            var instances = this.instancesForUnit(unitId)
            return {
                unitId,
                tasks: unit.tasks,
                instances: this.instancesForUnit(unitId).map(inst => {
                    var {unitId, taskId, proc, procState, marking, def} = inst
                    return {unitId, taskId, procState, marking, pid: proc.pid, run: def.run}
                }),
            }
        })
    }

    setUnit (unitId, tasks) {
        this.units.at(unitId).set({tasks})
    }

    async updateUnit (unitId) {
        var tasks = this.units.at(unitId).get().tasks

        var [oldInstances, liveInstances] =
            L.partition(this.liveInstancesForUnit(unitId), instanceNeedsReload)

        var newInstances =
            L.reject(L.keys(tasks), taskId => L.find(liveInstances, {taskId}))
                .map(taskId => this.startInstance(unitId, taskId))

        if(newInstances.length == 0 && oldInstances.length == 0) {
            log('nothing to do')
            return respondOk('nothing to update')
        }

        if(await this.whenAllUp(newInstances)) {
            await this.stopAll(oldInstances)
            return respondOk(`updated instances: ${showInstances(newInstances)}, stopped instances: ${showInstances(oldInstances)}`)
        }
        else {
            await this.stopAll(newInstances)
            return respondFail('failed to launch, reverted')
        }

        function instanceNeedsReload (inst) {
            return JSON.stringify(inst.def) != JSON.stringify(tasks[inst.taskId])
        }

        function showInstances (list) {
            return JSON.stringify(L.map(list, inst => inst.proc.name))
        }
    }

    async removeUnit (unitId) {
        this.units.at(unitId).set(null)
        await this.stopAll(this.liveInstancesForUnit(unitId))
        return respondOk('removed unit')
    }

    startInstance (unitId, taskId) {
        var def = this.units.at(unitId).get().tasks[taskId]

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

        var inst = {
            id: this.instanceCount.get(),
            unitId,
            taskId,
            proc,
            def,
            marking: 'run',
            procState: 'starting',
        }

        this.instanceCount.modify(count => count + 1)
        this.instances.at(inst.id).set(inst)

        this.trackInstance(inst.id, proc)

        return inst
    }

    trackInstance (instId, proc) {
        go(async () => {
            await whenStream(K.fromEvents(this.client, 'cast:up'),
                ev => ev.from.attributes.origin.pid == this.instances.at(instId).get().proc.pid)

            this.instances.at(instId).modify(it => ({...it, procState: 'up'}))
        })

        go(async () => {
            await whenStream(
                watch(this.instances.at(instId)),
                inst => inst.marking == 'stop')
            log('stop', proc.name)
            this.host.stop(proc)
        })

        go(async () => {
            await proc.exited
            this.instances.at(instId).modify(it => ({...it, procState: 'stopped'}))
        })
    }

    async stopInstance (instId) {
        this.instances.at(instId).modify(it => ({...it, marking: 'stop'}))
        await whenStream(
            watch(this.instances.at(instId)),
            inst => inst.procState == 'stopped')
    }

    async stopAll(list) {
        return Q.all(list.map(inst => this.stopInstance(inst.id)))
    }

    async whenUp (instId) {
        return whenStream(watch(this.instances.at(instId))
            .map(inst => {
                if(inst.procState == 'up')
                    return true
                if(inst.procState == 'stopped')
                    return false
            }).filter(val => val != null))
    }

    async whenAllUp(list) {
        return L.all(await Q.all(list.map(
            inst => this.whenUp(inst.id))))
    }

    instancesForUnit (unitId) {
        return L.filter(this.instances.get(),
            inst => inst.unitId == unitId)
    }

    liveInstancesForUnit (unitId) {
        return L.filter(this.instances.get(),
            inst => inst.unitId == unitId && inst.procState != 'stopped')
    }
}
