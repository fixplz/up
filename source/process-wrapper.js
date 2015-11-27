import Up from 'up'
import Path from 'path'

process.argv.splice(1, 1)

async () => {
    var client = await Up.RPC.connect({
        name: 'Up-Node',
        attributes: { run: process.argv.slice() },
    })

    require(Path.resolve(process.cwd(), process.argv[1]))

    return client.sendEvent('up')
}()
