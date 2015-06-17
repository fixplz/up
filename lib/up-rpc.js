var Q = require('q')
var K = require('kefir')
var _ = require('lodash')
var Sock = require('./sock')
var RPCHub = require('./rpc-hub')

var sockpath = '/up/hub'

exports.host = function (hubOpts) {
    return Sock.createServer({path: sockpath}).then(function (server) {
        var hub = new RPCHub.Hub(server)
        if(hubOpts && hubOpts.log) log(hub)
        return hub
    })
}

exports.connect = function (clientOpts) {
    return Sock.openSocket({path: sockpath, reconnect: true}).then(function (sock) {
        return Q.Promise(function (resolve, reject) {
            var client = new RPCHub.Client(sock, clientOpts)
            if(clientOpts && clientOpts.log) log(client)

            K.merge([
                K.fromEvents(client, 'peers', function () { return 'ready' }),
                K.fromEvents(client, 'error')
            ])
            .take(1).onValue(function (val) {
                if(val == 'ready') resolve(client)
                reject(val)
            })
        })
    })
}

exports.connectLocally = function (hub, clientOpts) {
    return new RPCHub.VirtualClient(hub, clientOpts)
}

function log (target) {
    target.on('log', function (log) {
        console.log.apply(null, ['[%s]', target.name].concat(log))
    })

    target.on('error', function (err) {
        console.log.apply(null, ['[%s] !!!', target.name, err.stack])
    })
}

exports.watchPeer = function (me, pred) {
    return K.fromEvents(me, 'peers').toProperty()
        .map(function () { return _.find(me.peers, pred) })
        .skipDuplicates()
}

