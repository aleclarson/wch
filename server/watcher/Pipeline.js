let EventEmitter = require('events')
let assert = require('assert')
let path = require('path')
let fs = require('fsx')

// TODO: Support pipeline redirects.

// A pipeline is used to process file streams.
class Pipeline extends EventEmitter {
  each(fn) {
    assert.equal(typeof fn, 'function')
    return this._pipe(async function each(pack, args) {
      await fn.apply(pack, args)
    })
  }
  map(fn) {
    if (fn instanceof Pipeline) {
      return this._pipe(fn.apply.bind(fn))
    }
    assert.equal(typeof fn, 'function')
    return this._pipe(async function map(pack, args) {
      let res = await fn.apply(pack, args)
      if (Array.isArray(res)) {
        for (let i = 0; i < res.length; i++) {
          args[i] = res[i]
        }
      } else {
        args[0] = res
      }
    })
  }
  filter(fn) {
    assert.equal(typeof fn, 'function')
    return this._pipe(async function filter(pack, args) {
      return Boolean(await fn.apply(pack, args))
    })
  }
  read(fn) {
    if (fn == null) return this.map(readFile)
    assert.equal(typeof fn, 'function')
    return this.map(readFile).map(fn)
  }
  save(fn = getPath) {
    assert.equal(typeof fn, 'function')
    return this._pipe(function save(pack, args) {
      let output = args.shift()
      if (output == null) {
        return false
      }
      let dest = fn.apply(pack, args)
      if (typeof dest == 'string') {
        output = Buffer.from(output)
        fs.writeDir(path.dirname(dest))
        fs.writeFile(dest, output)
        return [dest].concat(args)
      }
    })
  }
  delete(fn = getPath) {
    assert.equal(typeof fn, 'function')
    return this._pipe(function(pack, args) {
      let dest = fn.apply(pack, args)
      if (typeof dest == 'string') {
        fs.removeFile(dest, false)
        return [dest].concat(args)
      }
    })
  }
  call(pack, ...args) {
    return this.apply(pack, args)
  }
  bind() {
    return this.call.bind(this, ...arguments)
  }
  async apply(pack, args) {
    let pipes = this._pipes
    for (let i = 0; i < pipes.length; i++) {
      let ok = await pipes[i](pack, args)
      if (Array.isArray(ok)) args = ok
      if (ok === false) return []
    }
  }
  _pipe(dest) {
    assert.equal(typeof dest, 'function')
    if (this._pipes) {
      this._pipes.push(dest)
    } else {
      this._pipes = [dest]
    }
    return this
  }
}

module.exports = Pipeline

//
// Helpers
//

function getPath(file) {
  return typeof file == 'string' ? file : file.path
}

function readFile(file) {
  return [fs.readFile(getPath(file)), file]
}
