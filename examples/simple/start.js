#!/bin/env up-run
import Up from 'up'

let task = (...command) => ({
  cwd: __dirname,
  run: command,
  env: { PATH: process.env.PATH },
})

let tasks = {
  test_x: task('test.js', 'abc'),
  test_y: task('test.js', 'xyz'),
}

Up.withController(async ctr => {
  Up.report.title('start')
  Up.report.status(await ctr.updateApp('simple', tasks))
})
