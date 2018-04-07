let {PassThrough} = require('stream')
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
    let ok = await wch(json.root)
    if (!ok) return {error: 'Already watching'}
  } else {
    let ok = wch.unwatch(json.root)
    if (!ok) return {error: 'Not watching'}
  }
  return true
})

api.POST('/watch', async (req, res) => {
  let {root, opts} = await req.json()
  if (typeof root != 'string') {
    res.set('Error', '`root` must be a string')
    return 400
  }
  let stream = wch.stream(root, opts)
  stream.on('data', (file) => {
    log.pale_green('changed:', file.path)
    emitter.emit('watch', {
      id: stream.id,
      file,
    })
  })
  return {id: stream.id}
})

api.POST('/unwatch', async (req, res) => {
  let {id} = await req.json()
  if (typeof id != 'string') {
    res.set('Error', '`id` must be a string')
    return 400
  }
  wch.stream.destroy(id)
  return 200
})

api.GET('/events', (req, res) => {
  res.setTimeout(0)
  res.set({
    'Connection': 'keep-alive',
    'Content-Type': 'text/event-stream',
    'Transfer-Encoding': 'chunked',
  })
  res.flushHeaders()

  let stream = emitter.stream()
    .on('error', (err) => console.error(err.stack))
    .pipe(res).on('close', () => stream.end())
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
