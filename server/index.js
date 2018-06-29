require('./init')

let watcher = require('./watcher')
let slush = require('slush')
let log = require('./log')
let fs = require('fsx')

let {SOCK_PATH} = require('./paths')

// Connect to watchman.
let starting = watcher.start()
starting.catch(onError)

process.on('exit', () => {
  fs.removeFile(SOCK_PATH, false)
})

// Start the API server.
slush({
  sock: SOCK_PATH,
})
.pipe(require('./api'))
.on('close', process.exit)
.on('error', onError)
.ready(() => {
  log(log.lgreen('Server ready!'))
  starting.then(() => {
    fs.touch(SOCK_PATH)
  }).catch(onError)
})

function onError(err) {
  console.error(err.stack)
  process.exit(1)
}
