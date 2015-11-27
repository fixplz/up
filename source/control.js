import _ from 'lodash'
import * as  RPC from './rpc'
import {inspect} from 'util'


export async function getController (opts = {}) {
    return new Controller(await RPC.connect({name: opts.name || 'Controller', log: opts.log}))
}

export class Controller {
    constructor (client) {
        this.client = client

        this.runner = _.find(this.client.peers, { name: 'Runner' })

        if(this.runner == null)
            throw new Error('runner not found')

        let request = (...args) =>
            new Promise((resolve, reject) =>
                this.client.requestTo(this.runner, args, msg => {
                    var [status, response] = msg.response
                    if(status == 'ok') resolve(msg.response[1])
                    if(status == 'err') reject(inspect(msg.response[1]))
                    reject(new Error('unrecognized response ' + inspect(msg)))
                }))

        this.status     = () =>            request('status')
        this.updateApp  = (appId, def) =>  request('updateApp', appId, def)
        this.removeApp  = (appId) =>       request('removeApp', appId)
        this.close      = () => this.client.close()
    }
}
