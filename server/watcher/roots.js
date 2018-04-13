let plugins = require('../plugins')
let stream = require('./stream')
let path = require('path')
let log = require('../log')
let wm = require('./watchman')
let fs = require('fsx')

let {WCH_DIR} = require('../paths')

let roots
let jsonPath = WCH_DIR + '/roots.json'

// Hold onto `package.json` streams.
let streams = new Map()

module.exports = {
  async load() {
    if (!roots) {
      let watched = (await wm.list()).roots
      let saved = fs.isFile(jsonPath) ?
        JSON.parse(fs.readFile(jsonPath)) : []

      // Remove unwatched roots (possibly due to reaping).
      roots = new Set(saved.filter(root => watched.includes(root)))
      if (roots.size < saved.length) save()
      roots.forEach(watchPlugins)
    }
  },
  has: (root) => roots.has(root),
  list: () => Array.from(roots),
  async add(root) {
    if (!roots.has(root)) {
      roots.add(root)
      await wm.watch(root)
      watchPlugins(root)
      return save()
    }
  },
  remove(root) {
    if (roots.has(root)) {
      streams.get(root).destroy()
      streams.delete(root)
      plugins.unload(root)
      roots.delete(root)
      return save()
    }
  }
}

function save() {
  if (!roots) return false
  let json = JSON.stringify(Array.from(roots))
  fs.writeFile(jsonPath, json)
  return true
}

// Load plugins and watch for added/removed plugins.
function watchPlugins(root) {
  plugins.load(root)
  streams.set(root, stream(root, {
    include: ['/package.json']
  }).on('data', (file) => {
    if (file.exists) {
      plugins.load(root)
    } else {
      // TODO: Does this happen when the root itself is deleted?
      log.pale_red('Missing package:', file.path)
    }
  }).on('error', (err) => {
    // TODO: Restart the stream.
    console.error(err.stack)
  }))
}
