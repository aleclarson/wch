let {Readable} = require('readable-stream')
let noop = require('noop')
let se = require('socket-events')

let streams = new Set()
let events = se.events()

let emit = events.emit.bind(events)
events.emit = function(name, data) {
  emit(name, data)
  emit('*', name, data)
  if (streams.size) {
    let event = se.encode(name, data)
    streams.forEach(s => s.push(event))
  }
}

events.stream = function() {
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

module.exports = events
