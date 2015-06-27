var FS = require('fs')

var x = FS.openSync('./log', 'a')

FS.write(x, 'started\n')

setInterval(function () {
    FS.write(x, 'log ' + process.argv[2] + '\n')
}, 1000)
