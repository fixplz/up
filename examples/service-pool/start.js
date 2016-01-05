#!/bin/env up-run
import Up from 'up'

let task = (...command) => ({
  cwd: __dirname,
  run: command,
  env: { PATH: process.env.PATH },
})

let tasks = {
  server: task('server.js'),
  service_abc_1: task('service', 'abc', 'abc'),
  service_abc_2: task('service', 'abc', 'abc'),
  service_abc_3: task('service', 'abc', 'abc'),
  service_def_1: task('service', 'def', 'def'),
}

Up.withController(async ctr => {
  Up.report.title('start')
  Up.report.status(await ctr.updateApp('services', tasks))
})
