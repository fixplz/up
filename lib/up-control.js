var RPC = require('./up-rpc')
var Q = require('Q')
var _ = require('lodash')


exports.getController = getController
exports.Controller = Controller

function getController (opts) {
    if(opts == null) opts = {}

    return RPC.connect({name: opts.name || 'Controller', log: opts.log!=null ? opts.log : true})
        .then(function (client) { return new Controller(client) })
}

function Controller (client) {
    this.client = client

    initController(this)
}

function initController (me) {
    var runner = _.find(me.client.peers, { name: 'Runner' })

    if(runner == null)
        throw new Error('runner not found')

    me.runner = runner

    function send (message) {
        me.client.sendTo(runner, message)
    }

    me.setUnit = function (unitId, def) {
        return getResponse(function (cb) {
            me.client.requestTo(runner, ['set-unit', unitId, def], cb) })
    }

    me.updateUnit = function (unitId) {
        return getResponse(function (cb) {
            me.client.requestTo(runner, ['update-unit', unitId], cb) })
    }

    me.close = function () {
        me.client.close()
    }
}

function getResponse (func) {
    return Q.Promise(function (resolve, reject) {
        func(function (from, response) {
            if(response[0] == 'ok') resolve(response[1])
            else reject(response[1])
        })
    })
}

