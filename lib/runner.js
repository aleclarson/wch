const events = require('./events')
const sock = require('./sock')

const ok = Promise.resolve()
const noop = () => {}

// Actions that block the queue (to avoid race conditions)
const blockers = {track: true, untrack: true, unsubscribe: true}

// Run an action when the socket is connected.
// Otherwise, wait for the socket to connect.
module.exports = function Runner(actions) {
  this.actions = actions
  this.queue = []

  let flushing = false
  this.run = (name, args) => {
    let action
    const promise = new Promise((resolve, reject) => {
      const queue = this.queue
      queue.push(action = {
        name,
        args,
        queue,
        index: queue.length,
        resolve,
        reject,
        cancel,
      })
      if (!sock.connected) return
      if (!flushing) {
        flushing = true
        process.nextTick(this.flush)
      }
    })
    promise.action = action
    return promise
  }

  this.flush = async () => {
    const queue = this.queue
    this.queue = []
    flushing = false

    let i = -1,
      last = queue.length - 1,
      batch = []

    while (i !== last) {
      const action = queue[++i]
      if (!action) continue

      if (!sock.connected) {
        // Process the remaining actions once reconnected.
        this.queue = queue.slice(i).concat(this.queue)
        return
      }

      const blocking = blockers.hasOwnProperty(action.name)
      if (blocking && (i == 0 || action.name == queue[i - 1].name)) {
        // Wait for non-blocking actions to finish.
        await Promise.all(batch)
        batch = []
      }

      const fn = actions[action.name]
      batch.push(
        ok.then(action.args ? () => fn(...action.args) : fn)
          .then(action.resolve, action.reject))

      action.cancel = noop
      action.queue = null

      if (blocking && (i == last || action.name !== queue[i + 1].name)) {
        // Wait for blocking actions to finish.
        await Promise.all(batch)
        batch = []
      }
    }

    switch (batch.length) {
      case 0: return
      case 1: return batch[0]
      default: return Promise.all(batch)
    }
  }

  events.on('connect', this.flush)
}

// Shared `action.cancel` method
function cancel() {
  this.queue[this.index] = null
  this.cancel = noop
}
