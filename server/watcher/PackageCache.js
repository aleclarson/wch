let noop = require('noop')
let path = require('path')
let cmd = require('./commands')
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

      // Synchronize our watch list with Watchman.
      let count = 0, roots = await cmd.roots()
      await Promise.all(cache.map(dir => {
        if (fs.exists(dir) && cmd.root(dir, roots)) {
          count += 1; return each(dir)
        }
      }))

      // Set the `persist` function *after* loading to avoid needless writes.
      persist = function() {
        let cache = JSON.stringify(Object.keys(packs))
        fs.writeFile(cachePath, cache)
      }

      // Persist our watch list if any roots were removed.
      if (count < cache.length) persist()
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
