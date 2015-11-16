#!/usr/bin/env up-run
import Up from 'up'
import Path from 'path'
import util from 'util'

let pp = obj => util.inspect(obj, {depth: null, colors: true})

async () => {
    var ctr = await Up.control.getController()
    try {
        await ctr.setUnit('test', {
            "test-x": {
                cwd: Path.resolve(__dirname),
                run: [Path.resolve(__dirname, 'test.js'), 'abc'],
                env: { PATH: process.env.PATH },
            },
            "test-y": {
                cwd: Path.resolve(__dirname),
                run: [Path.resolve(__dirname, 'test.js'), 'xyz'],
                env: { PATH: process.env.PATH },
            },
        })
        var status = await ctr.updateUnit('test')
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
}().done()

