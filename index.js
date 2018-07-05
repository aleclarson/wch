let {Readable} = require('readable-stream')
let wchQuery = require('./lib/query')
let events = require('./events')
let quest = require('quest')
let noop = require('noop')
let path = require('path')
let log = require('lodge').debug('wch')
let cp = require('child_process')
let fs = require('fsx')

let {SOCK_PATH} = require('./paths')

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

    log('subscribe:', log.lblue(root))
    let {id} = await quest.json(req, {root, opts})
    return events.on(id, (file) => {
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
wch.query = function(root, query) {
  let req = request('GET', '/query')
  return quest.json(req, {root, query})
}

wch.expr = function(query) {
  return wchQuery(query).expression
}

wch.list = async function() {
  if (!fs.exists(SOCK_PATH)) throw notStarted()
  return (await sock.json('/roots')).roots
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
