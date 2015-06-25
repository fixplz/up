var Path = require('path')
var Up = require('..')


var unitId = __dirname

Up.control.getController().then(function (ctr) {
    return ctr.setUnit(unitId, {
        /*"rwfb-viz": {
            cwd: "viz/",
            run: ["viz/head.js"],
            env: { PATH: process.env.PATH, },
        },
        "rwfb-viz-worker": {
            cwd: "viz/",
            run: ["viz/draw.js"],
            env: { PATH: process.env.PATH, },
        },*/
        "test-x": {
            cwd: Path.resolve(__dirname),
            run: [Path.resolve(__dirname, 'test.js'), 123],
            env: { PATH: process.env.PATH },
        }
    })
    .then(function () {
        return ctr.updateUnit(unitId).then(function (res) {
            console.log('update:', res)
        })
    })
    .catch(function (err) {
        console.log('error:', err)
    })
    .done(function () {
        ctr.close()
    })
})
.done()

