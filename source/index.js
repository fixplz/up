// initialization hacks {
if(typeof Promise == 'undefined') {
  global.Promise = require('bluebird')
  process.on('unhandledRejection', function (err) {
    throw err
  })
}
require("babel/node_modules/babel-core/node_modules/regenerator/runtime")
require('babel/register-without-polyfill')({stage: 0})
// }

// make 'up' globally requireable
require('app-module-path').addPath(__dirname + '/require');

// module exports
exports.RPC = require('./rpc')
exports.control = require('./control')

