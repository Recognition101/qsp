#!/usr/bin/env node

import { randomBytes } from 'node:crypto';
import { promises as fs } from 'node:fs';
import * as fsRoot from 'node:fs';
import * as ncp from 'node:child_process';
import * as http from 'node:http';
import * as https from 'node:https';
import * as path from 'node:path';

/**
 * @typedef {import('./types').Json} Json
 * @typedef {import('./types').JsonObject} JsonObject
 * @typedef {import('./types').FileNameMetadata} FileNameMetadata
 * @typedef {import('./types').ResponderContext} ResponderContext
 *
 * @typedef {import('./types').HttpCallRequest} HttpCallRequest
 * @typedef {import('./types').QspServerConfig} QspServerConfig
 * @typedef {import('./types').QspServerConfigCommand} QspServerConfigCommand
 * @typedef {import('./types').CommandRequest} CommandRequest
 * @typedef {import('./types').CommandSchema} CommandSchema
 * @typedef {import('./types').ArgumentSchema} ArgumentSchema
 * @typedef {import('./types').Task} Task
 * @typedef {import('./types').TaskResults} TaskResults
 * @typedef {import('./types').ErrorResponse} ErrorResponse
 * @typedef {import('./types').IsContext} IsContext
 */
/**
 * @template E
 * @template T
 * @typedef {import('./types').Result<E, T>} Result
 */
/**
 * @template T
 * @typedef {import('./types').MaybeArray<T>} MaybeArray
 */
/*** @template T
 * @typedef {import('./types').IsA<T>} IsA
 */

//
//
// ## Constants

const port = 1234;
const pathNpmMdCss = path.join(
    import.meta.dirname,
    './node_modules/github-markdown-css/github-markdown.css'
);

const dayInMs = 24 * 60 * 60 * 1000;
const taskExpiryTime = dayInMs * 7;

const help = `Runs a server that provides a UI for quickly running
common CLI commands.

USAGE: qsp.js [OPTIONS]

OPTIONS:
    -h, --help          show this message and exit
    -c, --config        path to a configuration file
    -m, --markdown      path to a CSS file to prepend to rendered markdown
    -k, --key           (optional) path to an HTTPS key file
    -e, --cert          (optional) path to an HTTPS certificate file
    -l, --local         (optional) folder name to mount binary-peer files at
    -p, --port [NUMBER] run on this port (default: ${port})
`;

/** @type {Map<string, Task>} */
const tasks = new Map();

/** @type {{[extension: string]: string}} */
const mimeTypes = {
    '.txt': 'text/plain; charset=utf-8',
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.mjs': 'text/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.epub': 'application/epub+zip',
    '.mov': 'video/mov',
    '.mp4': 'video/mp4',
    '.mp3': 'audio/mpeg',
    '.mid': 'audio/midi',
    '.midi': 'audio/midi',
    '.wav': 'audio/wav',
    '.gif': 'image/gif',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.svg': 'image/svg+xml',
    '.pdf': 'application/pdf',
    '.tar': 'application/x-tar',
    '.gz': 'application/gzip',
    '.zip': 'application/zip',
    '.rar': 'application/x-rar-compressed',
    '.wasm': 'application/wasm'
};

const iconTypes = new Set(['png', 'jpg', 'jpeg']);

