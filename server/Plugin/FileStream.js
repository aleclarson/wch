let EventEmitter = require('events')
let assert = require('assert')
let noop = require('noop')
let path = require('path')
let fs = require('fsx')

// A file stream acts like a readable stream, but never emits "end".
class FileStream extends EventEmitter {
  constructor(drain) {
    super()
    this._piped = []
    if (drain) {
      assert.equal(typeof drain, 'function')
      this._drain = drain
    }
  }
  each(fn) {
    return this._pipe(new TailStream(fn))
  }
  map(fn) {
    assert.equal(typeof fn, 'function')
    return this._pipe(async function(root, args) {
      let res = await fn.apply(root, args)
      if (Array.isArray(res)) {
        for (let i = 0; i < res.length; i++) {
          args[i] = res[i]
        }
      } else {
        args[0] = res
      }
      return true
    })
  }
  filter(fn) {
    return this._pipe(function(root, args) {
      return fn.apply(root, args)
    })
  }
  read(fn) {
    let reader = this.map(readFile)
    return fn ? reader.map(fn) : reader
  }
  save(fn = getPath) {
    assert.equal(typeof fn, 'function')
    return this.each(function(output, file) {
      if (typeof output == 'string') {
        let dest = fn.call(this, file)
        if (typeof dest == 'string') {
          fs.writeFile(dest, output)
          return [dest, file]
        }
      }
    })
  }
  delete(fn = getPath) {
    assert.equal(typeof fn, 'function')
    return this.each(function(...args) {
      if (!args[0]) return
      let dest = fn.apply(this, args)
      if (typeof dest == 'string') {
        fs.removeFile(dest, false)
        return [dest].concat(args)
      }
    })
  }
  push(root, ...args) {
    if (!this.readable) {
      this.emit('error', PushError(this))
      return false
    }
    ptry(async () => {
      let ok = await this._drain(root, args)
      if (ok) drain(this, root, args)
    }).catch(err => {
      this.destroy(err)
    })
    return true
  }
  _drain(args) {
    return true // By default, no map or filter.
  }
  _pipe(dest) {
    if (typeof dest == 'function') {
      dest = new FileStream(dest)
    }

    let src = this
    src._piped.push(dest)
    function close() {
      src._piped.splice(src._piped.indexOf(dest))
      cleanup()
    }

    // Errors propagate upstream.
    dest.on('error', propagate)
    function propagate(err) {
      src.emit('error', err)
    }

    src.on('close', cleanup)
    dest.on('close', close)
    function cleanup() {
      src.removeListener('close', cleanup)
      dest.removeListener('close', close)
      dest.removeListener('error', propagate)
    }

    // Unix-style piping
    return dest
  }
}

FileStream.prototype.readable = true
FileStream.prototype.destroy = destroy
module.exports = FileStream

// A tail stream reads itself and cannot be piped.
class TailStream extends EventEmitter {
  constructor(read) {
    super()
    assert.equal(typeof read, 'function')
    this._read = read
  }
  push(root, ...args) {
    if (args[0] == null) {
      return false
    }
    if (!this.readable) {
      this.emit('error', PushError(this))
      return false
    }
    ptry(async () => {
      let res = await this._read.apply(root, args)
      if (this._after && Array.isArray(res)) {
        await this._after.apply(root, res)
      }
    }).catch(err => {
      this.destroy(err)
    })
    return true
  }
  then(fn) {
    assert.equal(typeof fn, 'function')
    this._after = fn
    return this
  }
}

TailStream.prototype.readable = true
TailStream.prototype.destroy = destroy

//
// Helpers
//

function getPath(file) {
  return typeof file == 'string' ? file : file.path
}

function readFile(file) {
  return [fs.readFile(getPath(file)), file]
}

function cloneArray(arr) {
  let clone = []
  for (let i = 0; i < arr.length; i++) {
    clone.push(arr[i])
  }
  return clone
}

function ptry(fn) {
  return Promise.resolve().then(fn)
}

//
// Stream internals
//

function PushError(stream) {
  let err = Error('stream.push() after EOF')
  err.code = 'ERR_STREAM_PUSH_AFTER_EOF'
  err.stream = stream
  return err
}

function drain(self, root, args) {
  let drains = cloneArray(self._piped)
  for (let i = 0; i < drains.length; i++) {
    drains[i].push(root, ...args)
    if (self.destroyed) break
  }
}

function destroy(err) {
  if (!this.destroyed) {
    this.destroyed = true
    if (this.readable) {
      this.readable = false
    }
    if (this.writable) {
      this.writable = false
    }
    process.nextTick(emitCloseNT, this)
    if (err) {
      process.nextTick(emitErrorNT, this, err)
    }
  }
}

function emitCloseNT(self) {
  self.emit('close')
}
function emitErrorNT(self, err) {
  self.emit('error', err)
}

// function write(...args) {
//   if (!this.writable) {
//     let err = Error('write after end')
//     err.code = 'ERR_STREAM_WRITE_AFTER_END'
//     this.emit('error', err)
//     return false
//   }
//   drain(this, args)
//   return this.writable
// }
// function endWritable() {
//   if (this.writable) {
//     this.writable = false
//     process.nextTick(emitFinishNT, this)
//   }
// }
// function emitFinishNT(self) {
//   self.emit('finish')
// }
