let {Readable} = require('stream')
let noop = require('noop')
let path = require('path')
let uuid = require('uuid')
let wm = require('./watchman')

// Streams are not persisted between restarts.
let streams = new Map()

function stream(root, opts) {
  let stream = new WatchStream(root, opts)
  return stream._subscribe()
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
  } else {
    // Someone stopped our stream, so restart it.
    stream._subscribe()
  }
})

// stream -> roots -> stream
let roots = require('./roots')

// stream -> query -> roots -> stream
let query = require('./query')

class WatchStream extends Readable {
  constructor(root, opts) {
    super({
      read: noop, // Ignore backpressure.
      objectMode: true,
    })
    this.root = root
    this.opts = opts || {}
    if (opts && opts.clock != null) {
      this.clock = opts.clock
    }
  }
  _subscribe() {
    if (!this.id) this.id = uuid()
    streams.set(this.id, this)

    // Ensure the root (or some ancestor) is watched.
    wm.watch(this.root).then(async (res) => {
      this.watch = res.watch == this.root ? null : res.watch

      // Fetch the current time if no clock is set.
      if (this.clock == null) {
        this.clock = (await wm.clock(res.watch)).clock
      }

      return wm.subscribe(res.watch, this.id, {
        since: this.clock || 0,
        fields: this.opts.fields || ['name', 'exists', 'new'],
        expression: query.filter(this.opts),
        relative_root: res.relative_path || '',
      })
    }).catch(err => {
      this.emit('error', err)
    })
    return this
  }
  _destroy(err, cb) {
    streams.delete(this.id)

    let root = this.watch || this.root
    let p = roots.has(root) ?
      wm.unsubscribe(root, this.id) :
      wm.unwatch(root)

    p.then(() => {
      this.push(null)
      cb(err)
    }, cb)
  }
}