const indexStyles = `
body {
    --color-gray0: rgb(28, 28, 30);
    --color-gray1: rgb(142, 142, 147);
    --color-gray2: rgb(174, 174, 178);
    --color-gray3: rgb(199, 199, 204);
    --color-gray4: rgb(209, 209, 214);
    --color-gray5: rgb(229, 229, 234);
    --color-gray6: rgb(242, 242, 247);
    --color-blue: rgb(0, 136, 255);

    background-color: var(--color-gray6);
    color: var(--color-gray0);
    font-family: system-ui;
    font-size: 18px;
    line-height: 1.5;
}

@media (prefers-color-scheme: dark) {
    body {
        --color-gray0: rgb(242, 242, 247);
        --color-gray1: rgb(142, 142, 147);
        --color-gray2: rgb(99, 99, 102);
        --color-gray3: rgb(72, 72, 74);
        --color-gray4: rgb(58, 58, 60);
        --color-gray5: rgb(44, 44, 46);
        --color-gray6: rgb(28, 28, 30);
        --color-blue: rgb(0, 145, 255);
    }
}
a {
    text-decoration: none;
    color: var(--color-blue);
}
.items-icon {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(350px, 1fr));
    grid-auto-flow: row dense;
    margin: 0;
    padding: 0;
    gap: 1rem;
    list-style: none;
}
.items-icon .filegroup {
    display: grid;
    grid-template-columns: 4rem 1fr;
    gap: 1rem;
}
.filegroup-text {
    display: flex;
    flex-direction: row;
    flex-wrap: wrap;
    overflow: hidden;
}
.filegroup-name {
    padding: 0 1rem 0 0;
}
.filegroup-single .items-type {
    display: none;
}
.items-icon img {
    width: 100%;
}
.items-type {
    display: flex;
    gap: 1rem;
    margin: 0;
    padding: 0 0 20px 0;
    overflow-x: scroll;
    list-style: none;
}
.items > .filegroup-single {
    padding: 0 0 20px 0;
}
`;

//
//
// ## Helper / Library Functions

/**
 * Parses the CLI arguments and returns a map of them.
 * @return {Object<string, boolean|string>} a map of argument keys to values
 */
const parseArgs = () => {
    const result = /** @type {Object<string, boolean|string>} */({});
    for(let i = 2, key = ''; i < process.argv.length; i += 1) {
        const isKey = process.argv[i].startsWith('-');
        key = isKey ? process.argv[i].replace(/^-*/, '') : key;
        result[key] = key ? (isKey ? true : process.argv[i]) : '';
        key = isKey ? key : '';
    }
    return result;
};

/**
 * Reads the configuration file, either from JS or JSON.
 * @param {string} pathConfig the path to the configuration file
 * @return {Promise<QspServerConfig>} the configuration object
 */
const readConfig = async (pathConfig) => {
    try {
        const configJson = pathConfig.endsWith('.js')
            ? JSON.stringify((await import(pathConfig)).config)
            : await fs.readFile(pathConfig).then(x => x.toString());
        return isQspServerConfig({ value: JSON.parse(configJson) });
    } catch(e) {
        const message = e instanceof TvError
            ? 'Config is not a valid `QspServerConfig` object.'
            : e instanceof TypeError
                ? 'Config file is not serializable as JSON.'
                : e instanceof SyntaxError
                    ? 'Config is not readable as JSON.'
                    : 'Config file not readable.';

        console.error(`[CONFIG ERROR] ${message} [IN] ${pathConfig}`);
        console.error(e);
    }
    return {};
};

/**
 * Attempt to coerce some data into a string.
 * @param {any} x the data to coerce
 * @return {string|null} `x` if it's a string, `null` otherwise
 */
const string = x => typeof x === 'string' ? x : null;

/**
 * @param {string} filePath the path to get file stats about
 * @return {Promise<fsRoot.Stats|null>} the stats, if they can be read
 */
const getMaybeStats = filePath => fs.stat(filePath).catch(_e => null);

/**
 * Creates an new (empty) command output object.
 * @return {TaskResults}
 */
const makeTaskResults = () =>
    ({ out: '', error: '', timeStart: Date.now(), timeEnd: null, code: null });

/**
 * Runs a command, resolving with all resultant data upon completion.
 *
 * @param {string} cmd the command to run
 * @param {string[]} args the command line arguments to run the command with
 * @param {ncp.SpawnOptions|null} [options=null] process options (ex: `cwd`)
 * @param {string|null} [input = null] text to pipe into the process
 * @param {TaskResults|null} [out = null] output an output to add to
 * @return {Promise<TaskResults|null>} a promise resolving to output data
 */
