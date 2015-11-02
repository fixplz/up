import Up from 'up'
import Path from 'path'
import {go} from 'up/util/async'

process.argv.splice(1, 1)

var target = Path.resolve(process.cwd(), process.argv[1])

async () => {
    var client = await Up.RPC.connect({
        name: 'Up-Node',
        attributes: { run: process.argv.slice(2) },
    })

    require(target)

    return client.sendEvent('up')
}().done()
