let PackageCache = require('./PackageCache')
let PluginCache = require('./PluginCache')
let WatchStream = require('./WatchStream')
let makeQuery = require('./query')
let assert = require('assert')
let noop = require('noop')
let path = require('path')
let fs = require('fsx')

let {WCH_DIR} = require('../paths')

// Watchman duplex stream
let wm = require('./socket')

// Transient streams mapped to their identifiers.
let streamsById = new Map()

// Stream sets mapped to their directories.
let streamsByDir = Object.create(null)

// Watched roots are preserved within this cache.
let watched = null

// Plugins are managed via this cache.
let plugins = new PluginCache()

process.on('exit', () => {
  plugins.destroy()
  streamsById.forEach(s => s.destroy())
})

wm.on('connect', () => {
  // Restart streams on reconnect.
  streamsById.forEach(s => s._subscribe())
})

wm.on('subscription', (evt) => {
  let id = evt.subscription
  let stream = streamsById.get(id)
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
      await watched.load(watchPackage)
    }
  },
  async watch(root) {
    assert.equal(typeof root, 'string')
    if (!watched.has(root)) {
      await watchPackage(root)
      return true
    }
  },
  async unwatch(root) {
    assert.equal(typeof root, 'string')
    if (watched.has(root)) {
      await unwatchPackage(root)
      return true
    }
  },
  getStream,
  stream: createStream,
  query,
  list: () => watched.list(),
}

async function watchPackage(root) {
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

async function unwatchPackage(root) {
  await wm.unwatch(root)

  let pack = watched.get(root)
  watched.delete(root)

  plugins.detach(pack)
  pack._destroy()
}

function getStream(id) {
  return streamsById.get(id)
}

function createStream(dir, opts = {}) {
  assert.equal(typeof dir, 'string')
  assert.equal(typeof opts, 'object')

  let stream = new WatchStream(dir, opts)
  streamsById.set(stream.id, stream)

  let streams = streamsByDir[dir]
  if (streams) {
    streams.add(stream)
  } else {
    streams = new Set([stream])
    streamsByDir[dir] = streams
  }

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
  }).on('close', () => {
    if (stream.destroyed) {
      streamsById.delete(stream.id)

      // Unwatch temporary roots if they haven't been
      // consolidated and all dependent streams are closed.
      streams.delete(stream)
      if (streams.size == 0) {
        delete streamsByDir[dir]
        if (dir == stream.root && !watched.has(dir)) {
          return fs.exists(dir) &&
            wm.unwatch(dir).catch(console.error)
        }
      }

      // TODO: Check if using `stream.root` works after consolidation.
      if (fs.exists(dir)) {
        wm.unsubscribe(stream.root, stream.id)
          .catch(console.error)
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
  let root = findRoot(dir, (await wm.list()).roots)
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

function findRoot(dir, roots) {
  let root = dir
  while (!roots.includes(root)) {
    if (root == '/') return null
    root = path.dirname(root)
  }
  return root
}
