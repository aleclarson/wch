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

exports.emit = function(id, $1, $2) {
  if (id == 'watch') {
    let fn = watched[$1.id]
    if (fn) fn($1.file)
  } else {
    let subs = events[id]
    if (subs) {
      subs = subs.slice()
      let i = -1, len = subs.length
      switch (arguments.length) {
        case 1:
          for (;i < len; i++) subs[i]()
          break
        case 2:
          for (;i < len; i++) subs[i]($1)
          break
        default:
          for (;i < len; i++) subs[i]($1, $2)
          break
      }
    }
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
