let {Readable} = require('readable-stream')
let events = require('./events')
let quest = require('quest')
let noop = require('noop')
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
  if (!fs.exists(SOCK_PATH))
    throw notStarted()
  let req = request('PUT', '/roots')
  return quest.json(req, {root}).then(success)
}

// Unwatch a root.
wch.unwatch = async function(root) {
  if (!fs.exists(SOCK_PATH))
    throw notStarted()
  let req = request('DELETE', '/roots')
  return quest.json(req, {root}).then(success)
}

// Plugin events
wch.on = function(evt, fn) {
  sock.connect()
  return events.on(evt, fn)
}

// File event streaming
wch.stream = function(root, opts) {
  if (opts && typeof opts.since == 'object') {
    opts.since = Math.floor(opts.since.getTime() / 1000)
  }

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

    // Rewatch on server restart.
    rewatcher = events.on('connect', () => {
      rewatcher.dispose()
      watching = watch()
      watching.catch(fatal)
    })

    // Setup the watch subscription.
    let req = request('POST', '/watch', {
      'x-client-id': sock.id,
    })

    let {id} = await quest.json(req, {root, opts})
    return events.watch(id, (file) => {
      stream.push(file)

      // The watch root was deleted!
      if (file.name == '/') {
        stream.destroy()
      }
    })
  }
  async function destroy(err, done) {
    if (rewatcher) rewatcher.dispose()
    try {
      let watcher = await watching
      watcher.dispose()
      if (sock.connected) {
        let req = request('POST', '/unwatch')
        quest.send(req, {
          id: watcher.id,
        }).catch(noop)
      }
    } catch(e) {}
    done(err)

    // 'readable-stream' does not emit "close" by default
    process.nextTick(() => stream.emit('close'))
  }
  function fatal(err) {
    if (!stream.destroyed) {
      stream.destroy(err)
    }
  }
}

// File queries.
wch.query = function(root, opts) {
  let req = request('GET', '/query')
  return quest.json(req, {root, opts})
}

wch.list = async function() {
  if (!fs.exists(SOCK_PATH)) throw notStarted()
  return (await sock.json('/roots')).roots
}

// Start the daemon.
wch.start = function() {
  if (fs.exists(SOCK_PATH)) return null
  return new Promise((resolve, reject) => {
    fs.writeDir(WCH_DIR)
    fs.writeFile(LOG_PATH, '')

    // Start the server.
    let serverPath = path.resolve(__dirname, '../server')
    let proc = cp.spawn('node', [serverPath], {
      env: process.env,
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

function notStarted() {
  let err = Error('Run `wch start` first')
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
