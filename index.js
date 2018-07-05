const {Readable} = require('readable-stream')
const wchQuery = require('./lib/query')
const Runner = require('./lib/runner')
const events = require('./lib/events')
const quest = require('quest')
const path = require('path')
const sock = require('./lib/sock')
const log = require('lodge').debug('wch')
const cp = require('child_process')

const {SOCK_PATH} = require('./paths')

const noop = () => {}
const success = (res) => !res || !res.error

const {run} = new Runner({
  // Track a directory indefinitely.
  track(root) {
    const req = sock.request('PUT', '/roots')
    return quest.json(req, {root}).then(success)
  },
  // Stop tracking a directory.
  untrack(root) {
    const req = sock.request('DELETE', '/roots')
    return quest.json(req, {root}).then(success)
  },
  // Subscribe to matching changes in a directory.
  subscribe(dir, query) {
    const req = sock.request('POST', '/watch', {
      'x-client-id': sock.id,
    })
    return quest.json(req, {dir, query})
  },
  // Destroy a subscription.
  unsubscribe(id) {
    const req = sock.request('POST', '/unwatch')
    return quest.send(req, {id})
  },
  // Find matching paths in a directory.
  query(dir, query) {
    const req = sock.request('GET', '/query')
    return quest.json(req, {dir, query})
  },
  // Fetch the directories being tracked.
  list() {
    return sock.json('/roots')
  }
})

function wch(...args) {
  return run('track', args)
}

wch.connect = sock.connect
wch.on = events.on.bind(events)

wch.unwatch = function(...args) {
  return run('untrack', args)
}

wch.stream = function(dir, query = {}) {
  if (query && typeof query.since == 'object') {
    query.since = Math.floor(query.since.getTime() / 1000)
  }

  const stream = new Readable({
    read: noop, // Push only
    objectMode: true,
    async destroy(err, done) {
      rewatcher.dispose()
      done(err)

      // 'readable-stream' does not emit "close" by default
      process.nextTick(() => stream.emit('close'))
    }
  })

  if (sock.connected) watch()
  const rewatcher = events.on('connect', watch)

  let watcher
  function watch() {
    const init = run('subscribe', [dir, query])
    log('stream:subscribe', init.action)

    init.then(info => {
      if (stream.destroyed) return
      watcher = events.on(info.id, push)
    }).catch(err => {
      log('stream:error', err)
      stream.destroyed || stream.destroy(err)
    })

    // This watcher is scrapped if the connection is lost.
    events.on('close', function onDisconnect() {
      if (watcher) watcher.dispose()

      events.off('close', onDisconnect)
      stream.off('close', onDestroy)
    })

    stream.on('close', onDestroy)
    function onDestroy() {
      log('stream:close', init.action)
      // Cancel the outgoing request (if possible).
      init.action.cancel()
      // The incoming response may never come, but this is
      // the best way to ensure the watch ends gracefully.
      init.then(info => {
        if (watcher) watcher.dispose()
        run('unsubscribe', [info.id]).catch(noop)
        log('stream:unsubscribe', info)
      })
    }
  }

  function push(file) {
    log('stream:push', file)
    stream.push(file)

    // The watch root was deleted!
    if (file.name == '/') {
      stream.destroy()
    }
  }

  return stream
}

wch.query = function(...args) {
  return run('query', args)
}

wch.expr = function(query) {
  return wchQuery(query).expression
}

wch.list = async function() {
  return (await run('list')).roots
}

module.exports = wch
