let {Readable} = require('readable-stream')
let makeQuery = require('./query')
let noop = require('noop')
let path = require('path')
let uuid = require('uuid')
let cmd = require('./commands')

class WatchStream extends Readable {
  constructor(root, opts) {
    super({
      read: noop, // Ignore backpressure.
      objectMode: true,
      destroy,
    })
    this.id = uuid()
    this.path = root
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
    this.promise = cmd.watch(this.path).then(async (res) => {
      let query = makeQuery({}, this.opts)
      query.relative_root = res.relative_path || ''

      // Crawl the directory.
      if (this.opts.crawl && !this.crawled) {
        let q = await cmd.query(res.watch, query)
        this.clock = q.clock
        q.files.forEach(file => {
          file.path = path.join(this.path, file.name)
          this.push(file)
        })

        // Avoid crawling on reconnect.
        this.crawled = true
      }

      // Ensure the `clock` property exists.
      else if (this.clock == null) {
        this.clock = (await cmd.clock(res.watch)).clock
      }

      query.since = this.clock
      await cmd.subscribe(res.watch, this.id, query)
    })
    this.promise.catch(err => this.destroy(err))
    return this
  }
}

// 'readable-stream' does not emit "close" events by default.
function destroy(err, done) {
  done(err)
  process.nextTick(() => this.emit('close'))
}

module.exports = WatchStream
