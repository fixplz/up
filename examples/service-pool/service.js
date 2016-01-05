import Up from 'up'
import go from 'up/util/go'

let [service, content] = process.argv.slice(2)

go(async () => {
  let rpc = await Up.RPC.connect({
    name: 'Service',
    attributes: {
      webService: service,
    }
  })
  rpc.on('request', ({from, request, respond}) => {
    if(request[0] == 'web') {
      setTimeout(() => {
        respond(content)
      }, Math.random() * 2000)
    }
  })
})
