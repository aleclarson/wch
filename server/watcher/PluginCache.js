let cleanStack = require('clean-stack')
let Module = require('module')
let assert = require('assert')
let path = require('path')
let huey = require('huey')
let log = require('../log')
let fs = require('fsx')
let vm = require('vm')

let {verbose} = log

class PluginCache {
  constructor() {
    this.byName = Object.create(null)
    this.byPack = new Map()
  }
  // Attach a package to its plugins.
  attach(pack) {
    let loaded = this.byPack.get(pack)
    if (!pack.read() && !loaded) return

    // Find added/removed plugins.
    let deps = pack.devDependencies
    if (deps) {
      deps = Object.keys(deps)
        .filter(id => id.startsWith('wch-'))

      let changed = false
      if (loaded) {
        // Find removed plugins.
        loaded && loaded.forEach(id => {
          if (deps.includes(id)) return
          this._detachPlugin(pack, id)
          changed = true
        })

        // Find added/unremoved plugins.
        let reloads = deps.filter(id => {
          if (loaded.includes(id)) return true
          this._attachPlugin(pack, id)
          changed = true
        })

        // Reload unchanged plugins.
        if (reloads.length) {
          this._reloadPlugins(pack, reloads)
        }
      }
      else if (deps.length) {
        changed = true
        deps.forEach(id => {
          this._attachPlugin(pack, id)
        })
      }
      if (changed) {
        this.byPack.set(pack, deps)
        this._loadProject(pack)
      }
    } else {
      this.detach(pack)
    }
  }
  // Reconfigure plugins for a package.
  reload(pack) {
    this._reloadPlugins(pack)
    this._loadProject(pack)
  }
  // Detach a package from its plugins.
  detach(pack) {
    let loaded = this.byPack.get(pack)
    if (loaded) {
      loaded.forEach(id => {
        this._detachPlugin(pack, id)
      })
      this.byPack.delete(pack)
    }
  }
  // Unload all plugins for every package.
  destroy() {
    for (let id in this.byName) {
      let plug = this.byName[id]
      stopPlugin(plug, id)
    }
    this.byName = Object.create(null)
  }
  // Load configuration for a package.
  _loadProject(pack) {
    let loadPath = pack.path + '/project.js'
    if (!fs.exists(loadPath)) {
      loadPath = pack.path + '/project.coffee'
      if (fs.exists(loadPath)) {
        var coffee = true
      } else {
        return false
      }
    }

    let load = fs.readFile(loadPath)
    if (coffee) {
      try {
        coffee = require('coffeescript')
      } catch(err) {
        let cmd = huey.green('npm install -g coffeescript')
        log.yellow('warn:', `You must do ${cmd} before any 'project.coffee' files can be loaded!`)
        return false
      }
      load = coffee.compile(load, {
        bare: true,
        filename: loadPath,
        sourceMap: false,
      })
    }

    load = '(function() {\n' +
      indentCode(load) +
      '\n}).call(self)'

    let ctx = Object.create(global)
    ctx.self = pack
    this.byPack.get(pack).forEach(id => {
      let plug = this.byName[id]
      ctx[plug.name] = plug.packs.get(pack)
    })

    ctx.module = new Module(loadPath, module)
    ctx.require = (id) => ctx.module.require(id)

    try {
      vm.runInNewContext(load, ctx, {
        filename: loadPath,
        displayErrors: true,
        timeout: 10000, // 10s
      })
    } catch(err) {
      console.log(cleanStack(err.stack, {pretty: true}))
    }
  }
  // Reconfigure a list of plugins for a package.
  _reloadPlugins(pack, list) {
    if (!list) list = this.byPack.get(pack)
    list && list.forEach(id => {
      let plug = this.byName[id]
      detachPlugin(pack, plug, id)
      attachPlugin(pack, plug, id)
    })
  }
  // Attach a package to a plugin.
  _attachPlugin(pack, id) {
    let plug = this.byName[id]
    if (!plug) {
      plug = runPlugin(id)
      this.byName[id] = plug
    }
    attachPlugin(pack, plug, id)
  }
  // Detach a package from a plugin.
  _detachPlugin(pack, id) {
    let plug = this.byName[id]
    detachPlugin(pack, plug, id)
    if (plug.packs.size == 0) {
      delete this.byName[id]
      stopPlugin(plug, id)
    }
  }
}

module.exports = PluginCache

function proxyPackage(pack, plug) {
  if (plug.methods)
    return pack.proxy(plug.methods)
  return Object.create(pack)
}

function createLog(name) {
  let log = huey.log(huey.coal(`[${name}]`))
  log.verbose = verbose
  return log
}

function runPlugin(id) {
  if (log.verbose) {
    log.pale_yellow('Running plugin:', id)
  }
  let runPath = require.resolve(id)
  try {
    let run = require(runPath)
    if (typeof run != 'function') {
      throw TypeError('Plugins must export a function')
    }
    let plug = {
      name: id.replace(/^wch-/, ''),
      packs: new Map(),
    }
    Object.assign(plug, run.call(plug, createLog(plug.name)))
    return plug
  }
  catch(err) {
    log.yellow('warn:', `'${id}' threw while starting up`)
    console.error(err.stack)
  }
}

function attachPlugin(pack, plug, id) {
  let proxy = proxyPackage(pack, plug)
  plug.packs.set(pack, proxy)
  if (plug.attach) {
    try {
      plug.attach(proxy)
    } catch(err) {
      log.yellow('warn:', `'${id}' threw while attaching a package`)
      console.error(err.stack)
    }
  }
}

function detachPlugin(pack, plug, id) {
  let proxy = plug.packs.get(pack)
  proxy._streams.forEach(s => s.destroy())
  if (plug.detach) {
    plug.packs.delete(pack)
    try {
      plug.detach(proxy)
    } catch(err) {
      log.yellow('warn:', `'${id}' threw while detaching a package`)
      console.error(err.stack)
    }
  }
}

function stopPlugin(plug, id) {
  if (log.verbose) {
    log.pale_pink('Stopping plugin:', id)
  }
  try {
    if (plug.stop) plug.stop()
  } catch(err) {
    log.yellow('warn:', `'${id}' threw while stopping`)
    console.error(err.stack)
  }
}

function indentCode(code) {
  // 1. Trim leading/trailing newlines.
  // 2. Indent every line that isn't only whitespace.
  return code.replace(/(^\n+)|(\n+$)/g, '')
    .replace(/(^|\n)( *[^\s])/g, '$1  $2')
}
