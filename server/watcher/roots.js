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
      let saved = fs.isFile(jsonPath) ?
        JSON.parse(fs.readFile(jsonPath)) : []
      roots = new Set(saved)
      await Promise.all(saved.map(watchPackage))
    }
  },
  has: (root) => roots.has(root),
  list: () => Array.from(roots),
  async add(root) {
    if (!roots.has(root)) {
      roots.add(root)
      await watchPackage(root)
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
  },
  find(dir) {
    let root = dir
    while (!roots.has(root)) {
      if (root == '/') return null
      root = path.dirname(root)
    }
    return root
  }
}

function save() {
  if (!roots) return false
  let json = JSON.stringify(Array.from(roots))
  fs.writeFile(jsonPath, json)
  return true
}

async function watchPackage(root) {
  await wm.watch(root)
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
