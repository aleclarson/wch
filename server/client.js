let Pipeline = require('./watcher/Pipeline')
let emitter = require('./emitter')
let watcher = require('./watcher')

let wch = exports

wch.list = watcher.list
wch.query = watcher.query
wch.stream = watcher.stream

// Plugin events
wch.emit = emitter.emit
wch.on = emitter.on

wch.pipeline = function() {
  return new Pipeline()
}
