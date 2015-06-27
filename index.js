require('source-map-support').install();
require('babel/register')({stage: 1})
require('q').longStackSupport = true

exports.RPC = require('./lib/up-rpc')
exports.control = require('./lib/up-control')
