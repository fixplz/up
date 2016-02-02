import Path from 'path'
import L from 'lodash'
import K from 'kefir'

import {wrapRunner} from 'up/runner-rpc'
import ProcessHost from 'up/process-host'
import go from 'up/util/go'

import watch from 'mini-store/watch-kefir'
import {whenStream} from 'async-helper/kefir'
import Store from 'mini-store/store'
import Tree from 'mini-store/tree'
import TreeStore from 'mini-store/tree-store'


function respondOk (message) {
  return { success: true, message }
}

function respondFail (message) {
  return { success: false, message }
}

export class Runner {
  constructor (client, persist = {get(){}, put(){}}, log = () => {}) {
    this.log = (...args) => log('[up]', ...args)
    this.client = client
    this.host = new ProcessHost({log})

    var init = new Tree({apps:
      new Tree(L.mapValues(persist.get(), it => new Tree({tasks: it.tasks})))})

    this.store = new TreeStore(new Store(init))

    this.apps = this.store.at('apps')
    this.instances = this.store.at('instances')
    this.instanceCount = this.store.at('instanceCount')
    this.instanceCount.set(1)

    watch(this.apps).onValue(state => state && persist.put(state))

    L.each(this.apps.get(), (app, appId) =>
      this.deployApp(appId))

    wrapRunner(this, log)
  }

  status () {
    return L.map(this.apps.get(), (app, appId) => {
      return app && {
        appId,
        state: app.state,
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
    let status = await this.deployApp(appId)

    if(status == null)
      return respondFail(`failed to launch, reverted`)
    else  {
      let [started, stopped] = status
      return respondOk(
        [ ...L.map(started, inst => `started ${inst.proc.name}`),
          ...L.map(stopped, inst => `stopped ${inst.proc.name}`)].join('\n')
        || 'nothing to do')
    }
  }

  async removeApp (appId) {
    this.apps.at(appId).remove()
    await this.stopAll(this.liveInstancesForApp(appId))
    return respondOk('removed app')
  }

  async deployApp (appId) {
    var tasks = this.apps.at(appId).get().tasks

    this.apps.at(appId).modify(it => ({ ...it, state: 'updating' }))

    var [oldInstances, liveInstances] =
      L.partition(this.liveInstancesForApp(appId),
        inst => JSON.stringify(inst.def) != JSON.stringify(tasks[inst.taskId]))

    var newInstances =
      L.reject(L.keys(tasks), taskId => L.find(liveInstances, {taskId}))
        .map(taskId => this.startInstance(appId, taskId))

    if(await this.whenAllUp(newInstances)) {
      await this.stopAll(oldInstances)
      this.apps.at(appId).modify(it => ({...it, state: 'ok'}))
      return [newInstances, oldInstances]
    }
    else {
      await this.stopAll(newInstances)
      this.apps.at(appId).modify(it => ({...it, state: 'reverted'}))
      return null
    }
  }

  startInstance (appId, taskId) {
    var def = this.apps.at(appId).get().tasks[taskId]

    var proc = this.host.run({
      name: appId + '#' + taskId,
      run: [
        Path.resolve(__dirname, './cmd/up-proc.js'),
        ...def.run
      ],
      env: def.env,
      cwd: def.cwd
    })

    this.log('start', proc.name)

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
    go(async () => {
      await whenStream(K.fromEvents(this.client, 'cast:up'),
        ev => ev.from.attributes.origin.pid == this.instances.at(instId).get().proc.pid)

      this.instances.at(instId).modify(it => ({...it, procState: 'up'}))
    })

    go(async () => {
      await whenStream(
        watch(this.instances.at(instId)),
        inst => inst.marking == 'stop')
      this.log('stop', proc.name)
      this.host.stop(proc)
    })

    go(async () => {
      let exited = await proc.exited
      this.log('exited', proc.name, exited)
      this.instances.at(instId).modify(it => ({...it, procState: 'stopped'}))
    })

    go(async () => {
      await whenStream(watch(this.instances.at(instId)),
        inst => inst.procState == 'stopped' && inst.marking == 'run')
      this.instances.at(instId).modify(it => ({...it, marking: 'invalid'}))
      let inst = this.instances.at(instId).get()
      this.startInstance(inst.appId, inst.taskId)
    })
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
