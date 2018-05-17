let emitter = require('./emitter')
let watcher = require('./watcher')
let Router = require('yiss')
let wch = require('./client')
let log = require('./log')

let api = new Router()

api.GET('/roots', async () => {
  let roots = await wch.list()
  return {roots}
})

api.listen('PUT|DELETE', '/roots', async (req, res) => {
  let json = await req.json()
  if (typeof json.root != 'string') {
    res.set('Error', '`root` must be a string')
    return 400
  }
  if (req.method == 'PUT') {
    let ok = await watcher.watch(json.root)
    if (!ok) return {error: 'Already watching'}
    log.pale_green('Watched:', json.root)
  } else {
    let ok = await watcher.unwatch(json.root)
    if (!ok) return {error: 'Not watching'}
    log.pale_pink('Unwatched:', json.root)
  }
  return true
})

api.GET('/query', async (req, res) => {
  let json = await req.json()
  if (typeof json.root != 'string') {
    res.set('Error', '`root` must be a string')
    return 400
  }
  return wch.query(json.root, json.opts)
})

// Map clients to their watch streams.
let clients = Object.create(null)

api.POST('/watch', async (req, res) => {
  let clientId = req.get('x-client-id')
  if (!clientId) {
    res.set('Error', '`x-client-id` must be set')
    return 400
  }
  if (clients[clientId] == null) {
    res.set('Error', '`x-client-id` is invalid')
    return 400
  }
  let {root, opts} = await req.json()
  if (typeof root != 'string') {
    res.set('Error', '`root` must be a string')
    return 400
  }

  let stream = wch.stream(root, opts)
  stream.clientId = clientId
  clients[clientId].add(stream)
  return stream.ready(() => {
    if (stream.destroyed) return
    stream.on('data', (file) => {
      emitter.emit('watch', {
        id: stream.id,
        file,
      })
    })
    return {id: stream.id}
  }).catch(err => {
    res.set('Error', err.message)
    return 400
  })
})

api.POST('/unwatch', async (req, res) => {
  let {id} = await req.json()
  if (typeof id != 'string') {
    res.set('Error', '`id` must be a string')
    return 400
  }
  let stream = wch.stream.get(id)
  clients[stream.clientId].delete(stream)
  stream.destroy()
  return 200
})

api.GET('/events', (req, res) => {
  let clientId = req.get('x-client-id')
  if (!clientId) {
    res.set('Error', '`x-client-id` header must be set')
    return 400
  }
  if (clients[clientId] != null) {
    res.set('Error', '`x-client-id` already in use')
    return 400
  }

  res.setTimeout(0)
  res.set({
    'Connection': 'keep-alive',
    'Content-Type': 'text/event-stream',
    'Transfer-Encoding': 'chunked',
  })
  res.flushHeaders()

  // Watch streams are stored here.
  clients[clientId] = new Set()

  let stream = emitter.stream()
  stream.on('error', (err) => {
    console.error(err.stack)
  }).pipe(res).on('close', () => {
    stream.destroy()
    clients[clientId].forEach(s => s.destroy())
    delete clients[clientId]
  })
})

api.POST('/stop', (req) => {
  log.red('Shutting down...')
  setTimeout(() => {
    req.app.close()
  }, 100)
  return true
})

module.exports = api.bind()
