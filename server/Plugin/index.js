let EventEmitter = require('events')
let assert = require('assert')
let path = require('path')
let huey = require('huey')

let FileStream = require('./FileStream')
let log = require('../log')
let _ = require('../watcher')

class Plugin extends EventEmitter {
  constructor(name) {
    super()
    this.roots = new Map()
    if (name) {
      this.name = name
      this.log = createLogger(name)
      this.log.verbose = log.verbose
    } else {
      this.log = log
    }
    this.trace = (err) => {
      this.log(err.stack)
    }
    this.fatal = (err) => {
      this.emit('error', err)
    }
  }
  run() {
    this.emit('run')
  }
  add(root, pack) {
    let rootObj = new Root(root, pack)
    rootObj.plugin = this
    if (this.streams) {
      this.streams.forEach(stream => {
        rootObj.watch(stream)
      })
    }
    this.roots.set(root, rootObj)
    this.emit('add', rootObj)
  }
  remove(root) {
    let rootObj = this.roots.get(root)
    if (!rootObj) return
    if (rootObj.streams) {
      rootObj.streams.forEach(stream => {
        stream.destroy()
      })
    }
    this.roots.delete(root)
    this.emit('remove', rootObj)
  }
  watch(dir, opts) {
    if (arguments.length == 1) {
      opts = dir, dir = ''
    }

    let stream = new FileStream()
    stream.dir = dir
    stream.opts = opts

    if (this.streams) {
      this.streams.push(stream)
    } else this.streams = [stream]

    return stream.on('close', () => {
      let idx = this.streams.indexOf(stream)
      this.streams.splice(idx, 1)
    }).on('error', this.fatal)
  }
  stop() {
    this.emit('stop')
    if (this.streams) {
      let destroy = (stream) => stream.destroy()
      this.roots.forEach(rootObj => {
        rootObj.streams.forEach(destroy)
      })
      this.streams.forEach(destroy)
    }
  }
}

module.exports = Plugin

class Root {
  constructor(root, pack) {
    Object.assign(this, pack)
    this.path = root
  }
  contains(file) {
    if (typeof file == 'string') {
      assert(path.isAbsolute(file))
    } else {
      file = file.path
      if (typeof file != 'string') return false
    }
    return path.relative(this.path, file)[0] !== '.'
  }
  watch(dir, opts) {
    let dest
    if (dir instanceof FileStream) {
      dest = dir
    } else {
      if (typeof dir != 'string') {
        opts = dir, dir = ''
      }
      dest = new FileStream()
      dest.on('error', this.plugin.fatal)
      dest.dir = dir
      dest.opts = opts
    }

    dir = path.join(this.path, dest.dir)
    opts = Object.assign({
      crawl: true,
    }, dest.opts)

    let stream = _.stream(dir, opts)
      .on('data', (file) => dest.push(this, file))
      .on('error', this.plugin.trace)
      .on('close', () => {
        let idx = this.streams.indexOf(stream)
        this.streams.splice(idx, 1)
      })

    if (this.streams) {
      this.streams.push(stream)
    } else this.streams = [stream]

    return dest.on('close', () => {
      stream.destroy()
    })
  }
}

function createLogger(name) {
  name = name.replace(/^wch-/, '')
  return huey.log(function(...args) {
    log(huey.coal(`[${name}]`), ...args)
  })
}
