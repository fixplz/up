if(typeof Promise == 'undefined') {
  global.Promise = require('bluebird')
  Promise.longStackTraces()
}

process.on('unhandledRejection', function (err) {
  throw err
})

require("regenerator/runtime")
require('babel/register-without-polyfill')

require('app-module-path').addPath(__dirname + '/require')
