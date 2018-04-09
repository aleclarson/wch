tp = require 'testpass'

process.env.NODE_ENV = 'test'
wch = require '..'
sock = require '../sock'

tp.afterAll wch.stop
tp.beforeEach ->
  await sock._reset()
  await wch.start()

tp.test 'connect', (t) ->
  t.async()
  sock.on 'connect', t.done
  return sock.connect()

tp.test 'close while connected', (t) ->
  t.async()
  sock.on 'close', t.done
  await sock.connect()
  sock.close()

tp.test 'close while connecting', (t) ->
  t.async()

  sock.on 'connect', t.fail
  sock.on 'close', t.fail

  sock.connect().catch (err) ->
    t.eq err.message, 'Closed by user'
    t.eq sock.connected, false
    t.eq sock.connecting, false
    t.done()

  sock.close()
  return

tp.test 'closed by server', (t) ->
  t.async()

  await sock.connect()
  sock.on 'error', t.fail
  sock.on 'close', ->
    t.eq sock.connected, false
    t.eq sock.connecting, true
    t.done()

  sock._res.push null
  return

tp.test 'error while connecting', (t) ->
  t.async()

  err = Error 'test'
  sock.on 'error', t.fail
  sock.connect().catch (e) ->
    t.ne e, err # quest.ok() uses its own error object
    t.eq e.message, 'test'
    t.done()

  sock._req.on 'socket', ->
    sock._req.emit 'error', err

tp.test 'error while connected', (t) ->
  t.async()

  err = Error 'test'
  sock.on 'error', (e) ->
    t.eq e, err
    t.done()

  await sock.connect()
  sock._res.emit 'error', err
  return

tp.test 'try connect while server offline', (t) ->
  t.async()
  await wch.stop()

  connecting = sock.connect()
  sock._req.on 'error', (err) ->
    t.eq err.code, 'ENOENT'
    wch.start()

  # This won't resolve until the server comes back online.
  await connecting
  t.eq sock.connected, true
  t.done()

tp.test 'close while watching socket path', (t) ->
  t.async()
  await wch.stop()

  connecting = sock.connect()
  sock._req.on 'close', -> sock.close()

  connecting.catch (err) ->
    t.eq err.message, 'Closed by user'
    t.done()

tp.test 'reconnect after failed reconnect', (t) ->
  t.async()
  await sock.connect()

  calls = 0
  sock.on 'connecting', ->
    if ++calls is 1
      sock._req.emit 'error', Error 'test'
    else sock.on 'connect', t.done

  sock._res.push null
  return
