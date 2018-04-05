let events = Object.create(null)
let all = []

function emit(id, ...args) {
  let subs = events[id]
  if (subs)
    subs.forEach(fn => fn(...args))
  all.forEach(fn => fn(id, args))
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

module.exports = {
  emit, on, off,
}
