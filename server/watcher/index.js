let PackageCache = require('./PackageCache')
let PluginCache = require('./PluginCache')
let WatchStream = require('./WatchStream')
let makeQuery = require('./query')
let assert = require('assert')
let noop = require('noop')
let path = require('path')
let fs = require('fsx')

let {WCH_DIR} = require('../paths')

// Watchman commands
let wm = require('./commands')

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

wm.on('connect', () => {
  // Restart streams on reconnect.
  streams.forEach(s => s._subscribe())
})

wm.on('subscription', (evt) => {
  let id = evt.subscription
  let stream = streams.get(id)
  if (!stream || stream.destroyed) return
  if (!evt.canceled) {
    stream.clock = evt.clock
    evt.files.forEach(file => {
      file.path = path.join(stream.dir, file.name)
      stream.push(file)
    })
  } else {
    stream._subscribe()
      .catch(err => stream.destroy(err))
  }
})

module.exports = {
  async start() {
    await wm.connect()
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
  await wm.watch(root)

  let pack = watched.add(root)
  plugins.attach(pack)

  // Watch package configuration for changes.
  pack.stream({
    include: ['/package.json', '/project.js', '/project.coffee']
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

function createStream(dir, opts = {}) {
  assert.equal(typeof dir, 'string')
  assert.equal(typeof opts, 'object')

  let stream = new WatchStream(dir, opts)
  streams.set(stream.id, stream)

  stream.on('error', (err) => {
    if (/^resolve_projpath/.test(err.message)) {
      // The watch root was deleted. 😧
      stream.push({
        name: '/',
        path: stream.dir,
        exists: false,
      })
    } else {
      console.error(err)
    }
  }).on('close', async () => {
    if (stream.destroyed) {
      streams.delete(stream.id)
      if (fs.exists(dir)) {
        let root = await wm.root(dir)
        if (root) {
          wm.unsubscribe(root, stream.id)
            .catch(console.error)
        }
      }
    }
  })
  return stream._subscribe()
}

async function query(dir, opts = {}) {
  assert.equal(typeof dir, 'string')
  assert.equal(typeof opts, 'object')
  let query = makeQuery({}, opts)

  // Find the actual root.
  let root = await wm.root(dir)
  if (!root) throw Error('Cannot query an unwatched root: ' + dir)

  // Update the relative root.
  let rel = opts.relative_root || ''
  query.relative_root = dir == root ? rel :
    path.join(path.relative(root, dir), rel)

  // Send the query.
  let q = await wm.query(root, query)

  // Return the files, root, and clockspec.
  let res = q.files
  res.root = dir
  res.clock = q.clock
  return res
}
