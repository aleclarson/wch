let {PassThrough} = require('stream')
let plugins = require('./plugins')
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
    let ok = await wch(json.root)
    if (!ok) return {error: 'Already watching'}
  } else {
    let ok = wch.unwatch(json.root)
    if (!ok) return {error: 'Not watching'}
  }
  return true
})

api.GET('/events/file', async (req, res) => {
  if (req.accepts('text/json-stream')) {
    let {root, opts} = await req.json()
    if (typeof root != 'string') {
      res.set('Error', '`root` must be a string')
      return 400
    }
    pipeJson(wch.stream(root, opts), res)
  }
  else {
    return 406
  }
})

setInterval(() => {
  wch.emit('date', new Date)
}, 2000)

api.GET('/events/plugin', async (req, res) => {
  if (req.accepts('text/json-stream')) {
    let body = await req.readBody()
    if (!body) {
      res.set('Error', 'Request body must be a string')
      return 400
    }
    let events = body.toString().split(' ')
    let stream = new PassThrough({
      objectMode: true,
    })
    stream.on('end', wch.on('*', (id, args) => {
      if (events.includes(id)) {
        stream.write({id, args})
      }
    }))
    pipeJson(stream, res)
  }
  else {
    return 406
  }
})

api.POST('/stop', (req) => {
  log.red('Shutting down...')
  setTimeout(() => {
    req.app.close()
    watcher.stop()
  }, 100)
  return true
})

module.exports = api.bind()

function pipeJson(stream, res) {
  if (!stream._readableState.objectMode) {
    throw Error('JSON stream must be in object mode')
  }
  stream.on('data', (obj) => {
    try {
      res.write(JSON.stringify(obj))
    } catch(err) {
      stream.emit('error', err)
    }
  }).on('end', () => res.end())
  res.on('close', () => stream.destroy())
  res.set({
    'Connection': 'keep-alive',
    'Content-Type': 'text/json-stream; charset=utf-8',
    'Transfer-Encoding': 'chunked',
  })
  res.flushHeaders()
  res.setTimeout(0)
}
