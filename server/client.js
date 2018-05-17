let Pipeline = require('./watcher/Pipeline')
let emitter = require('./emitter')
let wm = require('./watcher')

let wch = exports

wch.list = require('./watcher').list
wch.query = wm.query
wch.stream = wm.stream

// Plugin events
wch.emit = emitter.emit
wch.on = emitter.on

wch.pipeline = function() {
  return new Pipeline()
}

module.exports = wch
