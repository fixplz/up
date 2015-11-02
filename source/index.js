// initialization hacks {
var Q = require('q')
Q.longStackSupport = true
global.Promise = Q.Promise

require("babel/node_modules/babel-core/node_modules/regenerator/runtime")
require('babel/register-without-polyfill')({stage: 1})
// }


// make 'up' globally requireable
require('app-module-path').addPath(__dirname + '/require');

// module exports
exports.RPC = require('./up-rpc')
exports.control = require('./up-control')

