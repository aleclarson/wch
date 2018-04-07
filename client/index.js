let {Readable} = require('stream')
let events = require('./events')
let quest = require('quest')
let path = require('path')
let cp = require('child_process')
let fs = require('fsx')

let {
  WCH_DIR,
  SOCK_PATH,
  LOG_PATH,
} = require('../server/paths')

let SOCK_NAME = path.relative(WCH_DIR, SOCK_PATH)
let LOG_NAME = path.relative(WCH_DIR, LOG_PATH)

let sock = require('./sock')
let request = sock.request.bind(sock)

// Watch a root.
async function wch(root) {
  if (!sock.connected)
    throw notConnected()
  let req = request('PUT', '/roots')
  return quest.json(res, {root}).then(success)
}

// Unwatch a root.
wch.unwatch = async function(root) {
  if (!sock.connected)
    throw notConnected()
  let req = request('DELETE', '/roots')
  return quest.json(res, {root}).then(success)
}

// Plugin events
wch.on = events.on

let noop = Function.prototype

// File event streaming
wch.stream = function(root, opts) {
  let rewatcher = null
  let stream = new Readable({
    read: noop, // Push only
    objectMode: true,
    destroy,
  })
  let watching = watch()
  watching.catch(fatal)
  return stream

  async function watch() {
    await sock.connect()
    console.log('watch:', root, opts)

    // Rewatch on server restart.
    rewatcher = events.on('connect', () => {
      watching = watch()
      watching.catch(fatal)
    })

    // Setup the watch subscription.
    let req = request('POST', '/watch')
    let {id} = await quest.json(req, {root, opts})

    console.log('stream.id =>', id)
    return events.watch(id, (file) => {
      stream.push(file)
    })
  }
  function destroy(err, next) {
    this.push(null)
    watching.then(watcher => {
      watcher.dispose()
      rewatcher.dispose()
      if (sock.connected) {
        let req = request('POST', '/unwatch')
        quest.send(req, {
          id: watcher.id,
        }).end()
      }
      next(err)
    })
  }
  function fatal(err) {
    stream.destroy(err)
  }
}

// File queries.
wch.query = function(root, opts) {
  throw Error('Not implemented yet')
}

wch.list = async function() {
  if (!socket.connected) throw notConnected()
  return (await sock.json('/roots')).roots
}

// Start the daemon.
wch.start = function() {
  if (fs.exists(SOCK_PATH)) return null
  return new Promise((resolve, reject) => {
    fs.writeDir(WCH_DIR)
    fs.writeFile(LOG_PATH, '')

    // Start the server.
    let serverPath = __dirname + '/server'
    let proc = cp.spawn('node', [serverPath], {
      stdio: 'ignore',
      detached: true,
    }).on('error', (err) => {
      watcher.close()
      reject(err)
    })

    // The socket is touched when the server is ready.
    let watcher = fs.watch(WCH_DIR, (evt, file) => {
      if (file == SOCK_NAME) {
        watcher.close()
        proc.unref()
        resolve()
      }
      else if (file == LOG_NAME) {
        let logs = fs.readFile(LOG_PATH)
        let regex = /(?:^|\n)([^\n:]*Error): (.*)((?:\n +at [^\n]+)*)/m
        let match = regex.exec(logs)
        if (match) {
          reject({
            name: 'ServerError',
            message: match[2],
            stack: match[3],
            inspect: () => match[0],
          })
        }
      }
    })
  })
}

// Stop the daemon.
wch.stop = function() {
  let watcher, err = new Error()
  return new Promise((resolve, reject) => {
    watcher = fs.watch(WCH_DIR, (evt, file) => {
      if (file == 'server.sock') {
        watcher.close()
        resolve(true)
      }
    })
    let req = request('POST', '/stop')
    quest.ok(req, err).catch(reject)
  }).catch(err => {
    if (watcher) watcher.close()
    if (/^(ENOENT|ECONNREFUSED)$/.test(err.code)) {
      fs.removeFile(SOCK_PATH, false)
      return false
    }
    throw err
  })
}

module.exports = wch

function success(res) {
  return !res || !res.error
}

// A stream that emits "error" upon read.
function estream(err) {
  return Readable({
    read() {
      this.emit('error', err)
    }
  })
}

function notConnected() {
  let err = Error('Not connected to wch')
  err.code = 408
  return err
}

function parseJsonStream(stream) {
  let {push} = stream
  stream.push = function(val, enc) {
    if (val) {
      if (Buffer.isBuffer(val)) {
        val = val.toString()
      }
      try {
        val = JSON.parse(val)
      } catch(err) {
        err.json = val
        return stream.emit('error', err)
      }
    }
    return push.call(this, val)
  }
  stream._readableState.objectMode = true
  return stream
}
