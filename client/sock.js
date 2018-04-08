let events = require('./events')
let quest = require('quest')
let path = require('path')
let uuid = require('uuid')
let fs = require('fsx')

let {
  WCH_DIR,
  SOCK_PATH,
} = require('../server/paths')

let SOCK_NAME = path.relative(WCH_DIR, SOCK_PATH)

let sock = quest.sock(SOCK_PATH)
module.exports = sock

let stream = null
let watcher = null
let connecting = null

sock.connected = false
Object.defineProperty(sock, 'connecting', {
  get: () => !!connecting,
  enumerable: true,
})

sock.connect = function() {
  if (sock.connected) return Promise.resolve()
  return connecting || (connecting = new Promise(connect))
}

let abortErr = new Error('Aborted by user')
sock.disconnect = function() {
  if (stream) {
    sock.connected = false
    stream.destroy()
  }
}

sock.on = events.on

let noop = Function.prototype
let eventRE = /^([^\n]+)\n(.+)\n\n$/
let offlineRE = /^(ENOENT|ECONNREFUSED)$/
function connect(resolve, reject) {
  stream = sock.stream('/events', {
    'x-client-id': sock.id = uuid(),
  })
  stream.on('response', () => {
    if (stream.ok) {
      connecting = null
      sock.connected = true
      resolve()
      events.emit('connect')
    }
  })
  stream.setEncoding('utf8')
  stream.on('data', (event) => {
    if (event == null) return
    let [id, args] = eventRE.exec(event).slice(1)
    console.log(id + ': ' + args)
    events.emit(id, JSON.parse(args))
  }).on('error', (err) => {
    if (offlineRE.test(err.code)) {
      console.log('server offline')
      reconnect(resolve, reject)
    } else if (connecting) {
      stream = null
      connecting = null
      reject(err)
    } else {
      events.emit('error', err)
    }
  }).on('end', () => {
    if (sock.connected) {
      sock.connected = false
      events.emit('disconnect')
      connecting = new Promise(reconnect)
      connecting.catch(noop)
    } else {
      stream = null
      clearTimeout(retryTimer)
      if (watcher) {
        watcher.close()
        watcher = null
      }
      if (connecting) {
        connecting = null
        reject(err)
      } else {
        sock.connected = false
        events.emit('disconnect')
      }
    }
  })
}

let retries = 0, retryTimer
function reconnect(resolve, reject) {
  if (fs.exists(SOCK_PATH)) {
    let fuzz = 1.25 - 0.5 * Math.random()
    let delay = fuzz * 300 * Math.pow(2.2, ++retries)
    console.log('Reconnecting in ' + delay + ' ms...')
    let retryTimer = setTimeout(async () => {
      try {
        await new Promise(connect)
        retries = 0
        resolve()
      } catch(err) {
        if (stream) {
          reconnect(resolve, reject)
        } else reject(err)
      }
    }, delay)
  } else {
    console.log('Watching socket path...')
    watcher = fs.watch(WCH_DIR, (evt, file) => {
      if (file == SOCK_NAME) {
        watcher.close()
        watcher = null
        if (stream) {
          reconnect(resolve, reject)
        } else reject(abortErr)
      }
    })
  }
}
