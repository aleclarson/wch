let onWrite = require('on-write')
let huey = require('huey')
let fs = require('fsx')

let {LOG_PATH} = require('./paths')

// Write to a log file.
let logs = {
  fd: fs.open(LOG_PATH, 'w+'),
  append: (data) => fs.append(logs.fd, data),
}
onWrite(process.stdout, logs.append)
onWrite(process.stderr, logs.append)

module.exports =
  huey.log(console.log.bind(), !process.env.NO_COLOR)
