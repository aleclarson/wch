let EventEmitter = require('events')
let {Client} = require('fb-watchman')
let noop = require('noop')
let path = require('path')
let log = require('../log')
let os = require('os')

// Watchman client object
let client = null

// Preserve listeners between reconnect.
let events = new EventEmitter()
exports.on = events.on.bind(events)

let list = command('watch-list')
exports.roots = async function() {
  return (await list()).roots
}

// Find the watch root of a directory.
exports.root = function(dir, roots) {
  return roots ? findRoot(dir, roots)
    : list().then(res => findRoot(dir, res.roots))
}

function findRoot(dir, roots) {
  let home = os.homedir()
  while (!roots.includes(dir)) {
    if (dir == home) return null
    dir = path.dirname(dir)
  }
  return dir
}

commands({
  watch: 'watch-project',
  query: null,
  clock: null,
  subscribe: null,
  unsubscribe: null,
})

exports.connect = reconnect
async function reconnect() {
  client = await new Promise(connect)
  events.emit('connect')
}

function connect(resolve, reject) {
  log.coal('Connecting to watchman...')
  let client = new Client()
  client.on('connect', () => {
    log.pale_green('Connected to watchman!')
  })
  .on('end', () => {
    log.red('Lost connection to watchman!')
    if (client.connecting) {
      // TODO: Try again later.
      reject(Error('Failed to connect'))
    } else {
      reconnect().catch(noop)
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
      resolve(client)
    }
  })
}

function commands(cmd) {
  Object.keys(cmd).forEach(key => {
    exports[key] = command(cmd[key] || key)
  })
}

function command(term) {
  return function() {
    let cmd = [term, ...arguments]
    return new Promise((resolve, reject) => {
      client.command(cmd, (err, res) => {
        if (err) {
          err.cmd = cmd
          reject(err)
        } else {
          if ('warning' in res) {
            log.yellow('warn:', res.warning)
          }
          resolve(res)
        }
      })
    })
  }
}
