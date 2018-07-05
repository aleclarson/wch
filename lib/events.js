const se = require('socket-events')

const events = se.events()

events.__proto__ = {
  __proto__: events.__proto__,
  on(id, fn) {
    super.on(id, fn)
    return new Subscriber(id, fn)
  }
}

module.exports = events

class Subscriber {
  constructor(id, fn) {
    this.id = id
    this.fn = fn
  }
  dispose() {
    events.off(this.id, this.fn)
  }
}
