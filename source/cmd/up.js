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
import * as P from 'up/util/pretty'
import withController from 'up/util/with-controller'


if(argv._[0] == 'daemon') {
  require('../daemon').getDaemon({log: console.log})
}

else if(argv._[0] == 'status') {
  withController(async ctr => {
    console.log(P.title('peers'))
    console.log(P.table(ctr.client.peers, {}, {attributes: 50}))

    console.log(P.title('apps'))
    console.log(P.table(
      await ctr.status(),
      {instances: it =>
        P.table(it.map(({taskId, procState, pid, run}) =>
          ({taskId, state:procState, pid, run:run.join(' ')}))) },
      {tasks: 50}))
  })
}

else if(argv._[0] == 'app') {
  let [_, name, ...run] = argv._
  withController(async ctr => {
    let status = await ctr.updateApp(name, {
      cmd: {
        cwd: process.cwd(),
        run: run,
        env: { PATH: process.env.PATH },
      },
    })
    console.log(P.inspect(status))
  })
}

else if(argv._[0] == 'remove') {
  withController(async ctr => {
    let status = await ctr.removeApp(argv._[1])
    console.log(P.inspect(status))
  })
}

else {
  console.error('unknown command:', argv._[0])
  process.exit(1)
}
