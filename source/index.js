// initialization hacks {
if(typeof Promise == 'undefined') {
  global.Promise = require('bluebird')
  Promise.longStackTraces()
}
require("babel/node_modules/babel-core/node_modules/regenerator/runtime")
require('babel/register-without-polyfill')
// }

// make 'up' globally requireable
require('app-module-path').addPath(__dirname + '/require');

// ???
process.on('unhandledRejection', function (err) {
  throw err
})

// module exports
exports.FS = require('./fs')
exports.RPC = require('./rpc')
exports.getController = require('./runner-rpc').getController

