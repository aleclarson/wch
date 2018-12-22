# wch v0.10.3

Client library for the [wch daemon][1].

Compatible with **wchd v0.10**

[1]: https://www.npmjs.com/package/wchd

### `wch(dir: string): Promise<boolean>`

Track a directory indefinitely.

Resolves to `true` if successful.

### `wch.unwatch(dir: string): Promise<boolean>`

Stop tracking a directory.

Resolves to `true` if successful.

### `wch.connect(): Promise<Object>`

This method must be called before any other actions are processed.
Whenever not connected, actions are stored in the offline queue.

If the returned promise is rejected, you need to manually call `connect`
again if you wish to retry. Though, not all errors will reject the promise.
When the `wchd` server is unreachable, the promise will stay pending while
the client waits for the server to be restarted.

The `connected` and `connecting` properties reflect the current state
of the connection.

### `wch.close(): void`

Force disconnect from the `wchd` server.

### `wch.stream(dir: string, query: Object): Readable`

Stream changes to matching paths within a directory.

The `data` event is emitted for every change. Listeners are passed an object representing the affected file.

The `close` event is emitted when the stream has its `destroy` method called.

The stream manages its subscription as expected whenever the client loses its connection to the server.

The stream is created by the [readable-stream](https://github.com/nodejs/readable-stream)
library to ensure reliable behavior between NodeJS versions.

*Note:* You should **always** handle `error` events on a stream,
or your process will easily crash.

### `wch.query(dir: string, query: Object): Promise<Object>`

Fetch matching paths within a directory.

The `query` argument is not yet documented.

The resolved object has the following properties:
- `root: string`
- `clock: string`
- `files: Object[]`

*Note:* The `dir` argument must be within a tracked directory.

### `wch.expr(query: Object): Array`

Pass a wch-style query to get the `expression` property of the equivalent Watchman-style query.

*Note:* This method doesn't communicate with the server.

### `wch.list(): Promise<string[]>`

Fetch the list of tracked directories.

## Events

In addition to events provided by plugins, there are several events provided
by the client library.

### connecting

The socket is attempting to connect (to the `wchd` server).

### connect

The socket has connected. Emits on reconnect, too.

### offline

The `wchd` server is unreachable.

### close

The socket lost its connection.

### error

The socket met an error.

Plugins may also use this event to broadcast errors.

Listeners are passed an `Error` object.

*Note:* You should **always** listen for this event.
