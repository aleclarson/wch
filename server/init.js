
// Set the process name.
process.title = 'wch'

// Ensure ~/.wch exists
require('fsx').writeDir(require('./paths').WCH_DIR)

// Provide an exit hook.
global.onExit = require('on-exit')

// Setup the log file.
require('./log')

// Override the `wch` package.
let Module = require('module')
let loadModule = Module._load
Module._load = function(req) {
  if (req == 'wch') return require('./client')
  return loadModule.apply(this, arguments)
}
