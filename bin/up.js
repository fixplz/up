#!/usr/bin/env node

var FS = require('fs')
var Path = require('path')

var opts = require('nopt')({}, {}, process.argv)
var args = opts.argv.remain

var control = require('../lib/up-control')

if(args == null || args.length == 0 || ! args[0]) {
    exit('no command given')
}
if(args[0] == 'add' || args[0] == 'register') {
    var dir = args[1]
    if(dir == null) exit('no path given')
    dir = Path.resolve(dir)

    control.getController({name: 'Shell', log: false}).then(function (ctr) {
        return ctr.register({ path: dir })
        .then(function (status) {
            console.log('registered', dir)
            console.log(status)
        })
        .then(function () { ctr.peer.close() })
    })
    .done()
}
else {
    exit('unknown command', args[0])
}

function exit (message) {
    console.error(message)
    process.exit(1)
}
