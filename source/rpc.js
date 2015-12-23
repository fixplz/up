import K from 'kefir'
import L from 'lodash'

import Sock from 'fancy-socks'
import RPC from 'stream-rpc'
import {whenStream} from 'async-helper/kefir'

import Files from 'up/fs'


export async function host(opts = {}) {
    let server = await Sock.createServer({path: Files.hubFile})
    var hub = new RPC.Hub(server)
    if(opts && opts.log) logging(hub, opts.log)
    return hub
}

export async function connect(opts = {}) {
    let sock = await Sock.openSocket({path: Files.hubFile, reconnect: true})
    var client = new RPC.Client(sock, opts)
    if(opts && opts.log) logging(client, opts.log)
    await whenPeers(client)
    return client
}

export async function connectLocally(hub, opts) {
    let client = new RPC.VirtualClient(hub, opts)
    if(opts && opts.log) logging(client, opts.log)
    await whenPeers(client)
    return client
}

function whenPeers (client) {
    return whenStream(K.merge([
        K.fromEvents(client, 'peers').map(() => client),
        K.fromEvents(client, 'error').flatMap(err => K.constantError(err)),
    ]))
}

function logging (target, log) {
    target.on('log', msg => log('[%s]', target.name, ...msg))
    target.on('error', err => log('[%s] !!!', target.name, err.stack || err))
}

export function request(client, peer, ...args) {
    return new Promise((resolve, reject) =>
        client.requestTo(peer, args, msg => {
            var [status, response] = msg.response
            if(status == 'ok') resolve(msg.response[1])
            if(status == 'err') reject(new Error(JSON.stringify(msg.response[1])))
            reject(new Error('unrecognized response ' + require('util').inspect(msg)))
        }))
}

export function watchPeer(client, pred) {
    return K.fromEvents(client, 'peers').toProperty()
        .map(() => L.find(client.peers, pred))
        .skipDuplicates()
}

export function whenPeer(client, pred) {
    return whenStream(watchPeer(client, pred), peer => peer != null)
}
