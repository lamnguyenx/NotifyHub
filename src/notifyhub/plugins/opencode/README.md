# OpenCode Plugins

This directory contains plugins for [OpenCode](https://opencode.ai), an open source AI coding agent.

## Plugins

### 🔔 NotifyHub Plugin

A plugin that sends notifications to [NotifyHub](https://github.com/sst/notifyhub) whenever OpenCode completes a session.

**File:** `notifyhub-plugin.ts`

**Features:**
- Automatically detects when OpenCode finishes processing requests
- Sends notifications to NotifyHub server on `localhost:9080`
- Lightweight and non-intrusive with error handling

**What it does:**
- Hooks into OpenCode's `session.idle` event
- Sends POST requests to `/api/notify` with session completion messages
- Logs errors if NotifyHub server is unreachable

### 🔔 Terminal Bell (Example)

The original terminal bell plugin example from OpenCode.

**File:** `terminal_bell_example.md`

## Installation

### Prerequisites

1. [OpenCode](https://opencode.ai/install) must be installed
2. For the NotifyHub plugin: [NotifyHub server](https://github.com/sst/notifyhub) running on localhost:9080

### Install NotifyHub Plugin

**Prerequisites:**
- [NotifyHub server](https://github.com/sst/notifyhub) running on localhost:9080

**Installation Steps:**

```bash
# Install plugin to OpenCode
make install-plugin

# Start NotifyHub server
make sv

# Open dashboard to view notifications
open http://localhost:9080
```

**Management:**
- `make install-plugin` - Install the plugin
- `make remove-plugin` - Remove the plugin

**Configuration:**
- Default server: `http://localhost:9080`
- To use a different port, modify the URL in `notifyhub-plugin.ts`

**Usage:**
The plugin automatically activates and sends notifications whenever an OpenCode session becomes idle (when OpenCode finishes processing a request). View notifications in the NotifyHub web dashboard.

**Troubleshooting:**
- Ensure NotifyHub server is running: `make sv` (from NotifyHub directory)
- Test server accessibility: `curl http://localhost:9080/api/notifications`
- Plugin errors are logged to the console

## Development

### Setup

```bash
# Install dependencies
npm install

# Verify plugin compiles
bun run --check notifyhub-plugin.ts
```

### TypeScript Configuration

The directory includes TypeScript configuration optimized for plugin development:

- `tsconfig.json` - TypeScript compiler options
- `package.json` - Dependencies including `@opencode-ai/plugin` types

### Testing

```bash
# Type check with bun (recommended)
bun run --check notifyhub-plugin.ts

# Type check with tsc
npx tsc --noEmit notifyhub-plugin.ts
```

## Plugin API

Plugins are JavaScript/TypeScript modules that export a `Plugin` function. They can hook into various OpenCode events:

- `session.idle` - Fires when OpenCode finishes processing
- `file.edited` - Fires when files are modified
- `tool.execute.*` - Fires during tool execution

See [OpenCode Plugin Documentation](https://opencode.ai/docs/plugins) for complete API reference.

## Contributing

When adding new plugins:

1. Create your plugin file (`.ts` or `.js`)
2. Add documentation (`.md`)
3. Update this README
4. Test with `bun run --check your-plugin.ts`

## Related

- [OpenCode](https://opencode.ai) - The coding agent these plugins extend
- [NotifyHub](https://github.com/sst/notifyhub) - Notification system for the NotifyHub plugin
- [OpenCode Plugin Docs](https://opencode.ai/docs/plugins) - Official plugin documentation</content>
<parameter name="filePath">src/notifyhub/plugins/opencode/README.md