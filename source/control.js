import Q from 'Q'
import _ from 'lodash'
import * as  RPC from './rpc'
import {inspect} from 'util'


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

    me.status     = () =>            request('status')
    me.setUnit    = (unitId, def) => request('set-unit', unitId, def)
    me.updateUnit = (unitId) =>      request('update-unit', unitId)
    me.removeUnit = (unitId) =>      request('remove-unit', unitId)
    me.close      = () => me.client.close()

    function request (...args) {
        return Q.Promise((resolve, reject) =>
            me.client.requestTo(runner, args, msg => {
                var [status, response] = msg.response
                if(status == 'ok') resolve(msg.response[1])
                if(status == 'err') reject(inspect(msg.response[1]))
                reject(new Error('unrecognized response ' + inspect(msg)))
            }))
    }
}