export const run = (cmd, args, options = null, input = null, out = null) =>
    new Promise(yes => {
        const data = out ?? makeTaskResults();
        const spawnResult = doTry(() => ncp.spawn(cmd, args, options ?? {}));
        const spawned = spawnResult.value;
        if (spawned) {
            spawned.stdout?.on('data', x => { data.out += x; });
            spawned.stderr?.on('data', x => { data.error += x; });
            spawned.on('error', () => { yes(null); })
            spawned.on('close', () => {
                data.code = spawned.exitCode;
                data.timeEnd = Date.now();
                yes(data);
            });

            if (input !== null) {
                spawned.stdin?.write(input);
            }
            spawned.stdin?.end();
        } else {
            yes(null);
        }
    });

/**
 * Casts an object into a given type, or returns `null` if it cannot.
 * @template T the type to cast `x` into
 * @param {unknown} x the object to cast, if possible
 * @param {new (...args: any[]) => T} t the constructor, ex: `HTMLDivElement`
 * @return {T|null} the object cast as a `T`, or `null` if `x` is not a `T`
 */
export const cast = (x, t) =>
    x !== undefined && x !== null && x instanceof t ? x : null;

/**
 * Runs a function, returning the result unless it throws.
 * @template T
 * @param {() => T} fn the function to run safely
 * @return {Result<unknown, T>} the result of the computation
 */
export const doTry = fn => {
    try { return { value: fn() }; } catch(error) { return { error }; }
};

/**
 * Reads the body data from a request.
 * @param {http.IncomingMessage} req the incoming request
 * @return {Promise<string>} the request body
 */
const parseBody = (req) =>
    new Promise((yes, _no) => {
        let body = '';
        req.on('data', x => { body += x; });
        req.on('end', () => { yes(body); })
    });

/**
 * Gets an unused command ID.
 */
const getNewCommandId = () => {
    let id = '';
    while(id === '' || tasks.has(id)) {
        id = randomBytes(16).toString('hex');
    }
    return id;
};

/**
 * Removes tasks that finished at least `taskExpiryTime` ago.
 */
const removeOldTasks = () => {
    const now = Date.now();
    for(const [pid, task] of tasks) {
        const timeEnd = task.results.timeEnd;
        const timeSinceEnd = typeof timeEnd === 'number' ? now - timeEnd : 0;
        if (timeSinceEnd > taskExpiryTime) {
            tasks.delete(pid);
        }
    }
};

/**
 * Expands a command fragment into text.
 * @param {string} text a binary/argument to expand
 * @param {{[key: string]: string}} args the arguments to use to expand
 * @return {string} the expanded text
 */
