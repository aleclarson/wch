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

api.GET('/events', async (req, res) => {
  if (req.accepts('text/event-stream')) {
    let json = await req.json()
    if (typeof json.root != 'string') {
      res.set('Error', '`root` must be a string')
      return 400
    }

    res.setTimeout(0)
    res.set({
      'Connection': 'keep-alive',
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Transfer-Encoding': 'chunked',
    }).flushHeaders()

    let stream = wch.stream(json.root, json.opts)
    stream.on('data', (file) => {
      res.write(JSON.stringify(file))
    }).on('end', () => res.end())

    // Stop streaming if the socket closes.
    res.on('close', () => stream.destroy())
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
