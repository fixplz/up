#!/usr/bin/env node

require('../runtime')

process.argv.splice(1, 1)

var Path = require('path')
var target = Path.resolve(process.cwd(), process.argv[1])
require(target)
