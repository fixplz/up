process.on('uncaughtException', err => {
  console.log('async error:')
  console.log(err.stack || err)
})

import Up from 'up'
import go from 'up/util/go'
import L from 'lodash'
import K from 'kefir'
import http from 'http'
import {whenStream} from 'async-helper/kefir'

go(async () => {
  let rpc = await Up.RPC.connect({name: 'Server'})

  let peers =
    K.fromEvents(rpc, 'peers')
      .toProperty(() => {})
      .map(() => rpc.peers)
      .debounce(100)

  let targets
  peers.onValue(list => {
    targets = L.filter(list, peer => peer.attributes.webService != null)
    console.log('services:', L.map(targets, it => it.attributes))
  })

  http.createServer(async (req, res) => {
    try {
      let parsed = getURLPrefix(req.url)

      if(parsed == null)
        throw new Error('invalid URL')

      let reqTargets =
        L.filter(targets, it => it.attributes.webService == parsed.target)

      if(reqTargets.length == 0)
        throw new Error('no services for request')

      let sendRequest = (target, func) =>
        rpc.requestTo(target, ['web', parsed.url], func)

      let sources = K.merge(
        L.map(L.shuffle(reqTargets),
          (val,ix) => K.later(ix * 500, val)))

      let result = await whenStream(K.merge([
        sources.ignoreValues().concat(K.later(3000, 'timeout')),
        sources.flatMap(target => K.stream(stream => sendRequest(target, res => stream.emit(res)))),
      ]))

      if(result == 'timeout')
        throw new Error('timeout')

      res.end(result.response)
    }
    catch(err) {
      console.log('error in request for ' + req.url + ':')
      console.log(err.stack || err)
      res.writeHead(404)
      res.end('no service available')
    }
  })
  .listen(8000)

  console.log('listening on port 8000')
})

function getURLPrefix (url) {
  let match = /^\/svc\/(.+?)([/?].*|)$/.exec(url)
  if(match == null || match[1] == null || match[2] == null)
    return null
  return {
    target: match[1],
    url: match[2],
  }
}
