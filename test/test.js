require('../source')

import * as RPC from 'up/rpc'
import {Runner,initRunnerRPC} from '../source/daemon'
import {Controller} from '../source/control'
import K from 'kefir'
import {whenStream} from 'async-helper/kefir'
import should from 'should'

let hub
let controller

let log =
    process.env.log ? console.log : () => {}

let instDef = (cmd, ...args) => ({
    cwd: __dirname,
    run: [__dirname + '/' + cmd, ...args],
    env: { PATH: process.env.PATH },
})

describe('Hub', () => {
    it('initializes', async () => {
        hub = await RPC.host()

        let client = RPC.connectLocally(hub, { name: 'Runner' })
        let runner = new Runner(client, undefined, log)
        initRunnerRPC(client, runner, log)
    })
})

describe('Controller', () => {
    it('connects', async () => {
        let client = new RPC.connectLocally(hub, {name: 'Test-Controller'})
        await whenStream(K.fromEvents(client, 'peers'))
        controller = new Controller(client)
    })

    it('update app', async () => {
        await controller.updateApp('test', {
            'test-inst': instDef('app/test-app.js', 'wait')
        })
    })

    it('status after', async () => {
        let status = await controller.status()

        status.should.length(1)
        status[0].should.keys(['appId', 'state', 'tasks', 'instances'])
        status[0].should.properties({
            appId: 'test',
            state: 'ok'
        })
        status[0].tasks.should.keys(['test-inst'])
        status[0].tasks['test-inst'].should.properties(
            { cwd: '/Users/G/Desktop/up/test',
              run: [ '/Users/G/Desktop/up/test/app/test-app.js', 'wait' ], })
        status[0].instances.should.length(1)
        status[0].instances[0].should.keys(['appId', 'taskId', 'procState', 'marking', 'pid', 'run'])
        status[0].instances[0].should.properties(
            { appId: 'test',
              taskId: 'test-inst',
              procState: 'up',
              marking: 'run', })
        status[0].instances[0].run.should.deepEqual(status[0].tasks['test-inst'].run)
    })

    it('remove app', async () => {
        await controller.removeApp('test')
        let status = await controller.status()
        status.should.deepEqual([])
    })
})
