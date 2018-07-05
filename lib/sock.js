const events = require('./events')
const quest = require('quest')
const noop = require('noop')
const path = require('path')
const uuid = require('uuid')
const log = require('lodge').debug('wch')
const se = require('socket-events')
const fs = require('fsx')

const {
  WCH_DIR,
  SOCK_PATH,
} = require('../paths')

const isTest = process.env.NODE_ENV == 'test'
const offlineRE = /^(ENOENT|ECONNREFUSED|EPIPE)$/
const SOCK_NAME = path.relative(WCH_DIR, SOCK_PATH)

const sock = quest.sock(SOCK_PATH)
module.exports = sock

// `stream` exists when connecting or connected
let stream = null

// `watcher` exists when waiting for server to start
let watcher = null

// `connecting` exists when connection is imminent
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

sock.close = function() {
  if (isReconnecting()) {
    abortReconnect()
    connecting = null
  } else if (stream) { // Closing while connected
    sock.connected = false
    stream.destroy()
  }
}

if (isTest) {
  sock._reset = function() {
    events.clear()
    if (stream) {
      stream._reset()
      if (this._req.socket.destroyed) {
        abortReconnect()
        connecting = null
        return
      }
      return new Promise(resolve => {
        this._req.on('close', resolve)
        return this.close()
      })
    }
  }
}

function connect(resolve, reject) {
  const id = uuid()
  const req = sock.request('GET', '/events', {
    'x-client-id': id,
  })
  if (isTest) {
    sock._req = req
  }

  stream = quest.stream(req)

  stream.on('connect', connected)
  function connected() {
    sock.id = id
    sock.connected = true
    if (isTest) {
      sock._res = req.res
    }
    log('connected')
    connecting = null
    resolve()
    events.emit('connect')
  }

  stream.on('data', se.decoder(events))

  stream.on('close', close)
  function close() {
    if (sock.connected) {
      log('lost connection')
      sock.connected = false
      connecting = new Promise(reconnect)
      connecting.catch(noop)
      events.emit('close')
    } else { // Closed by user
      log('closed by user')
      abortReconnect()
      if (connecting) {
        connecting = null
        reject(CloseError())
      } else { // Closed while connected
        events.emit('close')
      }
    }
  }

  stream.on('error', uhoh)
  function uhoh(err) {
    if (connecting) {
      stream.removeListener('close', close)
      if (offlineRE.test(err.code)) {
        return reconnect(resolve, reject)
      }
      reject(err)
      stream.destroy()
      if (retries == 0) { // not a reconnect
        stream = null
        connecting = null
      }
    } else {
      events.emit('error', err)
    }
  }

  if (isTest) {
    stream._reset = function() {
      this.removeListener('connect', connected)
      this.removeListener('data', emit)
      this.removeListener('close', close)
      this.removeListener('error', uhoh)
    }
  }

  log('connecting')
  events.emit('connecting')
}

let retries = 0, retryId
function reconnect(resolve, reject) {
  if (fs.exists(SOCK_PATH)) {
    const fuzz = 1.25 - 0.5 * Math.random()
    const delay = fuzz * 300 * Math.pow(2.2, ++retries)
    retryId = setTimeout(async () => {
      retryId = null
      try {
        await new Promise(connect)
        retries = 0
        resolve()
      } catch(err) {
        if (stream) {
          reconnect(resolve, reject)
        } else { // Closed by user
          retries = 0
          reject(err)
        }
      }
    }, delay)
  } else {
    events.emit('offline')
    watcher = fs.watch(WCH_DIR, (evt, file) => {
      if (file == SOCK_NAME) {
        watcher.close()
        watcher = null
        reconnect(resolve, reject)
      }
    })
    const {close} = watcher
    watcher.close = function() {
      close.apply(this, arguments)
      if (!stream) { // Closed by user
        reject(CloseError())
      }
    }
  }
}

function isReconnecting() {
  return (connecting && (retryId || watcher)) != null
}

function abortReconnect() {
  stream = null
  clearTimeout(retryId)
  if (watcher) {
    watcher.close()
    watcher = null
  }
}

function CloseError() {
  const err = Error('Closed by user')
  err.code = 'ECONNRESET'
  return err
}
