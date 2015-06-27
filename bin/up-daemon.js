#!/usr/bin/env node

var Up = require('..')

require('../lib/up-daemon').startDaemon().done()
