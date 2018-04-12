let emitter = require('./emitter')
let plugins = require('./plugins')
let log = require('./log')
let _ = require('./watcher')

async function wch(root) {
  if (await _.watch(root)) {
    log.pale_green('Watching:', root)
    return true
  }
}

wch.unwatch = function(root) {
  if (_.unwatch(root)) {
    log.pale_green('Unwatched:', root)
    return true
  }
}

let Plugin = require('./Plugin')
wch.plugin = function(name) {
  return new Plugin(name)
}

// Plugin events
wch.emit = emitter.emit
wch.on = emitter.on

wch.list = _.list
wch.query = _.query
wch.stream = _.stream
wch.log = log

module.exports = wch
