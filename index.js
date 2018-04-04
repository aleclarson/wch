let {Readable} = require('stream')
let quest = require('quest')
let path = require('path')
let cp = require('child_process')
let fs = require('fsx')

let {
  WCH_DIR,
  SOCK_PATH,
  LOG_PATH,
} = require('./server/paths')

let SOCK_NAME = path.relative(WCH_DIR, SOCK_PATH)
let LOG_NAME = path.relative(WCH_DIR, LOG_PATH)

let sock = quest.sock(SOCK_PATH)
let request = sock.request.bind(sock)

// Watch a root.
function wch(root) {
  let req = request('PUT', '/roots')
  let res = send(req, {root})
  return quest.json(res).then(success)
}

// Unwatch a root.
wch.unwatch = async function(root) {
  let req = request('DELETE', '/roots')
  let res = send(req, {root})
  return quest.json(res).then(success)
}

// Event streaming.
wch.stream = function(root, opts) {
  let req = sock.request('/events', {
    'Accept': 'text/event-stream',
  })
  let stream = send(req, {
    root, opts,
  })
  let {push} = stream
  stream.push = function(data, enc) {
    let file = data? JSON.parse(data) : null
    return push.call(this, file, enc)
  }
  return stream
}

// File queries.
wch.query = function(root, opts) {
  throw Error('Not implemented yet')
}

wch.list = async function() {
  return (await getJson('/roots')).roots
}

// Start the daemon.
wch.start = function() {
  if (fs.exists(SOCK_PATH)) return null
  return new Promise((resolve, reject) => {
    fs.writeDir(WCH_DIR)
    fs.writeFile(LOG_PATH, '')

    // Start the server.
    let serverPath = __dirname + '/server'
    let proc = cp.spawn('node', ['--trace-warnings', serverPath], {
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

// Throw a timeout error when the server is down.
let SOCK_408 = Error('The wch server is down. Try doing `wch start`')
SOCK_408.code = 408

function getJson(url, headers) {
  if (fs.exists(sock.path))
    return sock.json(url, headers)
  throw SOCK_408
}

function send(req, body) {
  return fs.exists(sock.path) ?
    quest.send(req, body) :
    estream(SOCK_408)
}

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
