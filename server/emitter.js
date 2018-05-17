let {Readable} = require('readable-stream')
let noop = require('noop')

let streams = new Set()
let events = Object.create(null)
let all = []

function emit(id, ...args) {
  let subs = events[id]
  if (subs) subs.forEach(fn => fn(...args))
  if (all.length) all.forEach(fn => fn(id, args))
  if (streams.size) {
    let event = id + '\n' + JSON.stringify(args) + '\n\n'
    streams.forEach(stream => {
      stream.push(event)
    })
  }
}

function on(id, fn) {
  if (id == '*') {
    all.push(fn)
  } else {
    id.split(' ').forEach(id => {
      let subs = events[id]
      if (!subs) events[id] = [fn]
      else subs.push(fn)
    })
  }
  return () => off(id, fn)
}

function off(id, fn) {
  if (id == '*') {
    remove(all, fn)
  } else {
    id.split(' ').forEach(id => {
      let subs = events[id]
      if (subs) {
        remove(subs, fn)
        if (!subs.length)
          delete events[id]
      }
    })
  }
}

function remove(subs, fn) {
  let idx = subs.indexOf(fn)
  if (idx >= 0) subs.splice(idx, 1)
}

function stream() {
  let stream = new Readable({
    read: noop, // No pulling
    destroy,
  }).on('close', () => {
    streams.delete(stream)
  })
  streams.add(stream)
  return stream
}

// 'readable-stream' does not emit "close" by default
function destroy(err, done) {
  done(err)
  process.nextTick(() => this.emit('close'))
}

module.exports = {
  emit, on, off, stream,
}
