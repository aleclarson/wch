let EventEmitter = require('events')
let watchman = require('fb-watchman')
let noop = require('noop')
let log = require('../log')

// Preserve listeners between reconnect.
let events = new EventEmitter()

let socket = exports
socket.on = events.on.bind(events)
socket.connect = async function() {
  await new Promise(connect)
  events.emit('connect')
}

// TODO: Command queue?
socket.command = function() {
  throw Error('Not connected')
}

function connect(resolve, reject) {
  log.coal('Connecting to watchman...')
  let client = new watchman.Client()
  client.on('connect', () => {
    log.pale_green('Connected to watchman!')
    socket.command = client.command.bind(client)
  })
  .on('end', () => {
    log.pale_red('Lost connection to watchman!')
    if (client.connecting) {
      // TODO: Try again later.
      reject(Error('Failed to connect'))
    } else {
      socket.connect().catch(noop)
    }
  })
  // TODO: Inspect error to see if we can reconnect.
  .on('error', (err) => {
    if (client.connecting) {
      reject(err)
    } else {
      console.error(err.stack)
    }
  })
  .on('subscription', (res) => {
    events.emit('subscription', res)
  })
  client.capabilityCheck({
    required: ['wildmatch', 'relative_root']
  }, async (err, res) => {
    if (err) {
      log()
      log.red('Unsupported watchman version: ', res.version)
      log.cyan('  brew upgrade', 'watchman')
      log()
      reject(err)
    } else {
      resolve()
    }
  })
}
