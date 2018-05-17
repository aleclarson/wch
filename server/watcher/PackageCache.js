let noop = require('noop')
let path = require('path')
let wm = require('./socket')
let fs = require('fsx')

let {WCH_DIR} = require('../paths')

function PackageCache(cacheName) {
  let packs = Object.create(null)
  let cachePath = path.join(WCH_DIR, cacheName)

  let persist = noop
  this.load = async function(each) {
    this.load = noop
    if (fs.isFile(cachePath)) {
      let cache = JSON.parse(fs.readFile(cachePath))
      let {roots} = await wm.list()

      // Watch roots must exist, be directories, and
      // not be unwatched by the user or reaped by Watchman.
      let count = 0
      await Promise.all(cache.map(root => {
        if (fs.isDir(root)) {
          let dir = root
          while (!roots.includes(dir)) {
            if (dir == '/') return
            dir = path.dirname(dir)
          }
          count++
          return each(root)
        }
      }))

      persist = function() {
        let cache = JSON.stringify(Object.keys(packs))
        fs.writeFile(cachePath, cache)
      }
      if (count < cache.length) {
        persist()
      }
    }
  }

  this.has = function(root) {
    return packs[root] !== undefined
  }

  this.get = function(root) {
    return packs[root]
  }

  this.list = function() {
    return Object.keys(packs)
  }

  // Lazy-load since Package uses `watcher.stream()`
  let Package = require('./Package')

  this.add = function(root) {
    let pack = new Package(root)
    packs[root] = pack
    persist()
    return pack
  }

  this.delete = function(root) {
    delete packs[root]
    persist()
  }
}

module.exports = PackageCache
