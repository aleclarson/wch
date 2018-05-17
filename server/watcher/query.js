
// Default fields
let fields = ['name', 'exists', 'new']

function makeQuery(query, opts) {
  let expr = filter(opts)

  let kinds = opts.kind || opts.kinds || 'fl'
  if (kinds !== '*') {
    kinds = kinds.split('').map(kind => ['type', kind])
    if (kinds.length == 1) kinds = kinds[0]
    else kinds.unshift('anyof')
    expr = and(kinds, expr)
  }

  // Remove results that haven't changed since the given date.
  if (opts.since) query.since = since(opts.since)

  query.fields = opts.fields || fields
  query.expression = expr
  return query
}

module.exports = makeQuery

// NOTE: Numbers must be in seconds!
function since(date) {
  if (typeof date !== 'object') {
    return date
  } else if (date.getTime) {
    return Math.round(date.getTime() / 1000)
  }
  throw TypeError('Expected a date or number')
}

function filter(opts) {
  let expr, include, exclude

  if (opts.include)
    include = matchAny(opts.include)

  if (opts.exclude)
    exclude = ['not', matchAny(opts.exclude)]

  if (include && exclude) {
    expr = ['allof', include, exclude]
  } else expr = include || exclude

  if (opts.exts)
    expr = and(expr, suffix(opts.exts))

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
