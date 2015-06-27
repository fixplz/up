var Path = require('path')
var Up = require('..')


var unitName = 'test'

Up.control.getController().then(function (ctr) {
    return ctr.setUnit(unitName, {
        "test-x": {
            cwd: Path.resolve(__dirname),
            run: [Path.resolve(__dirname, 'test.js'), 'abc'],
            env: { PATH: process.env.PATH },
        },
        "test-y": {
            cwd: Path.resolve(__dirname),
            run: [Path.resolve(__dirname, 'test.js'), 'xyz'],
            env: { PATH: process.env.PATH },
        },
    })
    .then(function () { return ctr.updateUnit(unitName) })
    .then(function (res) { console.log('update', res) })
    .catch(function (err) {console.log('error', err) })
    .finally(function () { ctr.close() })
})
.done()

