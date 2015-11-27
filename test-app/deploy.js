#!/usr/bin/env up-run
import Up from 'up'
import Path from 'path'
import util from 'util'

let pp = obj => util.inspect(obj, {depth: null, colors: true})

let exec = (cmd, ...args) => ({
    cwd: __dirname,
    run: [cmd, ...args],
    env: { PATH: process.env.PATH },
})

async () => {
    var ctr = await Up.control.getController()
    try {
        var status = await ctr.updateApp('test', {
            "test-x": exec('test.js', 'abc'),
            "test-y": exec('test.js', 'xyz'),
        })

        console.log('# updated')
        console.log(pp(status))
    }
    catch(err) {
        console.log('# error')
        console.log(err.stack || err)
    }
    finally {
        if(ctr)
            ctr.close()
    }
}()

