import Path from 'path'
import L from 'lodash'
import K from 'kefir'

import * as RPC from './rpc'
import ProcessHost from './process-host'

import watch from 'mini-store/watch-kefir'
import {whenStream} from 'async-helper/kefir'
import Store from 'mini-store/store'
import Tree from 'mini-store/tree'
import TreeStore from 'mini-store/tree-store'


export async function startDaemon () {
    process.on('uncaughtException', err => log('!!!', err.stack))
    return initRunnerRPC(await RPC.host())
}

function log (...args) {
    console.log('[up]', ...args)
}

export function initRunnerRPC (hub) {
    hub.on('error', err => log(err.stack || err))

    var client = RPC.connectLocally(hub, { name: 'Runner' })
    var runner = new Runner(client)

    var calls = {
        'status':    () => runner.status(),
        'updateApp': (appId, tasks) => runner.updateApp(appId, tasks),
        'removeApp': (appId) => runner.removeApp(appId),
    }

    client.on('request', ({from, request, respond}) => {
        var [func, ...params] = request

        log('request', func, params, 'from', from.name, from.id)

        async () => {
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
        }()
    })

    log('ready')
}


function respondOk (message) {
    return { success: true, message }
}

function respondFail (message) {
    return { success: false, message }
}

export class Runner {
    constructor (client) {
        this.client = client
        this.host = new ProcessHost()

        this.store = new TreeStore(new Store(new Tree({})))
        this.apps = this.store.at('apps')
        this.instances = this.store.at('instances')
        this.instanceCount = this.store.at('instanceCount')
        this.instanceCount.set(1)
    }

    status () {
        return L.map(this.apps.get(), (app, appId) => {
            return {
                appId,
                tasks: app.tasks,
                instances: this.instancesForApp(appId).map(inst => {
                    var {appId, taskId, proc, procState, marking, def} = inst
                    return {appId, taskId, procState, marking, pid: proc.pid, run: def.run}
                }),
            }
        })
    }

    async updateApp (appId, tasks) {
        this.apps.at(appId).set({tasks})

        var [oldInstances, liveInstances] =
            L.partition(this.liveInstancesForApp(appId), instanceNeedsReload)

        var newInstances =
            L.reject(L.keys(tasks), taskId => L.find(liveInstances, {taskId}))
                .map(taskId => this.startInstance(appId, taskId))

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

    async removeApp (appId) {
        this.apps.at(appId).set(null)
        await this.stopAll(this.liveInstancesForApp(appId))
        return respondOk('removed app')
    }

    startInstance (appId, taskId) {
        var def = this.apps.at(appId).get().tasks[taskId]

        var proc = this.host.run({
            name: appId + '#' + taskId,
            run: [
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
            appId,
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
        async () => {
            await whenStream(K.fromEvents(this.client, 'cast:up'),
                ev => ev.from.attributes.origin.pid == this.instances.at(instId).get().proc.pid)

            this.instances.at(instId).modify(it => ({...it, procState: 'up'}))
        }()

        async () => {
            await whenStream(
                watch(this.instances.at(instId)),
                inst => inst.marking == 'stop')
            log('stop', proc.name)
            this.host.stop(proc)
        }()

        async () => {
            await proc.exited
            this.instances.at(instId).modify(it => ({...it, procState: 'stopped'}))
        }()
    }

    async stopInstance (instId) {
        this.instances.at(instId).modify(it => ({...it, marking: 'stop'}))
        await whenStream(
            watch(this.instances.at(instId)),
            inst => inst.procState == 'stopped')
    }

    async stopAll(list) {
        return Promise.all(list.map(inst => this.stopInstance(inst.id)))
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
        return L.all(await Promise.all(list.map(
            inst => this.whenUp(inst.id))))
    }

    instancesForApp (appId) {
        return L.filter(this.instances.get(), inst => inst.appId == appId)
    }

    liveInstancesForApp (appId) {
        return L.filter(this.instancesForApp(appId), inst => inst.procState != 'stopped')
    }
}
