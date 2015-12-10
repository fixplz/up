import Up from 'up'
import L from 'lodash'

if(process.argv[2] == 'nop') {
}
else if(process.argv[2] == 'wait') {
  process.stdin.resume()
}
else if(process.argv[2] == 'error') {
  throw new Error('error')
}
else if(process.argv[2] == 'error-later') {
  setTimeout(() => {
    throw new Error('error')
  }, 100)
}
else if(process.argv[2] == 'ping') {
  async () => {
    let peer = await Up.RPC.connect({ name: 'testApp'})
    let target = L.find(peer.peers, p => p.attributes.pingTarget)
    if(target == null) throw new Error('no target')
    setInterval(() => {
      peer.sendTo(target, 'ping')
    })
  }()
}
else {
  throw new Error('argument not given')
}
