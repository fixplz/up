#!/usr/bin/env up-run
import Up from 'up'
import util from 'util'

let pp = obj => util.inspect(obj, {depth: null, colors: true})

async () => {
  try {
    var ctr = await Up.control.getController()

    console.log('# rpc peers')
    console.log(pp(ctr.client.peers))

    console.log('# status')
    console.log(pp(await ctr.status()))
  }
  finally {
    if(ctr)
      await ctr.close()
  }
}().done()
