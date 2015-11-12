var es = require('event-stream')
var amp = require('amp')

exports.asMessageStream = function (stream) {
    var incoming = es.through()

    var parser =
        new amp.Stream()
        .on('data', function (d) {
            try { var obj = JSON.parse(amp.decode(d)[0]) }
            catch (err) { incoming.emit('error', err); return }
            incoming.write(obj)
        })
        .on('error', function (err) { incoming.emit('error', err) })

    var outgoing = es.through(function (obj) {
        stream.write(amp.encode([Buffer(JSON.stringify(obj))]))
    })

    var duplex = es.duplex(outgoing, incoming)

    stream.on('data', function (d) { parser.write(d) })
    stream.on('error', function (err) { duplex.emit('error', new Error("Message stream error: " + err.message)) })

    return duplex
}
