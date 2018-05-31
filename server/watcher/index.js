let PackageCache = require('./PackageCache')
let PluginCache = require('./PluginCache')
let WatchStream = require('./WatchStream')
let makeQuery = require('./query')
let socket = require('./socket')
let assert = require('assert')
let noop = require('noop')
let path = require('path')
let fs = require('fsx')

let {WCH_DIR} = require('../paths')

// Watchman commands
let cmd = require('./commands')

// Transient streams mapped to their identifiers.
let streams = new Map()

// Watched roots are preserved within this cache.
let watched = null

// Plugins are managed via this cache.
let plugins = new PluginCache()

process.on('exit', () => {
  plugins.destroy()
  streams.forEach(s => s.destroy())
})

socket.on('connect', () => {
  // Restart streams on reconnect.
  streams.forEach(s => s._subscribe())
})

socket.on('subscription', (evt) => {
  let id = evt.subscription
  let stream = streams.get(id)
  if (!stream || stream.destroyed) return
  if (!evt.canceled) {
    stream.clock = evt.clock
    evt.files.forEach(file => {
      file.path = path.join(stream.path, file.name)
      stream.push(file)
    })
  } else if (fs.isDir(stream.path)) {
    // The user still has the stream open.
    stream._subscribe()
  } else {
    // The watch root was deleted. 😧
    stream.push({
      name: '/',
      path: stream.path,
      exists: false,
    })
    stream.destroy()
  }
})

module.exports = {
  async start() {
    await socket.connect()
    if (!watched) {
      watched = new PackageCache('watched.json')
      await watched.load(watch)
    }
  },
  async watch(root) {
    assert.equal(typeof root, 'string')
    if (!watched.has(root)) {
      await watch(root)
      return true
    }
  },
  unwatch,
  streams,
  stream: createStream,
  query,
  list: () => watched.list(),
}

async function watch(root) {
  await cmd.watch(root)

  let pack = watched.add(root)
  plugins.attach(pack)

  // Watch package configuration for changes.
  pack.stream({
    only: ['/package.json', '/project.js', '/project.coffee']
  }).on('data', (file) => {
    if (file.name != 'package.json') {
      plugins.reload(pack)
    } else if (file.exists) {
      pack.read(true)
      plugins.attach(pack)
    } else {
      plugins.detach(pack)
    }
  }).on('error', (err) => {
    // TODO: Restart the stream.
    console.error(err.stack)
  })

  return pack
}

async function unwatch(root) {
  assert.equal(typeof root, 'string')
  let pack = watched.get(root)
  if (pack) {
    watched.delete(root)
    plugins.detach(pack)
    pack._destroy()
    return true
  }
}

function createStream(dir, query = {}) {
  assert.equal(typeof dir, 'string')
  if (!fs.exists(dir)) {
    throw Error('Path does not exist: ' + dir)
  }
  assert.equal(typeof query, 'object')
  if (!query.type) query.type = 'fl'

  let stream = new WatchStream(dir, query)
  streams.set(stream.id, stream)

  return stream._subscribe()
  .on('close', async () => {
    if (stream.destroyed) {
      streams.delete(stream.id)
      if (fs.exists(dir)) {
        let root = await cmd.root(fs.realPath(dir))
        if (root) {
          cmd.unsubscribe(root, stream.id)
            .catch(console.error)
        }
      }
    }
  })
}

async function query(dir, query = {}) {
  assert.equal(typeof dir, 'string')
  assert.equal(typeof query, 'object')
  if (!query.type) query.type = 'fl'

  let link = fs.realPath(dir)
  query = makeQuery(query)

  // Find the actual root.
  let root = await cmd.root(link)
  if (!root) throw Error('Cannot query an unwatched root: ' + dir)

  // Update the relative root.
  let rel = query.relative_root || ''
  query.relative_root = link == root ? rel :
    path.join(path.relative(root, link), rel)

  // Send the query.
  let q = await cmd.query(root, query)

  // Return the files, root, and clockspec.
  let res = q.files
  res.root = dir
  res.clock = q.clock
  return res
}
