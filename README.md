# Quick Server Panels (QSP)

This repository consists of two parts:

1. A "Panel UI" that, given some JSON configuration, displays buttons that can make HTTP Requests or run CLI commands on a server implementing the QSP Command Protocol. It can be viewed [here](https://recognition101.github.io/qsp/).
2. The `qsp.js` server. It is a standalone reference implementation of:
    1. The QSP Command Protocol
    2. The QSP Proxy Protocol
    3. A simple file server


## Panel UI: Creating Buttons

The Panel UI always shows a **Configuration** section with <kbd>Import</kbd> and <kbd>Export</kbd> buttons. These buttons allow you to import and export a configuration file. Note that configuration files are stored in the browser's local storage, so your configuration should remain even on page refreshes.

The JSON configuration consists of a [`PanelConfig`](./types.ts) object. It uses a `root` key for the main [`Panel`](./types.ts). Each [`Panel`](./types.ts) has a `title` string, an optional list of `buttons`, and an optional list of sub-panel `children`.

For example, this configuration will display a **Main Panel**, with **Sub Panel A** containing <kbd>A-1</kbd> and <kbd>A-2</kbd> buttons followed by **Sub Panel B** containing <kbd>B-1</kbd> and <kbd>B-2</kbd> buttons.

```json
{
    "root": {
        "title": "Main Panel",
        "children": [
            {
                "title": "Sub Panel A",
                "buttons": [
                    { "text": "A-1" },
                    { "text": "A-2" }
                ]
            },
            {
                "title": "Sub Panel B",
                "buttons": [
                    { "text": "B-1" },
                    { "text": "B-2" }
                ]
            }
        ]
    }
}
```

Note how `children` and `buttons` are optional - the **Main Panel** has no `buttons`, and both sub-panels have no `children` panels.

Buttons, by default, do nothing when pressed - so these buttons will simply display their `text`.

### HTTP(S) Requests

Buttons can make HTTP(S) requests when pressed - simply add a `request` property with an [`HttpCallRequest`](./types.ts) object.

Note that only `method` and `url` are required - other properties are optional.

For example:

```json
{
    "root": {
        "title": "Main Panel",
        "buttons": [
            {
                "text": "GET Readme",
                "request": {
                    "method": "GET",
                    "url": "http://192.168.1.64:1234/README.md"
                }
            },
            {
                "text": "POST To Endpoint",
                "request": {
                    "method": "POST",
                    "url": "http://192.168.1.64:1234/endpoint",
                    "headers": { "key": "value" },
                    "body": "POST bodies can go here (optionally)."
                }
            }
        ]
    }
}
```

When held, buttons will repeatedly request. Initially, they wait `repeatInitial` milliseconds before repeating, and every subsequent repetition occurs `repeat` milliseconds apart.

For example: this button, when held, waits 2 seconds initially, then begins making repeated calls every 500 milliseconds.

```json
{
    "root": {
        "title": "Main Panel",
        "buttons": [{
            "text": "GET Readme",
            "repeatInitial": 2000,
            "repeat": 500,
            "request": {
                "method": "GET",
                "url": "http://192.168.1.64:1234/README.md"
            }
        }]
    }
}
```

Buttons can also display the received response text with the `showOutput` property. When laying buttons out, you can control their column with the optional `column` property.

In the following example, <kbd>B</kbd> is displayed in the same column as <kbd>A</kbd> (underneath it) by using `column`, and when pressed will display the contents of the `README.md` when pressed (presuming a static file server at `192.168.1.64:1234`).

```json
{
    "root": {
        "title": "Main Panel",
        "buttons": [
            {
                "text": "A"
            },
            {
                "text": "B",
                "showOutput": true,
                "column": 1,
                "request": {
                    "method": "GET",
                    "url": "http://192.168.1.64:1234/README.md"
                }
            }
        ]
    }
}
```

### Button Property Expansion

Buttons also have a `set` property that contains an arbitrary map of key-strings to value-strings. When reading any string-based property, the application replaces all instances of `${key}` with the value of `set[key]`.

In the following example, the button will make a `GET` to `http://192.168.1.64:1234/README.md` when pressed.

```json
{
    "root": {
        "title": "Main Panel",
        "buttons": [{
            "text": "README",
            "showOutput": true,
            "set": {
                "ip": "192.168.1.64",
                "file": "README"
            },
            "request": {
                "method": "GET",
                "url": "http://${ip}:1234/${file}.md"
            }
        }]
    }
}
```

Note: If the actual text is desired, simply add a backslash between the `$` and the `{`. For example, `hello $\{world}` will expand to the text: `hello ${world}`. More slashes can be added - one slash will always be removed.

Additionally, a `setList` property allows substitution of numeric keys. The following example behaves the same as the previous example, but uses `setList`:

```json
{
    "root": {
        "title": "Main Panel",
        "buttons": [{
            "text": "README (List)",
            "showOutput": true,
            "setList": ["192.168.1.64", "README"],
            "request": {
                "method": "GET",
                "url": "http://${0}:1234/${1}.md"
            }
        }]
    }
}
```

Finally, transform functions can be used by prefixing the key with a function name. There are two functions:

1. `urlencode` - Use `encodeURIComponent` to encode the text.
2. `jsonString` - Use `JSON.stringify` to encode the text.

For example, the following button makes a request to `http://192.168.1.64:1234/README.md?a=%7B%22key%22%3A%22a%5C%22b%22%7D`:

```json
{
    "root": {
        "title": "Main Panel",
        "buttons": [{
            "text": "README (Query JSON)",
            "showOutput": true,
            "set": {
                "value": "a\"b",
                "data": "{\"key\":${jsonString:value}}"
            },
            "request": {
                "method": "GET",
                "url": "http://192.168.1.64:1234/README.md?a=${urlencode:data}"
            }
        }]
    }
}
```

Notice how even `set` values are expanded - allowing `set.data` to reference `set.value`. In the above example:

- `${value}` expands to `a"b`
- `${jsonString:value}` expands to `"a\""` (a JSON-safe quote-surrounded string)
- `${urlencode:value}` expands to `a%22b` (a URL-param-safe string)

By combining these two (as done above), we can embed JSON data as a URL parameter.

### Button Inheritance

The root configuration object also accepts a `templates` object containing buttons that are not to be displayed.

Instead, these buttons can provide "default" values to other buttons who reference them with the `is` property. For example, both buttons in the following example `GET` the same `README.md` file:


```json
{
    "templates": {
        "ParentA": {
            "text": "unused (Parent A)",
            "showOutput": true,
            "set": { "ip": "192.168.1.64" }
        },
        "ParentB": {
            "text": "unused (Parent B)",
            "showOutput": true,
            "request": {
                "method": "GET",
                "url": "http://192.168.1.64:1234/README.md"
            }
        }
    },

    "root": {
        "title": "Main Panel",
        "buttons": [
            {
                "text": "A",
                "is": "ParentA",
                "set": { "file": "README" },
                "request": {
                    "method": "GET",
                    "url": "http://${ip}:1234/${file}.md"
                }
            },
            {
                "text": "B",
                "is": "ParentB"
            }
        ]
    }
}
```

Note the following:

- All properties are "inherited" - for example, both buttons act as if `showOutput` is `true`, since they both "inherit" that override from each of their parents.
- Even `request` is inherited, as shown by <kbd>B</kbd>.
- `set` keys are inherited per-key. Above, `file` is found in `A`, but `ip` is inherited from `ParentA`.
- Buttons in the `templates` object can also use the `is` property, creating multi-level inheritance chains.

### Inputs

Users of the Panel UI can update the `set` map from within the UI. To enable this, add an `arguments` list to a button. Each item in the list is an [`ArgumentSchema`](./types.ts) with a `key` (matching a `set` key), user-displayed `info`, and an optional list of accepted `values`.

In the following example, users can update `host` with a text field, and choose from two files (`README.md` or `index.js`) to download.

```json
{
    "root": {
        "title": "Main Panel",
        "buttons": [{
            "text": "Download",
            "showOutput": true,
            "set": {
                "host": "192.168.1.64:1234",
                "file": "README.md"
            },
            "arguments": [
                {
                    "key": "host",
                    "info": "The address to download from."
                },
                {
                    "key": "file",
                    "info": "The filename to download.",
                    "values": ["README.md", "index.js"]
                }
            ],
            "request": {
                "method": "GET",
                "url": "http://${host}/${file}"
            }
        }]
    }
}
```

Note: user input is not escaped in any way - all input is directly copied into `set`. This means users can potentially input values with `${replacement}` text.

### Proxy Protocol

By adding a `proxyUrl` property to a button, the entire [`HttpCallRequest`](./types.ts) in the button's `request` will be serialized and `POST`-ed to `${proxyUrl}?do=proxy`. Assuming the server located at `proxyUrl` implements the QSP Proxy Protocol, the server will place the request itself and return the result.

The `qsp.js` server is a reference implementation of the QSP Proxy Protocol.

### Command Protocol

By adding a `command` name to the button along with a `commandUrl` property, the following will occur:

1. A list of supported commands will be fetched from `${commandUrl}?do=getCommands`.
2. A command whose name matches `command` will be found from that list.
3. The matching command will provide `arguments` for this button.
4. Upon pressing the button, the corresponding binary `runner` will be run on the server.

Additionally, the button can set `isPersist` to `true` or `false` (default). If it is `true`, the command will stream its output into a new popup window (good for long-running commands).

For an example of using `command`, see the **Full CLI Command Example** section below.

## QSP Server Reference Implementation

The `qsp.js` file contains a reference implementation of the QSP Command and Proxy protocols, in addition to serving as a simple static file server.

It can be run with the `-h` to display usage information, including how to run it with a configuration file.

### Configuration

The `qsp.js` file configuration is a [`QspServerConfig`](./types.ts) object. It contains a list of commands, each of which are a [`QspServerConfigCommand`](./types.ts) object.

Each command consists of a name (for reference by Panel UI buttons' `command` property), a list of arguments (identical in structure to Panel UI button `arguments`), and a `runner` which describes the CLI binary to run (and its arguments).

The `runner` is a list of strings. The first represents the binary name (ex: `"ls"`), and all following strings represent arguments passed to that binary. Each string can contain substitutions with a similar replacement syntax as the Panel UI - for example, `${replace}` is replaced with the value of the argument whose key is `replace`.


## Full CLI Command Example

Check out this repository. In the newly checked out folder, create a `qsp-config.js` file with the following contents:

```js
/** @type {import('./types').QspServerConfig} */
export const config = {
    commands: [
        {
            name: 'list',
            arguments: [{
                key: 'type',
                info: 'The kind of output to provide',
                values: ['l', 'lah']
            }],
            runner: ['ls', '-${type}']
        },
        {
            name: 'ping-command',
            arguments: [{
                key: 'host',
                info: 'The host to ping.'
            }],
            runner: ['ping', '${host}', '-c', '10']
        }
    ]
};
```

Then run the reference server with:

```bash
./qsp.js -c ./qsp-config.js -p 1234
```

Next, open the Panel UI and import the following configuration:

```json
{
    "root": {
        "title": "Main Panel",
        "buttons": [
            {
                "text": "LS",
                "command": "list",
                "commandUrl": "http://localhost:1234"
            },
            {
                "text": "Ping Btn",
                "command": "ping-command",
                "commandUrl": "http://localhost:1234",
                "isPersisted": true
            }
        ]
    }
}
```

This creates two buttons, one of which runs `ls` and one which runs `ping`. Notice:

- The `"isPersisted": true` flag in the Panel UI configuration means the output will stream into a new window as it is produced. This is ideal for long-running commands like `ping`.
- The <kbd>LS</kbd> button in the Panel UI does not display an input popup when pressed. Since it has a single input that uses `values` (and no other inputs), the button itself becomes a dropdown. Choosing an item from the dropdown runs the command without needing an additional popup. This is ideal for a simple command with a few variants.

