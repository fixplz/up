import Process from 'child_process'
import L from 'lodash'
import K from 'kefir'
import {whenStream} from 'async-helper/kefir'

export default class ProcessHost {
    constructor ({log}) {
        this.log = (...args) => log('[host]', ...args)
        this.processes = []
        this.idCount = 1
    }

    logProc (prefix, data) {
        var lines = data.toString().split('\n')
        if(L.last(lines) == '') lines.pop()
        this.log(lines.map(l => prefix + l).join('\n'))
    }

    run (params) {
       var proc = Process.spawn(
           params.run[0], params.run.slice(1),
           { env: params.env || {}, cwd: params.cwd })

       var name = `${params.name} (${proc.pid})`

       proc.stdout.on('data', d => this.logProc(name + ': ', d))
       proc.stderr.on('data', d => this.logProc(name + '! ', d))

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
