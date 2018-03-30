require('./init')

let watcher = require('./watcher')
let plugins = require('./plugins')
let slush = require('slush')
let log = require('./log')
let fs = require('fsx')

let {SOCK_PATH} = require('./paths')

onExit(() => {
  watcher.stop()
  plugins.unload()
  fs.removeFile(SOCK_PATH, false)
})

// Connect to watchman.
let starting = watcher.start()

// Start the API server.
slush({
  sock: SOCK_PATH,
})
.pipe(require('./api'))
.on('close', process.exit)
.on('error', onError)
.ready(() => {
  log.pale_green('Server ready!')
  starting.then(() => {
    fs.touch(SOCK_PATH)
  }).catch(onError)
})

function onError(err) {
  console.error(err.stack)
  process.exit(1)
}
