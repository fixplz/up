#!/usr/bin/env node

var Path = require('path')

require('..')

process.argv.splice(1, 1)

var target = Path.resolve(process.cwd(), process.argv[1])
require(target)

