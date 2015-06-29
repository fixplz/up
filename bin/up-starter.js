#!/usr/bin/env node

var Up = require('..')

process.argv.splice(1, 1)
require(process.argv[1])

Up.RPC.connect({
    name: 'Up-Node',
    attributes: { run: process.argv.slice(2) },
})
.then(function (client) {
    client.sendEvent('up')
})
.done()
