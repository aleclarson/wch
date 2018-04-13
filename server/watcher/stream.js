let {Readable} = require('readable-stream')
let makeQuery = require('./query')
let noop = require('noop')
let path = require('path')
let uuid = require('uuid')
let wm = require('./watchman')

let debug = /\b(wch_stream)\b/.test(process.env.DEBUG)

// Streams are not persisted between restarts.
let streams = new Map()

function stream(root, opts) {
  let stream = new WatchStream(root, opts)
  let starting = stream._subscribe()
  if (debug) {
    console.log('create stream:', {
      id: stream.id,
      root: stream.root,
      opts: stream.opts,
    })
  }
  return starting
}

stream.get = function(id) {
  return streams.get(id)
}

stream.each = function(fn) {
  streams.forEach(fn)
}

module.exports = stream

wm.on('connect', () => {
  streams.forEach(stream => {
    stream._subscribe()
  })
}).on('subscription', (evt) => {
  let id = evt.subscription
  let stream = streams.get(id)
  if (!stream) return
  if (!evt.canceled) {
    stream.clock = evt.clock
    evt.files.forEach(file => {
      file.path = path.join(stream.root, file.name)
      stream.push(file)
    })
  } else { // Restart our stream if accidentally cancelled.
    if (debug) console.log('restart stream:', stream.id)
    stream._subscribe()
  }
})

// stream -> roots -> stream
let roots = require('./roots')

class WatchStream extends Readable {
  constructor(root, opts = {}) {
    super({
      read: noop, // Ignore backpressure.
      objectMode: true,
    })
    this.root = root
    this.opts = opts
    if (opts.clock != null) {
      this.clock = opts.clock
      delete opts.clock
    }
  }
  _subscribe() {
    if (!this.id) this.id = uuid()
    streams.set(this.id, this)

    // Ensure the root (or some ancestor) is watched.
    wm.watch(this.root).then(async (res) => {
      this.watch = res.watch == this.root ? null : res.watch

      let query = makeQuery({}, this.opts)
      query.relative_root = res.relative_path || ''

      // Crawl the directory.
      if (this.opts.crawl) {
        let q = await wm.query(res.watch, query)
        this.clock = q.clock
        q.files.forEach(file => {
          file.path = path.join(this.root, file.name)
          this.push(file)
        })

        // Avoid crawling on reconnect.
        delete this.opts.crawl
      }

      // Ensure the `clock` property exists.
      else if (this.clock == null) {
        this.clock = (await wm.clock(res.watch)).clock
      }

      query.since = this.clock
      return wm.subscribe(res.watch, this.id, query)
    }).catch(err => {
      this.emit('error', err)
    })
    return this
  }
  async _destroy(err, next) {
    if (debug) console.log('destroy stream:', this.id)
    streams.delete(this.id)
    this.push(null)
    try {
      let root = this.watch || this.root
      if (roots.has(root)) {
        await wm.unsubscribe(root, this.id)
      } else {
        // Ensure the root is unwatched.
        await wm.unwatch(root).catch(noop)
      }
      next(err)
    } catch(err) {
      next(err)
    }
  }
}
