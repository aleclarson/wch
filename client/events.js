let noop = require('noop')

let watched = Object.create(null)
let events = Object.create(null)

exports.on = function(id, fn) {
  id.split(' ').forEach(id => {
    let subs = events[id]
    if (subs) subs.push(fn)
    else events[id] = [fn]
  })
  return new Subscriber(id, fn)
}

exports.watch = function(id, fn) {
  watched[id] = fn
  return new Watcher(id)
}

exports.emit = function(id, args) {
  if (id == 'watch') {
    let [event] = args
    let fn = watched[event.id]
    if (fn) fn(event.file)
  } else {
    let subs = events[id]
    if (subs) subs.slice().forEach(fn => call(fn, args))
  }
}

exports.clear = function() {
  events = Object.create(null)
  watched = Object.create(null)
}

class Subscriber {
  constructor(id, fn) {
    this.id = id
    this.fn = fn
  }
  dispose() {
    this.dispose = noop
    this.id.split(' ').forEach(id => {
      let subs = events[id]
      if (subs.length > 1) {
        subs.splice(subs.indexOf(this.fn), 1)
      } else delete events[id]
    })
  }
}

class Watcher {
  constructor(id) {
    this.id = id
  }
  dispose() {
    this.dispose = noop
    delete watched[this.id]
  }
}

function call(fn, args) {
  if (!args) return fn()
  switch (args.length) {
    case 1: return fn(args[0])
    case 2: return fn(args[0], args[1])
    default: return fn(...args)
  }
}
