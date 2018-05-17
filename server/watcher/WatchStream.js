let {Readable} = require('readable-stream')
let makeQuery = require('./query')
let noop = require('noop')
let path = require('path')
let uuid = require('uuid')
let wm = require('./commands')

class WatchStream extends Readable {
  constructor(dir, opts) {
    super({
      read: noop, // Ignore backpressure.
      objectMode: true,
      destroy,
    })
    this.id = uuid()
    this.dir = dir
    this.opts = opts
    if (opts.clock != null) {
      this.clock = opts.clock
      delete opts.clock
    }
  }
  ready(fn) {
    return this.promise.then(fn)
  }
  catch(fn) {
    return this.promise.catch(fn)
  }
  _subscribe() {
    let dir = this.dir
    this.promise = wm.watch(dir).then(async (res) => {
      this.root = res.watch

      let query = makeQuery({}, this.opts)
      query.relative_root = res.relative_path || ''

      // Crawl the directory.
      if (this.opts.crawl && !this.crawled) {
        let q = await wm.query(res.watch, query)
        this.clock = q.clock
        q.files.forEach(file => {
          file.path = path.join(dir, file.name)
          this.push(file)
        })

        // Avoid crawling on reconnect.
        this.crawled = true
      }

      // Ensure the `clock` property exists.
      else if (this.clock == null) {
        this.clock = (await wm.clock(res.watch)).clock
      }

      query.since = this.clock
      await wm.subscribe(res.watch, this.id, query)
    })
    return this
  }
}

// 'readable-stream' does not emit "close" events by default.
function destroy(err, done) {
  done(err)
  process.nextTick(() => this.emit('close'))
}

module.exports = WatchStream
