
// Default fields
let fields = ['name', 'exists', 'new']

function makeQuery(opts) {
  if (Array.isArray(opts)) {
    return {expression: opts}
  } else {
    let expr = opts.expr
      ? and(filter(opts), opts.expr)
      : filter(opts)

    let type = opts.type || '*'
    if (type !== '*') {
      type = type.split('').map(type => ['type', type])
      if (type.length == 1) type = type[0]
      else type.unshift('anyof')
      expr = and(expr, type)
    }

    let query = {
      fields: opts.fields || fields,
      expression: expr || 'true',
    }
    if (opts.since != null) {
      query.since = since(opts.since)
    }
    return query
  }
}

module.exports = makeQuery

// NOTE: Numbers must be in seconds!
function since(date) {
  if (typeof date !== 'object') {
    return date
  } else if (date.getTime) {
    return Math.floor(date.getTime() / 1000)
  }
  throw TypeError('Expected a date or number')
}

function filter(opts) {
  let expr, only, skip

  if (opts.only && opts.only.length)
    only = matchAny(opts.only)

  if (opts.skip && opts.skip.length)
    skip = ['not', matchAny(opts.skip)]

  if (only && skip) {
    expr = ['allof', only, skip]
  } else expr = only || skip

  if (opts.exts)
    expr = and(expr, suffix(opts.exts))

  return expr
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
  if (glob.indexOf('/') == -1) {
    return ['match', glob, 'basename']
  }
  if (glob[0] == '/') {
    glob = glob.slice(1)
  }
  else if (glob[0] != '*') {
    glob = '**/' + glob
  }
  if (glob.slice(-1) == '/') {
    glob += '**'
  }
  return ['match', glob, 'wholename']
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
