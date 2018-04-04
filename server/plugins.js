let huey = require('huey')
let log = require('./log')
let fs = require('fsx')

let pluginsByName = Object.create(null)
let pluginsByRoot = Object.create(null)

// Load plugins for a package root.
exports.load = function(root) {
  let packPath = root + '/package.json'
  if (fs.isFile(packPath)) {
    let pack = fs.readFile(packPath)
    try {
      pack = JSON.parse(pack)
    } catch(err) {
      log.yellow('warn:', packPath + ' has invalid json: ' + err.message)
      return false
    }
    let found = findPlugins(pack.devDependencies)
    let loaded = pluginsByRoot[root] || []
    if (found && found.length) {
      if (!loaded.length)
        pluginsByRoot[root] = loaded

      // Handle added plugins.
      found.forEach(name => {
        if (!loaded.includes(name)) {
          let plugin = pluginsByName[name] || bootPlugin(name)
          if (!plugin) return
          try {
            plugin.load(root)
            loaded.push(name)
          } catch(err) {
            log.red('PluginError:', `'${name}' failed to load root: ` + root)
            console.error(err.stack)
          }
        }
      })
      // Handle deleted plugins.
      loaded.forEach(name => {
        if (!found.includes(name)) {
          unloadPlugin(name, root)
        }
      })
      return true
    }
    // Remove every plugin.
    else if (loaded.length) {
      this.unload(root)
    }
  }
  return false
}

// Unload plugins for a package root (or all roots).
exports.unload = function(root) {
  if (arguments.length) {
    let loaded = pluginsByRoot[root]
    if (loaded) {
      delete pluginsByRoot[root]
      loaded.forEach(name => {
        try {
          unloadPlugin(name, root)
        } catch(err) {
          log.red('PluginError:', `'${name}' failed to unload root: ` + root)
          console.error(err.stack)
        }
      })
    }
  } else {
    log.red('Unloading all plugins...')
    for (let name in pluginsByName) {
      let plugin = pluginsByName[name]
      if (plugin.unload) {
        plugin.roots.forEach(root => {
          plugin.unload(root)
        })
      }
      plugin.roots.clear()
      if (plugin.stop) plugin.stop()
    }
    pluginsByName = Object.create(null)
    pluginsByRoot = Object.create(null)
  }
}

function findPlugins(deps) {
  return deps && Object.keys(deps)
    .filter(name => name.startsWith('wch-'))
}

function bootPlugin(name) {
  if (log.verbose)
    log.pale_blue('Booting plugin:', name)
  try {
    let plugin = require(name)
    if (!plugin || !plugin.load) {
      return log.red('PluginError:', `'${name}' failed to return` +
        ` an object with a 'load' method!`)
    }
    plugin.roots = new Set()
    if (plugin.boot) plugin.boot()
    pluginsByName[name] = plugin
    return plugin
  }
  catch(err) {
    let missing = new RegExp(`^Cannot find module '${name}'$`)
    if (missing.test(err.message)) {
      console.error(Error('Plugin not found in $NODE_PATH: ' + name))
    } else {
      console.error(Error(`Plugin '${name}' threw an error`))
      console.error(err.stack)
    }
  }
}

function unloadPlugin(name, root) {
  let plugin = pluginsByName[name]
  if (plugin.unload) plugin.unload(root)
  plugin.roots.delete(root)
  if (plugin.roots.size == 0) {
    if (log.verbose)
      log.pale_pink('Killing plugin:', name)
    if (plugin.kill) plugin.kill()
    delete pluginsByName[name]
  }
}