const expandArgument = (text, args) => {
    const getTokens = /\$(\\+)?\{((?:(\w+):)?(\w+))\}/g;
    return text.replaceAll(getTokens, (match, slash, mBody, mFn, mKey) => {
        if (typeof slash === 'string' && slash.length > 0) {
            return `$${slash.substring(1)}{${string(mBody) ?? ''}}`;
        }
        const value = args[string(mKey) ?? ''] ?? '';
        if (mFn === 'relativePath') {
            const absolutePath = /^https?:\/\//.test(value)
                ? decodeURI(value.replace(/^[^/]*\/\/[^/]*\/|[?#].*$/g, ''))
                : value;
            return path.join(process.cwd(), path.resolve('/', absolutePath));
        }
        return value;
    });
};

/**
 * Gathers metadat from a filename. See `FileNameMetadta` for more docs.
 * @param {string} fileName the file name to analyze
 * @return {FileNameMetadata} the resulting metadata
 */
const getFileNameMetadata = fileName => {
    const dotMatcher = /(.*?)(?:( S\d+)(E\d[E\d]+))?\.([^.]+)$/;
    const match = fileName.match(dotMatcher);
    const [ _all, name, tvPrefix, tvSuffix, suffix ] = match ?? [];
    return {
        name: fileName,
        prefix: ((name ?? '') + (tvPrefix ?? '')) || fileName,
        suffix: ((tvSuffix ? tvSuffix + '.' : '') + (suffix ?? '')) || 'None',
        type: (suffix ?? '').toLocaleLowerCase()
    };
};

/**
 * Writes headers and text to a `ServerResponse`, then ends the connection.
 * @param {http.ServerResponse} res the response object to write to
 * @param {string} text the text content to write
 * @param {string|null} [fileType] data type, ex: `.json`. Default: `.html`.
 * @param {number} [code = 200] the response code
 * @param {http.OutgoingHttpHeaders} [headers] optional headers to add
 */
const respond = (res, text, fileType, code = 200, headers = {}) => {
    res.writeHead(code, {
        'Accept-Ranges': 'bytes',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Request-Private-Network': 'true',
        'Content-Length': Buffer.byteLength(text, 'utf8'),
        'Content-Type': mimeTypes[fileType ?? '.html'] || mimeTypes['.html'],
        ...headers
    });
    res.write(text);
    res.end(); 
};

/**
 * Writes headers and text to a `ServerResponse`, then ends the connection.
 * @param {http.ServerResponse} res the response object to write to
 * @param {number} code the response code
 * @param {any} json the JSON data to send
 */
const respondJson = (res, code, json) =>
    respond(res, JSON.stringify(json), '.json', code);

/**
 * Writes headers and text to a `ServerResponse`, then ends the connection.
 * @param {http.ServerResponse} res the response object to write to
 * @param {ErrorResponse['type']} type the type of error
 * @param {string} message the error message
 */
const respondJsonError = (res, type, message) =>
    respondJson(res, 500, { status: 'error', type, message });

//
//
// ## Type Verification Helpers

/**
 * A Type-Verification Error, describing the failure to verify a particular
 * piece of data as a particular type during runtime.
 */
class TvError extends Error {
    /**
     * @param {IsContext} context
     * @param {string} expected
     */
    constructor(context, expected) {
        super();
        this.key = context.key ?? '';
        this.expected = expected;
        this.observed = context.value;
        this.message = `At key-path \`${context.key ?? ''}\`, ` +
            `expected \`${expected}\` ` +
            `but was given \`${typeof this.observed}\` (${this.observed}).`;
    }
}

/**
 * Generates a sub-context representing the context in an input at a key.
 * @param {IsContext} c the current context
 * @param {string|number} key the property key get a sub-context at
 * @return {IsContext} the new sub-context
 */
const isIn = (c, key) => {
    const cKey = c.key ?? '';
    if (typeof key === 'number') {
        if (!Array.isArray(c.value)) {
            throw new TvError(c, 'array');
        }
        return { key: `${cKey}[${key}]`, value: c.value[key] };
    }

    if (!c.value || typeof c.value !== 'object') {
        throw new TvError(c, 'object');
    }
    return { key: `${cKey}${cKey ? '.' : ''}${key}`, value: c.value[key] };
};

/**
 * Creates a verifier for a single constant value.
 * @template T the type of the constant
 * @param {T} x the constant to compare it to
 * @return {IsA<T>} the constant verifier
 */
const isConstant = x => c => {
    if (c.value !== x) { throw new TvError(c, '' + x); }
    return c.value;
};

/** @type {IsA<boolean>} */
const isBoolean = (c) => {
    if (typeof c.value !== 'boolean') { throw new TvError(c, 'boolean'); }
    return c.value;
};

/** @type {IsA<string>} */
const isString = c => {
    if (typeof c.value !== 'string') { throw new TvError(c, 'string'); }
    return c.value;
};

const isUndefined = isConstant(undefined);

/**
 * Creates an object-checker whose values are checked by a given checker.
 * @template T the type of the children
 * @param {IsA<T>} fn the child checker
 * @return {IsA<{[key: string]: T}>} the new array checker
 */
const isObjectMap = fn => c => {
    if (!c.value || typeof c.value !== 'object') {
        throw new TvError(c, 'object');
    }
    const output = /** @type {Object<string, T>} */({});
    for (const key of Object.keys(c.value)) {
        output[key] = fn(isIn(c, key));
    }
    return output;
};

/**
 * Creates an array-checker whose elements are checked by a given checker.
 * @template T the type of the children
 * @param {IsA<T>} fn the child checker
 * @return {IsA<T[]>} the new array checker
 */
const isArrayOf = fn => c => {
    if (!Array.isArray(c.value)) {
        throw new TvError(c, 'array');
    }
    return c.value.map((_child, i) => fn(isIn(c, i)));
};

/**
 * Creates a checker that checks 
 * @template {IsA<any>[]} T
 * @param {T} list
 * @return {IsA<ReturnType<T[number]>>}
 */
const isOneOf = (...list) => c => {
    const types = /** @type {string[]} */([]);
    for(const fn of list) {
        try {
            return fn(c);
        } catch(e) {
            if (e instanceof TvError) {
                const isSameKey = (c.key ?? '') === (e.key ?? '');
                types.push(isSameKey ? e.expected : `[${e.message}]`);
            }
        }
    }
    throw new TvError(c, types.join(' | '));
};

/**
 * Creates a checker by adding optionality to a given checker.
 * @template T the non-optional type to make optional
 * @param {IsA<T>} fn the base checker
 * @return {IsA<T | undefined>} the optionality checker
 */
const isMaybe = fn => isOneOf(fn, isUndefined);

/** @type {IsA<ArgumentSchema>} */
const isArgumentSchema = c => ({
    key: isString (isIn(c, 'key')),
    info: isString (isIn(c, 'info')),
    values: isMaybe(isArrayOf(isString)) (isIn(c, 'values'))
});

/** @type {IsA<CommandRequest>} */
const isCommandRequest = c => ({
    name: isString (isIn(c, 'name')),
    arguments: isObjectMap(isString) (isIn(c, 'arguments')),
    isPersisted: isMaybe(isBoolean) (isIn(c, 'isPersisted')),
});

/** @type {IsA<QspServerConfigCommand>} */
const isQspServerConfigCommand = c => ({
    name: isString (isIn(c, 'name')),
    arguments: isMaybe(isArrayOf(isArgumentSchema)) (isIn(c, 'arguments')),
    cwd: isMaybe(isString) (isIn(c, 'cwd')),
    runner: isArrayOf(isString) (isIn(c, 'runner'))
});

/** @type {IsA<QspServerConfig>} */
const isQspServerConfig = c => ({
    commands: isMaybe(isArrayOf(isQspServerConfigCommand))(isIn(c, 'commands'))
});

/** @type {IsA<HttpCallRequest>} */
const isHttpCallRequest = c => ({
    method: isString(isIn(c, 'method')),
    url: isString(isIn(c, 'url')),
    headers: isMaybe(isObjectMap(isString))(isIn(c, 'headers')),
    body: isMaybe(isString)(isIn(c, 'body'))
});

//
//
// ## Template Functions

export const get404Html = () => `<!DOCTYPE html>
<html lang="en">
    <head>
        <meta http-equiv="Content-Type" content="text/html; charset=utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <style>${indexStyles}</style>
    </head>
    <body><h1>404 Not Found</h1></body>
</html>`;

/**
 * Creates the page displayed when markdown cannot be rendered.
 * @param {string} css the markdown string
 */
export const getMarkdown500Html = (css) => `<!DOCTYPE html>
<html lang="en">
    <head>
        <meta http-equiv="Content-Type" content="text/html; charset=utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <style>${css}</style>
    </head>
    <body>
        <h1>Markdown Render Error</h1>
        <p>Markdown rendering failed. The "marked" binary may be missing.</p>
        ${css.trim() === '' ? `<p>"github-markdown-css" is missing.</p>` : ''}
    </body>
</html>`;

/**
 * Creates a page to display markdown styled by some given CSS.
 * @param {string} body the rendered markdown text to inject
 * @param {string} css the CSS styling to add to the head
 * @return {string} the markdown body html, surrounded by page scaffolding
 */
export const getMarkdownHtml = (body, css) => `<!DOCTYPE html>
<html lang="en">
    <head>
        <meta http-equiv="Content-Type" content="text/html; charset=utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <style>${css}</style>
        <style>
            .markdown-body.width {
                box-sizing: border-box;
                min-width: 200px;
                max-width: 980px;
                margin: 0 auto;
                padding: 45px;
            }
            @media (max-width: 767px) {
                .markdown-body.width {
                    padding: 15px;
                }
            }
        </style>
    </head>
    <body class="markdown-body width">${body}</body>
</html>`;

/**
 * Gets the HTML for a single filetype button in a group.
 * @param {FileNameMetadata} file the file to render
 * @param {boolean} [isName] true if we are simply displaying a name link
 * @param {boolean} [isMd] true if we are displaying a render link
 * @return {string} the file type link URL
 */
export const getTypeHtml = (file, isName, isMd) => `
    <a href="./${encodeURI(file.name)}${isMd ? '?render=md' : ''}">
        ${isName ? file.name : (isMd ? 'Rendered' : file.suffix)}
    </a>`;

/**
 * Gets the HTML for a group of similarly-named files.
 * @param {FileNameMetadata[]} group a group of filenames
 * @param {FileNameMetadata|null} icon the icon for the group
 * @return {string} the HTML representing this group of files
 */
export const getFileHtml = (group, icon) => {
    const mdFile = group.find(x => x.type === 'md');
    const single = !mdFile && group.length === 1 ? group[0] : null;
    return `<li class="filegroup filegroup-${single ? 'single' : 'multiple'}">
        ${icon ? `<img loading=lazy src="./${encodeURI(icon.name)}" />` : ''}
        <div class="filegroup-text">
            <span class="filegroup-name">
                ${single ? getTypeHtml(single, true) : group[0]?.prefix}
            </span>
            <ul class="items-type">
                ${group.map(x => `<li>${getTypeHtml(x)}</li>`).join('\n')}
                ${mdFile ? `<li>${getTypeHtml(mdFile, false, true)}</li>` : ''}
            </ul>
        </div>
    </li>`;
};

/**
 * Gets the HTML for an index.
 * @param {string} pathRoot the path to the folder from the root filesystem
 * @param {string} pathUrl the path to the folder to render
 * @return {Promise<string>} the body content
 */
export const getIndexHtml = async (pathRoot, pathUrl) => {
    const childNames = (await fs.readdir(pathRoot)).sort()
        .filter(x => !x.startsWith('._'));

    const files = await Promise.all(childNames.map(async name => ({
        stats: await getMaybeStats(path.join(pathRoot, name)),
        ...getFileNameMetadata(name)
    })));

    const folderItems = /** @type {string[]} */([]);
    const iconItems = /** @type {string[]} */([]);
    const fileItems = /** @type {string[]} */([]);

    /** @type {Map<string, typeof files>} */
    const fileGroups = new Map();
    for(const file of files) {
        const { name, stats, prefix } = file;
        if (!stats?.isDirectory()) {
            const subFiles = fileGroups.get(prefix) || [ ];
            subFiles.push(file);
            fileGroups.set(prefix, subFiles);
        } else {
            folderItems.push(`<li><a href="./${name}/">${name}</a></li>`);
        }
    }

    for(const group of fileGroups.values()) {
        const icon = group.find(file => iconTypes.has(file.type)) ?? null;
        const items = icon ? iconItems : fileItems;
        items.push(getFileHtml(group, icon));
    }

    return `<!DOCTYPE html>
    <html lang="en">
        <head>
            <meta http-equiv="Content-Type" content="text/html; charset=utf-8" />
            <meta name="viewport" content="width=device-width, initial-scale=1" />
            <style>${indexStyles}</style>
        </head>
        <body>
            <h1>Index of: ${pathUrl}</h1>

            <h2 class="title-folders">Folders</h2>
            <ul class="items-folder">${folderItems.join('\n')}</ul>

            <h2 class="title-files">Files</h2>
            <ul class="items-icon">${iconItems.join('\n')}</ul>
            <ul class="items">${fileItems.join('\n')}</ul>
        </body>
    </html>`;
};

//
//
// ## Main Request Handler

/**
 * The main request handler for the simple server.
 *
 * @param {ResponderContext} context the shared server context
 * @param {http.IncomingMessage} req the request object
 * @param {http.ServerResponse} res the response object
 */
const requestListener = async (context, req, res) => {
    const { config, mdCss, local } = context;
    const range = req.headers.range;
    const url = req.url ?? '';
    const urlResult = doTry(() => new URL(`https://localhost${url}`));
    const urlParsed = urlResult.value;
    const render = urlParsed?.searchParams.get('render') ?? null;
    const directive = urlParsed?.searchParams.get('do') ?? null;
    const urlPath = path.resolve('/', decodeURI(urlParsed?.pathname ?? ''));
    const isLocal = local && urlPath.startsWith(`/${local}`);
    const filePath = isLocal
        ? path.join(import.meta.dirname, urlPath.substring(1 + local.length))
        : path.join(process.cwd(), urlPath);
    const fileMime = mimeTypes[path.extname(filePath)] || 'text/plain';
    const stat = !directive ? await getMaybeStats(filePath) : null;

    // CLI Runner
    if (req.method === 'POST' && directive === 'run') {
        const pid = getNewCommandId();
        const bodyText = await parseBody(req);
        const { value: request, error: bodyError} =
            doTry(() => isCommandRequest({ value: JSON.parse(bodyText) }) );
        if (!request) {
            const message = cast(bodyError, Error)?.message ?? '';
            respondJsonError(res, 'command-json', message);
            return;
        }

        const command = config.commands?.find(x => x.name === request?.name);
        if (!command) {
            const message = `Command not in config: \`${request.name}\``;
            respondJsonError(res, 'command-name', message);
            return;
        }

        const { isPersisted, arguments: args } = request;

        // Constrain given arguments
        for(const spec of command?.arguments ?? []) {
            const value = args[spec.key];
            args[spec.key] = spec.values
                ? (spec.values.find(x => x === value) ?? spec.values[0])
                : args[spec.key];
        }

        // Run Command
        const cliArgs = command.runner.map(x => expandArgument(x, args));
        const cliName = cliArgs.shift();
        if (!cliName) {
            const message = `No bin for command named: \`${request.name}\``;
            respondJsonError(res, 'command-bin', message);
            return;
        }

        const results = makeTaskResults();
        const info = { pid, request, results };
        tasks.set(pid, info);
        removeOldTasks();

        const cwd = command.cwd ? expandArgument(command.cwd, args) : null;
        const options = cwd ? { cwd } : null;
        const runResult = run(cliName, cliArgs, options, null, results);
        if (!isPersisted) {
            await runResult;
        }
        respondJson(res, 200, info);


    // CLI Task Output
    } else if (req.method === 'GET' && directive === 'getTaskInfo') {
        const pid = urlParsed?.searchParams.get('pid') ?? '';
        const info = tasks.get(pid);
        if (!info) {
            const message = `No process with pid: \`${pid}\``;
            respondJsonError(res, 'task-pid', message);
            return;
        }
        respondJson(res, 200, info);


    // CLI Command List
    } else if (req.method === 'GET' && directive === 'getCommands') {
        /** @type {CommandSchema[]} */
        const output = config.commands
            ?.map(x => ({ name: x.name, arguments: x.arguments }))
            ?? [];
        respondJson(res, 200, output);


    // CLI Task List
    } else if (req.method === 'GET' && directive === 'getTasks') {
        /** @type {Task[]} */
        const listings = Array.from(tasks.values()).map(x => ({
            ...x,
            results: { ...x.results, out: '', error: '' }
        }));
        respondJson(res, 200, listings);


    // Proxy Mode
    } else if (req.method === 'POST' && directive === 'proxy') {
        const bodyText = await parseBody(req);
        const { value: proxy, error } =
            doTry(() => isHttpCallRequest({ value: JSON.parse(bodyText) }));
        if (!proxy) {
            const message = cast(error, Error)?.message ?? '';
            respondJsonError(res, 'proxy-json', message);
            return;
        }

        try {
            /** @type {RequestInit} */
            const fetchOptions = {
                cache: 'no-cache',
                method: proxy.method,
                headers: proxy.headers,
                body: proxy.body
            };
            const response = await fetch(proxy.url, fetchOptions);
            const text = await response.text();
            const responseHeaders = /** @type {Object<string, string>} */({});
            response.headers.forEach((value, key) => {
                responseHeaders[key] = value;
            });
            respond(res, text, '.txt', response.status, responseHeaders);
        } catch(e) {
            const message = cast(e, Error)?.message ?? '';
            respondJsonError(res, 'proxy-response', message);
        }


    // File Not Found Page
    } else if (!stat) {
        respond(res, get404Html(), '.html', 404);


    // Folder Indexes
    } else if (stat.isDirectory()) {
        respond(res, await getIndexHtml(filePath, urlPath));


    // Markdown File, Rendered
    } else if (render === 'md') {
        const out = (await run('npx', ['marked', '-i', filePath]))?.out;
        const isSuccess = typeof out === 'string';
        const body = isSuccess
            ? getMarkdownHtml(out, mdCss)
            : getMarkdown500Html(mdCss);
        respond(res, body, null, isSuccess ? 200 : 500);
        

    // Stream File Byte Range
    } else if (range) {
        const parts = (range || '-').replace(/bytes=/, '').split('-');
        const endMax = stat.size - 1;
        const start = Number(parts[0]) || 0;
        const end = parts[1] ? Number(parts[1]) || 0 : endMax;
        const stream = fsRoot.createReadStream(filePath, {
            start: Math.max(Math.min(start, endMax), 0),
            end: Math.max(Math.min(end, endMax), 0)
        });

        res.writeHead(206, {
            'Content-Range': `bytes ${start}-${end}/${stat.size}`,
            'Accept-Ranges': 'bytes',
            'Content-Length': end - start + 1,
            'Content-Type': fileMime
        });
        stream.on('open', () => { stream.pipe(res); });
        stream.on('error', e => {
            console.error(e);
            respond(res, '500 Server Error', '.txt', 500);
        });


    // Stream File
    } else {
        const stream = fsRoot.createReadStream(filePath);
        res.writeHead(200, {
            'Accept-Ranges': 'bytes',
            'Access-Control-Allow-Origin': '*',
            'Content-Length': stat.size,
            'Content-Type': fileMime
        });
        stream.on('error', e => {
            console.error(e);
            respond(res, '500 Server Error', '.txt', 500);
        });
        stream.pipe(res);
    }
};

const main = async () => {
    const args = parseArgs();

    const argPort = parseInt(string(args.p || args.port) ?? '', 10) || port;
    const argConfig = string(args.c || args.config);
    const argKey = string(args.k || args.key);
    const argCert = string(args.e || args.cert);
    const argMd = string(args.m || args.markdown);
    const argLocal = string(args.l || args.local);
    if (args.h || args.help) {
        console.log(help);
        return;
    }

    const keyFile = argKey ? fs.readFile(argKey) : null;
    const key = await keyFile
        ?.then(x => x.toString())
        ?.catch(_e => {
            console.error(`Could not read HTTPS key at: ${argKey}`);
            return null;
        });

    const certFile = argCert ? fs.readFile(argCert) : null;
    const cert = await certFile
        ?.then(x => x.toString())
        ?.catch(_e => {
            console.error(`Could not read HTTPS cert at: ${argKey}`);
            return null;
        });

    const mdCss = await fs.readFile(argMd ?? pathNpmMdCss)
        .then(x => x.toString())
        .catch(_e => argMd
            ? '/* Error: `-m` markdown CSS file could not be read. */'
            : '/* Use `-m` to provide rendered markdown CSS. */'
        );

    const listener = requestListener.bind(null, {
        mdCss,
        config: argConfig ? await readConfig(argConfig) : { },
        local: argLocal
    });

    if (cert && key) {
        const server = https.createServer({
            key: await fs.readFile(path.join(import.meta.dirname, 'server.key')),
            cert: await fs.readFile(path.join(import.meta.dirname, 'server.cert'))
        }, listener);
        server.listen(argPort);
        console.log(`Server Running: https://localhost:${argPort}`);
    } else {
        const server = http.createServer(listener);
        server.listen(argPort);
        console.log(`Server Running: http://localhost:${argPort}`);
    }
};

main();

