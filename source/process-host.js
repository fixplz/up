import Process from 'child_process'
import L from 'lodash'
import K from 'kefir'
import {whenStream} from 'async-helper/kefir'

export default class ProcessHost {
    constructor () {
        this.processes = []
        this.idCount = 1
    }

    run (params) {
       var proc = Process.spawn(
           params.run[0], params.run.slice(1),
           { env: params.env || {}, cwd: params.cwd })

       var name = `${params.name} (${proc.pid})`

       proc.stdout.on('data', d => logProc(name + ': ', d))
       proc.stderr.on('data', d => logProc(name + '! ', d))

       var exited = whenStream(K.merge([
           K.fromEvents(proc, 'error', error => ({error})),
           K.fromEvents(proc, 'exit', exited => ({exited}))
       ]))

       var desc = {
           id: this.idCount ++,
           handle: proc,
           pid: proc.pid,
           name,
           params,
           exited,
           inspect: function () { return '<process ' + proc.pid + '>' },
       }

       this.processes.push(desc)

       return desc
   }

   stop (desc) {
       desc.handle.kill()
   }
}

function logHost (...args) {
    console.log('[host]', ...args)
}

function logProc (prefix, data) {
    var lines = data.toString().split('\n')
    if(L.last(lines) == '') lines.pop()
    logHost(lines.map(l => prefix + l).join('\n'))
}
