let emitter = require('./emitter')
let watcher = require('./watcher')
let Router = require('yiss')
let wch = require('./client')
let log = require('./log')
let fs = require('fsx')

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
  return wch.query(json.root, json.query).then(files => {
    let {root, clock} = files
    return {files, root, clock}
  }, (err) => {
    res.set('Error', err.message)
    return 400
  })
})

// Map clients to their watch streams.
let clients = Object.create(null)

function unwatch(stream) {
  let streams = clients[stream.clientId]
  if (streams) {
    streams.delete(stream)
    stream.destroy()
  }
}

// Watchman errors to be ignored.
const quietErrorRE = /^(resolve_projpath):/

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
  if (!fs.exists(root)) {
    res.set('Error', '`root` does not exist')
    return 400
  }

  let stream = wch.stream(root, opts)
  stream.clientId = clientId
  clients[clientId].add(stream)

  stream.on('error', (err) => {
    if (!stream.destroyed) stream.destroy()
    if (!quietErrorRE.test(err.message)) {
      console.error(err)
    }
  }).on('close', () => {
    unwatch(stream)
  })

  return stream.ready(() => {
    if (stream.destroyed) {
      return 204
    }
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
  let stream = watcher.streams.get(id)
  if (stream) unwatch(stream)
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
