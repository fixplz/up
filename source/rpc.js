import K from 'kefir'
import L from 'lodash'

import Sock from 'fancy-socks'
import RPC from 'stream-rpc'
import {whenStream} from 'async-helper/kefir'

import Files from 'up/fs'


export async function host(opts = {}) {
    let server = await Sock.createServer({path: Files.hubFile})
    var hub = new RPC.Hub(server)
    if(opts && opts.log) logging(hub)
    return hub
}

export async function connect(opts = {}) {
    let sock = await Sock.openSocket({path: Files.hubFile, reconnect: true})
    var client = new RPC.Client(sock, opts)
    if(opts && opts.log) logging(client)
    return whenStream(K.merge([
        K.fromEvents(client, 'peers').map(() => client),
        K.fromEvents(client, 'error').flatMap(err => K.constantError(err)),
    ]))
}

export function connectLocally(hub, opts) {
    return new RPC.VirtualClient(hub, opts)
}

function logging (target) {
    target.on('log', log => console.log.apply(null, ['[%s]', target.name].concat(log)) )
    target.on('error', err => console.log.apply(null, ['[%s] !!!', target.name, err.stack]) )
}

export function watchPeer(client, pred) {
    return K.fromEvents(client, 'peers').toProperty()
        .map(() => L.find(client.peers, pred))
        .skipDuplicates()
}

export function whenPeer(client, pred) {
    return whenStream(watchPeer(client, pred), peer => peer != null)
}
