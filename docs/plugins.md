# Plugins

This is the complete list of known `wch` plugins:
- [wch-cara](https://npmjs.org/package/wch-cara)
- [wch-moon](https://npmjs.org/package/wch-moon)
- [wch-coffee](https://npmjs.org/package/wch-coffee)

## Installing a plugin

Plugins are installed by adding them to the `devDependencies`
of whatever packages need them. Also, the plugins must be
installed globally (`npm i -g`) so all packages share the
same plugin instance.

You can add or remove plugins from your `devDependencies`
at your leisure. The `wch` server will notify the affected
plugins immediately.

## Making a plugin

Plugins adhere to a simple method interface.

#### run()

Export a `run` method if your plugin needs to set things
up before receiving any roots.

#### end()

On the flip side, export an `end` method if your plugin
needs to tear things down when no roots are using it.

#### add(root)

You *must* export an `add` method that takes a root
and does something with it. This is the heart of your
plugin. The given root has your plugin in its `devDependencies`.

#### remove(root)

Export a `remove` method if your plugin needs to tear
things down when a root stops using it.
