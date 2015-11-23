import Up from 'up'
import Path from 'path'


async () => {
    var client = await Up.RPC.connect({
        name: 'Up-Node',
        attributes: { run: process.argv.slice() },
    })

    process.argv.splice(1, 1)

    require(Path.resolve(process.cwd(), process.argv[1]))

    return client.sendEvent('up')
}()
