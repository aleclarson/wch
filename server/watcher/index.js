let stream = require('./stream')
let roots = require('./roots')
let query = require('./query')
let log = require('../log')
let wm = require('./watchman')

// Streams are not persisted between restarts.
let streams = new Map()

module.exports = {
  async start() {
    await wm.connect()
    return roots.load()
  },
  root: roots.find,
  list: roots.list,
  watch: roots.add,
  unwatch: roots.remove,
  stream,
  query,
  crawl() {
    throw Error('Not implemented yet')
  },
  stop() {
    if (log.verbose)
      log.pale_pink('Closing watch streams...')
    stream.each(stream => {
      stream.destroy()
    })
  }
}
