require('babel/register')

var RPC = require('./lib/up-rpc')


RPC.connect({
    name: 'Up-Node',
    attributes: { run: process.argv.slice(2) },
    log: true,
})
.then(function (client) {

    process.argv.splice(1, 1)
    require(process.argv[1])

    client.sendEvent('up')

})
.done()
