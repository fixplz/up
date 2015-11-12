import Q from 'Q'
import _ from 'lodash'
import * as  RPC from './rpc'


export async function getController (opts = {}) {
    return new Controller(await RPC.connect({name: opts.name || 'Controller', log: opts.log}))
}

export function Controller (client) {
    this.client = client
    initController(this)
}

function initController (me) {
    var runner = _.find(me.client.peers, { name: 'Runner' })

    if(runner == null)
        throw new Error('runner not found')

    me.runner = runner

    me.statusAll  = () =>            getResponse(cb => me.client.requestTo(runner, ['status-all'], cb))
    me.statusUnit = (unitId) =>      getResponse(cb => me.client.requestTo(runner, ['status-unit', unitId], cb))
    me.setUnit    = (unitId, def) => getResponse(cb => me.client.requestTo(runner, ['set-unit', unitId, def], cb))
    me.updateUnit = (unitId) =>      getResponse(cb => me.client.requestTo(runner, ['update-unit', unitId], cb))
    me.close = () => me.client.close()
}

function getResponse (func) {
    return Q.Promise((resolve, reject) =>
        func(msg => {
            var [status, response] = msg.response
            if(status == 'ok') resolve(msg.response[1])
            if(status == 'err') reject(msg.response[1])
            reject(new Error('unrecognized response ' + msg))
        }) )
}

