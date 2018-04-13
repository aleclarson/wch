let makeQuery = require('./query')
let stream = require('./stream')
let assert = require('assert')
let roots = require('./roots')
let path = require('path')
let log = require('../log')
let wm = require('./watchman')

// Streams are not persisted between restarts.
let streams = new Map()

module.exports = {
  async start() {
    await wm.connect()
    return roots.load()
  },
  list: roots.list,
  watch: roots.add,
  unwatch: roots.remove,
  stream,
  query,
  stop() {
    stream.each(s => s.destroy())
  }
}

async function query(dir, opts = {}) {
  assert.equal(typeof dir, 'string')
  assert.equal(typeof opts, 'object')
  let query = makeQuery({}, opts)

  // Find the actual root.
  let root = findRoot(dir, (await wm.list()).roots)
  if (!root) throw Error('Cannot query an unwatched root: ' + dir)

  // Update the relative root.
  let rel = opts.relative_root || ''
  query.relative_root = dir == root ? rel :
    path.join(path.relative(root, dir), rel)

  // Send the query.
  let q = await wm.query(root, query)

  // Return the files, root, and clockspec.
  let res = q.files
  res.root = dir
  res.clock = q.clock
  return res
}

function findRoot(dir, roots) {
  let root = dir
  while (!roots.includes(root)) {
    if (root == '/') return null
    root = path.dirname(root)
  }
  return root
}
