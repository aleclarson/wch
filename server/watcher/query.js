let path = require('path')
let wm = require('./watchman')

query.filter = filter
module.exports = query

// query -> roots -> stream -> query
let roots = require('./roots')

async function query(dir, opts = {}) {
  // Support passing a subdirectory.
  let root = await roots.find(dir)
  if (!root) {
    throw Error('Directory not being watched: ' + dir)
  }

  // Passing a custom query is possible.
  let {query} = opts
  if (!query) {
    query = {
      fields: opts.fields || ['name', 'exists', 'new'],
      expression: and(filter(opts), [
        'anyof', ['type', 'f'], ['type', 'l']
      ]),
    }
  }

  // Filter results to those changed after a given date.
  if (opts.since) {
    let {since} = opts
    if (since.getTime) {
      since = Math.round(since.getTime() / 1000)
    } else {
      throw TypeError('`since` must be a date')
    }
    query.since = since
  }

  let rel = path.relative(root, dir)
  if (rel) query.relative_root = rel

  // Search a subset of descendants.
  if (Array.isArray(opts.paths)) {
    query.path = opts.paths
  }

  // Send the query.
  let res = await wm.query(root, query)

  // Return the files, root, and clockspec.
  let {files} = res
  files.root = path.join(root, rel)
  files.clock = res.clock
  return files
}

function filter(opts) {
  let expr
  if (opts) {
    let include, exclude

    if (opts.include)
      include = matchAny(opts.include)

    if (opts.exclude)
      exclude = ['not', matchAny(opts.exclude)]

    if (include && exclude) {
      expr = ['allof', include, exclude]
    } else expr = include || exclude

    if (opts.exts)
      expr = and(expr, suffix(opts.exts))
  }
  return expr || 'true'
}

function matchAny(globs) {
  if (!Array.isArray(globs)) {
    throw TypeError('`globs` must be an array')
  }
  if (globs.length == 1) {
    return match(globs[0])
  }
  return [
    'anyof',
    ...globs.map(match)
  ]
}

function match(glob) {
  if (typeof glob != 'string') {
    throw TypeError('`glob` must be a string')
  }
  return [
    'match', glob[0] == '/' ? glob.slice(1) : glob,
    ~glob.indexOf('/') ? 'wholename' : 'basename'
  ]
}

function suffix(exts) {
  if (exts.length == 1) {
    return ['suffix', exts[0]]
  }
  return [
    'anyof',
    ...exts.map(type => ['suffix', type])
  ]
}

function and(expr1, expr2) {
  if (!expr1) return expr2
  if (expr1[0] != 'allof') {
    return ['allof', expr1, expr2]
  }
  expr1.push(expr2)
  return expr1
}
