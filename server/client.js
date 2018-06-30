let makeQuery = require('./watcher/query')
let Pipeline = require('./watcher/Pipeline')
let emitter = require('./emitter')
let watcher = require('./watcher')

let wch = exports

wch.list = watcher.list
wch.query = watcher.query
wch.stream = watcher.stream
wch.expr = function(query) {
  return makeQuery(query).expression
}

// Plugin events
wch.emit = emitter.emit
wch.on = emitter.on

wch.pipeline = function() {
  return new Pipeline()
}
