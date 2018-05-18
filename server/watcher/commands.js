let socket = require('./socket')
let path = require('path')
let log = require('../log')
let os = require('os')

let list = command('watch-list')
exports.roots = async function() {
  return (await list()).roots
}

// Find the watch root of a directory.
exports.root = function(dir, roots) {
  return roots ? findRoot(dir, roots)
    : list().then(res => findRoot(dir, res.roots))
}

function findRoot(dir, roots) {
  let home = os.homedir()
  while (!roots.includes(dir)) {
    if (dir == home) return null
    dir = path.dirname(dir)
  }
  return dir
}

commands({
  watch: 'watch-project',
  query: null,
  clock: null,
  subscribe: null,
  unsubscribe: null,
})

function commands(cmd) {
  Object.keys(cmd).forEach(key => {
    exports[key] = command(cmd[key] || key)
  })
}

function command(term) {
  return function() {
    let cmd = [term, ...arguments]
    return new Promise((resolve, reject) => {
      socket.command(cmd, (err, res) => {
        if (err) {
          err.cmd = cmd
          reject(err)
        } else {
          if ('warning' in res) {
            log.yellow('warn:', res.warning)
          }
          resolve(res)
        }
      })
    })
  }
}
