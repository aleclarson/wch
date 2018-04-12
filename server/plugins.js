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
          let plugin = pluginsByName[name] || runPlugin(name)
          if (!plugin) return
          try {
            plugin.add(root, pack)
            loaded.push(name)
          } catch(err) {
            log.red('PluginError:', `'${name}' failed to add root: ` + root)
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
    for (let name in pluginsByName) stopPlugin(name)
    pluginsByName = Object.create(null)
    pluginsByRoot = Object.create(null)
  }
}

function findPlugins(deps) {
  return deps && Object.keys(deps)
    .filter(name => name.startsWith('wch-'))
}

function runPlugin(name) {
  if (log.verbose)
    log.pale_blue('Running plugin:', name)
  try {
    let plugin = require(name)
    if (!plugin || typeof plugin.add != 'function') {
      return log.red('PluginError:', `'${name}' failed to return` +
        ` an object with an 'add' method!`)
    }
    plugin.on('error', (err) => {
      plugin.log(err.stack)
      if (log.verbose) {
        log.pale_pink('Stopping plugin:', name)
      }
      plugin.stop()
    })
    plugin.run()
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

function stopPlugin(name, root) {
  let plugin = pluginsByName[name]
  if (typeof root == 'string') {
    plugin.remove(root)
  } else {
    plugin.roots.forEach(root => {
      plugin.remove(root)
    })
    plugin.roots.clear()
  }
  if (plugin.roots.size == 0) {
    if (log.verbose) {
      log.pale_pink('Stopping plugin:', name)
    }
    plugin.stop()
    delete pluginsByName[name]
  }
}
