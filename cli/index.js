#!/usr/bin/env node

let slurm = require('slurm')
let huey = require('huey')
let path = require('path')
let wch = require('..')

let {log} = console

process.env.VERBOSE =
  process.argv.includes('-v') ? '1' : ''

let cmd = process.argv[2]
switch(cmd) {
  case '.': // Watch current root
    watch(process.cwd())
    break
  case 'start': // Start the daemon
    let starting = wch.start()
    if (starting) {
      warn('Starting server...')
      starting
        .then(() => good('Server ready!'))
        .catch(fatal)
    } else {
      warn('Already started!')
    }
    break
  case 'restart':
    wch.stop().then(() => {
      warn('Starting server...')
      setImmediate(() => {
        wch.start()
          .then(() => good('Server ready!'))
          .catch(fatal)
      })
    }).catch(fatal)
    break
  case 'stop': // Stop the daemon
    wch.stop().then(success => {
      if (success) good('Server stopped!')
      else warn('Server not running.')
    }).catch(fatal)
    break
  case 'logs':
    let fs = require('fsx')
    let {LOG_PATH} = require('../server/paths')
    if (fs.isFile(LOG_PATH))
      fs.read(LOG_PATH).pipe(process.stdout)
    break
  case 'list':
    wch.list().then(roots => {
      if (roots.length) log(roots.join('\n'))
    }).catch(fatal)
    break
  case 'emit': // Emit an event
    fatal('Not implemented yet')
  case 'touch': // Trigger file events
    fatal('Not implemented yet')
  default:
    let args = slurm({
      w: {list: true},
      u: {list: true},
      v: true, // verbose errors
    })
    if (args.length || !args.w && !args.u)
      fatal('Unrecognized command')
    if (args.w)
      args.w.forEach(watch)
    if (args.u)
      args.u.forEach(root => {
        root = path.resolve(root)
        wch.unwatch(root).then(success => {
          if (success) good('Unwatched:', root)
          else warn('Not watching:', root)
        }).catch(fatal)
      })
}

async function watch(root) {
  root = path.resolve(root)
  wch(root).then(success => {
    if (success) good('Watching:', root)
    else warn('Already watching:', root)
  }).catch(fatal)
}

function good(label, ...args) {
  log(huey.pale_green(label), ...args)
}

function warn(msg, ...args) {
  console.warn(huey.pale_yellow(msg), ...args)
}

function fatal(err) {
  if (process.env.VERBOSE) {
    if (typeof err == 'string') {
      err = new Error(err)
      Error.captureStackTrace(err, fatal)
    }
    console.error(err.stack)
  } else if (typeof err == 'string') {
    console.error(huey.red('Error: ') + err)
  } else {
    console.error(huey.red(err.name + ': ') + err.message)
    if (err.code == 500) {
      log('Run ' + huey.cyan('wch logs') + ' for the stack trace.')
      log()
      warn('Please file an issue at:', 'https://goo.gl/GgBmdC')
    }
  }
  process.exit()
}
