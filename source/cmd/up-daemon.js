#!/usr/bin/env up-run

let {argv} =
  require('yargs')
    .help('help')
    .example('$0 start')
    .example('$0 status')
    .demand(1, 'Specify command')

import Up from 'up'
import * as P from 'up/util/pretty'


let withController = async func => {
  let ctr
  try {
    ctr = await Up.control.getController()
    func(ctr)
  }
  finally {
    if(ctr != null)
      ctr.close()
  }
}


if(argv._[0] == 'start') {
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

else {
  console.error('unknown command:', argv._[0])
  process.exit(1)
}
