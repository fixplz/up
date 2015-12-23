#!/usr/bin/env up-run

let {argv} =
  require('yargs')
    .help('help')
    .command('daemon')
    .command('status')
    .command('app')
    .command('remove')
    .demand(1, 'Specify command')

import Up from 'up'
import * as R from 'up/util/report'
import withController from 'up/util/with-controller'


let Commands = {
daemon() {
  let {Runner} = require('../daemon')

  let log = console.log

  async () => {
    let hub = await Up.RPC.host()
    hub.on('error', err => log(err.stack || err))

    log('starting')
    let client = await Up.RPC.connectLocally(hub, { name: 'Runner' })
    let runner = new Runner(client, Up.FS.persist, log)

    process.on('uncaughtException', err => log('!!!', err.stack))
  }()
},
status() {
  withController(async ctr => {
    R.title('peers')
    R.log(peerTable(ctr.client.peers))

    R.title('apps')
    R.log(instanceTable(await ctr.status()))
  })

  function peerTable (peers) {
    return R.formatTable(peers, {}, {attributes: 50})
  }

  function instanceTable (instances) {
    return R.formatTable(
      instances,
      {instances: it =>
        R.formatTable(it.map(({taskId, procState, pid, run}) =>
          ({taskId, state: procState, pid, run: run.join(' ')}))) },
      {tasks: 50}
    )
  }
},
app(app, ...command) {
  withController(async ctr => {
    let config = {
      cmd: {
        cwd: process.cwd(),
        run: command,
        env: { PATH: process.env.PATH },
      },
    }
    R.title(`update ${app}`)
    R.status(await ctr.updateApp(app, config))
  })
},
remove(app) {
  withController(async ctr => {
    R.title(`remove ${app}`)
    R.status(await ctr.removeApp(app))
  })
},
}

if(Commands[argv._[0]] == null) {
  console.error('unknown command:', argv._[0])
  process.exit(1)
}
else {
  Commands[argv._[0]](...argv._.slice(1))
}
