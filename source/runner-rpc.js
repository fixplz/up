import L from 'lodash'
import * as RPC from 'up/rpc'
import go from 'up/util/go'

let runnerMethods = ['status', 'updateApp', 'removeApp']

export async function getController ({client, name, log} = {}) {
  if(client == null)
    client = await RPC.connect({name: name || 'Controller', log})

  let runner = L.find(client.peers, { name: 'Runner' })

  if(runner == null)
    throw new Error('runner not found')

  let request = (...args) =>
    RPC.request(client, runner, ...args)

  let methods = L.object(runnerMethods,
    L.map(runnerMethods, k => L.partial(request, k)))

  return {
    client,
    runner,
    request,
    ...methods,
    close: () => client.close(),
  }
}

export function wrapRunner (runner, _log = () => {}) {
  let log = (...args) => _log('[rpc]', ...args)

  let methods = L.object(runnerMethods,
    L.map(runnerMethods, k => ::runner[k]))

  runner.client.on('request', ({from, request, respond}) => {
    var [func, ...params] = request

    log('request', func, params, 'from', from.name, from.id)

    go(async () => {
      try {
        let result = await methods[func](...params)
        respond(['ok', result])
        log(func, 'ok')
      }
      catch(err) {
        respond(['err', {error: 'failed'}])
        log('!!!', func, 'error')
        log(err.stack)
      }
    })
  })

  log('ready')
}
