// initialization hacks {
var Q = require('q')
Q.longStackSupport = true
global.Promise = Q.Promise

require("babel/node_modules/babel-core/node_modules/regenerator/runtime")
require('babel/register-without-polyfill')({stage: 0})
// }


// make 'up' globally requireable
require('app-module-path').addPath(__dirname + '/require');

// module exports
exports.RPC = require('./rpc')
exports.control = require('./control')

