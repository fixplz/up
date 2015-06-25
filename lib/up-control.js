import Q from 'Q'
import _ from 'lodash'
import * as  RPC from './up-rpc'


export function getController (opts) {
    if(opts == null) opts = {}

    return RPC.connect({name: opts.name || 'Controller', log: opts.log!=null ? opts.log : true})
        .then(client => new Controller(client))
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

    me.setUnit = function (unitId, def) {
        return getResponse(cb => me.client.requestTo(runner, ['set-unit', unitId, def], cb))
    }

    me.updateUnit = function (unitId) {
        return getResponse(cb => me.client.requestTo(runner, ['update-unit', unitId], cb))
    }

    me.close = function () {
        me.client.close()
    }
}

function getResponse (func) {
    return Q.Promise((resolve, reject) =>
        func((from, response) => {
            if(response[0] == 'ok') resolve(response[1])
            if(response[0] == 'err') reject(response[1])
            reject(new Error('unrecognized response ' + response[0]))
        }) )
}

