let assert = require('assert')
let path = require('path')
let log = require('../log')
let wch = require('.')
let fs = require('fsx')

function Package(path) {
  this.path = path
  this._meta = null
  this._streams = new Set()
}

Package.prototype = new Proxy({
  proxy(methods) {
    if (!this._proxy) {
      this._proxy = {
        get: (obj, key, ctx) => {
          let val = Reflect.get(obj, key, ctx)
          return val === undefined ? this[key] : val
        }
      }
    }
    methods = new Proxy(methods, this._proxy)
    return Object.create(methods)
  },
  stream(dir, opts) {
    if (arguments.length == 1) {
      opts = dir, dir = this.path
    } else {
      if (path.isAbsolute(dir))
        throw Error('Absolute paths are not allowed')
      if (dir.startsWith('../'))
        throw Error('Relative paths cannot start with ../')
      dir = path.resolve(this.path, dir)
    }

    let stream = wch.stream(dir, opts)

    if (this.hasOwnProperty('_streams')) {
      this._streams.add(stream)
    } else {
      this._streams = new Set([stream])
    }

    return stream.on('close', () => {
      this._streams.delete(stream)
    })
  },
  contains(file) {
    if (!file) return false
    if (typeof file == 'string') {
      assert(path.isAbsolute(file))
    } else {
      file = file.path
      if (typeof file != 'string') return false
    }
    return path.relative(this.path, file)[0] !== '.'
  },
  read(force) {
    if (!force && this._meta) return true
    let metaPath = path.join(this.path, 'package.json')
    if (fs.isFile(metaPath)) {
      let meta = fs.readFile(metaPath)
      try {
        this._meta = JSON.parse(meta)
        return true
      } catch(err) {
        log.yellow('warn:', `Failed to read 'package.json' in '${this.path}'`)
        console.error(err.stack)
      }
    }
    this._meta = null
    return false
  },
  _destroy() {
    this._streams.forEach(s => s.destroy())
  }
}, {
  // Forward property access to the `meta` object,
  // so we can reload "package.json" quickly and cleanly.
  get(self, key, ctx) {
    if (ctx !== Package.prototype) {
      let meta = Reflect.get(ctx, '_meta', ctx)
      if (meta) var val = meta[key]
    }
    return val === undefined ? self[key] : val
  }
})

module.exports = Package
