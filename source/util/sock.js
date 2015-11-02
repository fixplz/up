var fs = require('fs')
var net = require('net')
var Q = require('q')

exports.createServer = createServer
exports.openSocket = openSocket
exports.checkSocket = checkSocket

function createServer (params) {
    return Q.Promise(function (resolve, reject) {
        var server = net.createServer()

        server.once('listening', function () {
            server.removeListener('error', checkUnixSockErr)
            resolve(server)
        })

        if(params.path) server.on('error', checkUnixSockErr)

        listen()

        function listen () {
            var np = netParams(params)
            server.listen(np[0], np[1])
        }

        function checkUnixSockErr (err) {
            if(err.code == 'EADDRINUSE' && params.path) {
                checkSocket(params).then(function (isActive) {
                    if(isActive) reject(err)
                    else {
                        fs.unlinkSync(params.path)
                        listen()
                    }
                })
            }
            else
                reject(err)
        }
    })
}

function checkSocket (params) {
    return openSocket(params).then(function (conn) {
        conn.end()
        return true
    })
    .catch(function (err) {
        return false
    })
}

function openSocket (params) {
    return Q.Promise(function (resolve, reject) {
        var np = netParams(params)
        var conn = net.createConnection(np[0], np[1])

        conn.on('connect', function () {
            if(params.reconnect)
                setupReconnect(params, conn)
            resolve(conn)
        })

        conn.on('error', function (err) {
            reject(err)
        })
    })
}

function setupReconnect (params, conn) {
    if(conn._reconnect != null)
        return

    conn._reconnect = true

    var innerClose = conn.close

    conn.close = function () {
        conn.reconnect = false
        innerClose()
    }

    conn.on('close', function () {
        if(conn.reconnect) setTimeout(retry, 2000)
    })

    function retry () {
        var np = netParams(params)
        conn.connect(np[0], np[1])
    }
}

function netParams (params) {
    if(params.path)
        return [params.path]
    else
        return [params.port, params.host]
}
