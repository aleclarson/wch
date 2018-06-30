let noop = require('noop')
let path = require('path')
let cmd = require('./commands')
let fs = require('fsx')

let {WCH_DIR} = require('../paths')

function PackageCache(cacheName) {
  let packs = Object.create(null)

  let persist = noop
  if (cacheName) {
    let cachePath = path.join(WCH_DIR, cacheName)
    this.load = async function(each) {
      this.load = noop

      let cache, count = 0
      if (fs.isFile(cachePath)) {
        cache = JSON.parse(fs.readFile(cachePath))

        // Synchronize our watch list with Watchman.
        let roots = await cmd.roots()
        await Promise.all(cache.map(dir => {
          let link = fs.realPath(dir)
          if (fs.exists(link) && cmd.root(link, roots)) {
            count += 1; return each(dir)
          }
        }))
      }

      // Set the `persist` function *after* loading to avoid needless writes.
      persist = function() {
        let roots = Object.keys(packs)
        fs.writeFile(cachePath, JSON.stringify(roots))
      }

      // Persist our watch list if any roots were removed.
      // if (cache && count < cache.length) persist()
      persist()
    }
  } else {
    this.load = noop
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
