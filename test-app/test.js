var FS = require('fs')

var x = FS.openSync('./wow', 'w')

setInterval(function () {
    FS.write(x, 'wow ' + process.argv[2] + '\n')
}, 1000)
