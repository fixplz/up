var Q = require('q')
Q.longStackSupport = true
global.Promise = Q.Promise

require("babel/node_modules/babel-core/node_modules/regenerator/runtime")

require('source-map-support').install();
require('babel/register-without-polyfill')({stage: 1})

exports.RPC = require('./lib/up-rpc')
exports.control = require('./lib/up-control')
