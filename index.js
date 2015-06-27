require('source-map-support').install();
require('babel/register')({stage: 1})

if(module == require.main) {
    var daemon = require('./up-daemon')
    daemon.startDaemon().done()
}
else {
    exports.RPC = require('./lib/up-rpc')
    exports.control = require('./lib/up-control')
    exports.daemon = require('./up-daemon')
}
