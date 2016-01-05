import Up from 'up'
import Path from 'path'
import go from 'up/util/go'

process.argv.splice(1, 1)

go(async () => {
  var client = await Up.RPC.connect({
    name: 'Up-Node',
    attributes: { run: process.argv.slice() },
  })

  require(Path.resolve(process.cwd(), process.argv[1]))

  return client.sendEvent('up')
})
