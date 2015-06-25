import Q from 'q'
import K from 'kefir'
import _ from 'lodash'
import Sock from './sock'
import RPCHub from './rpc-hub'

var sockpath = '/up/hub'


export function host(hubOpts) {
    return Sock.createServer({path: sockpath}).then(server => {
        var hub = new RPCHub.Hub(server)
        if(hubOpts && hubOpts.log) log(hub)
        return hub
    })
}

export function connect(clientOpts) {
    return Sock.openSocket({path: sockpath, reconnect: true}).then(sock => {
        var client = new RPCHub.Client(sock, clientOpts)
        if(clientOpts && clientOpts.log) log(client)

        return K.merge([
            K.fromEvents(client, 'peers').map(() => client),
            K.fromEvents(client, 'error').valuesToErrors(),
        ])
        .take(1).toPromise(Q.Promise)
    })
}

export function connectLocally(hub, clientOpts) {
    return new RPCHub.VirtualClient(hub, clientOpts)
}

function log (target) {
    target.on('log', log => console.log.apply(null, ['[%s]', target.name].concat(log)) )
    target.on('error', err => console.log.apply(null, ['[%s] !!!', target.name, err.stack]) )
}

export function watchPeer(me, pred) {
    return K.fromEvents(me, 'peers').toProperty()
        .map(() => _.find(me.peers, pred))
        .skipDuplicates()
}

