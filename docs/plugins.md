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

Plugins are simply functions that return an object with the following
interface.

- `attach(pack: Package): void`
- `detach(pack: Package): void`
- `stop(): void`

The `attach` method is called when a package begins using the plugin.

The `detach` method is called when a package stops using the plugin.

The `stop` method is called when no packages need the plugin.
