import Up from 'up'
import {Runner} from 'up/runner'
import K from 'kefir'
import {whenStream} from 'async-helper/kefir'
import should from 'should'

let hub
let runner
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
        hub = await Up.RPC.host()
        let client = await Up.RPC.connectLocally(hub, { name: 'Runner' })
        runner = new Runner(client, undefined, log)
    })
})

describe('Controller', () => {
    it('connects', async () => {
        let client = await Up.RPC.connectLocally(hub, {name: 'Test-Controller'})
        controller = await Up.getController({client})
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
