let onWrite = require('on-write')
let log = require('lodge')
let fs = require('fsx')

let {LOG_PATH} = require('./paths')

// Write to a log file.
let fd = fs.open(LOG_PATH, 'w+')
let write = (data) => fs.append(fd, data)
onWrite(process.stdout, write)
onWrite(process.stderr, write)

module.exports = log
