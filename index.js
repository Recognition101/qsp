import { lookup, expand } from './src/lookup.js';
import {
    isArrayOf,
    isCommandSchema,
    isPanelConfig,
    isTask
} from './src/type-verifier.js';
import {
    h,
    select,
    cast,
    clamp,
    join,
    wait,
    doTry
} from './src/lib.js';

/**
 * @typedef {import('./types').Json} Json
 * @typedef {import('./types').JsonObject} JsonObject
 * @typedef {import('./types').ClientApp} ClientApp
 * @typedef {import('./types').ClientCommandSet} ClientCommandSet
 * @typedef {import('./types').ClientTaskList} ClientTaskList
 * @typedef {import('./types').EventLike} EventLike
 *
 * @typedef {import('./types').PanelConfig} PanelConfig
 * @typedef {import('./types').Panel} Panel
 * @typedef {import('./types').PanelButton} PanelButton
 * @typedef {import('./types').HttpCallRequest} HttpCallRequest
 * @typedef {import('./types').CommandSchema} CommandSchema
 * @typedef {import('./types').ArgumentSchema} ArgumentSchema
 */
/**
 * @template E
 * @template T
 * @typedef {import('./types').Result<E, T>} Result
 */
/**
 * @template T
 * @typedef {import('./types').IsA<T>} IsA
 */
/**
 * @template {keyof HTMLElementTagNameMap} T
 * @template R
 * @typedef {import('./types').HtmlAttributeSet<T, R>} HtmlAttributeSet
 */


//
//
// ## Constants and Globals

/** Time (in ms) to display feedback that the request was sent. */
const TIME_FEEDBACK = 100;
const configKey = 'r101-qsp-panel-config-json';
const headers = Object.freeze(/** @type {const} */([
    'h1', 'h2', 'h3', 'h4', 'h5', 'h6'
]));
const jsToJson = /^\s*\/\*\*.*\*\/\s*export [^=]*=\s*/m;

//
//
// ## Data Helper Functions

/**
 * Clears all children from a given element.
 * @param {HTMLElement} el the element to empty
 */
const clearDom = (el) => {
    while(el.childNodes[0]) {
        el.childNodes[0].remove();
    }
};

/**
 * Reads the configuration from storage. Returns a default value if no config
 * was found or an invalid config was found.
 * @return {PanelConfig} the stored (or default) configuration
 */
const readStorage = () => {
    try {
        const text = window.localStorage.getItem(configKey);
        return isPanelConfig({ value: JSON.parse(text ?? 'null') });
    } catch(e) { }

    // Failed, cleanup local storage.
    doTry(() => window.localStorage.removeItem(configKey));
    return { root: { title: 'Import Config' } };
};

/**
 * Gets the URL for a page showing a particular task's output.
 * @param {string} commandUrl the URL of the command server containing `pid`
 * @param {string} pid the process ID of the task to display
 * @return {string} the URL for a viewer page that views the given task
 */
const getPidViewerUrl = (commandUrl, pid) => {
    const pidUrl = addToken(commandUrl, '?', 'do=getTaskInfo&pid', pid);

    const url = new URL(window.location.href);
    url.searchParams.append('pid', pid);
    url.hash = `pidUrl=${encodeURIComponent(pidUrl)}`;
    return url.toString();
};

/**
 * Fetch the results of a QSP Command Protocol API call.
 * @template T the type of the API response
 * @param {ClientApp} app the app to notify upon failure
 * @param {string} apiUrl the API URL to the server whose API this calls
 * @param {IsA<T>} cast the function that casts data into the response type
 * @return {Promise<T|null>} the API response, if successful
 */
const callCommandApi = async (app, apiUrl, cast) => {
    const urlName = `Command URL \`${apiUrl}\``;
    let message = /** @type {string|null} */(null);
    let error = /** @type {unknown} */(null);
    
    /** @type {RequestInit} */
    const fetchOptions = { cache: 'no-cache' };
    const response = await fetch(apiUrl, fetchOptions).catch(e => {
        message = `${urlName} could not be requested.`;
        error = e;
        return null;
    });

    const json = await response?.json().catch(e => {
        message = `${urlName} did not return JSON.`;
        error = e;
        return null;
    });

    const result = message ? null : doTry(() => cast({ value: json }));
    if (result && (result.error || !result.value)) {
        message = `${urlName} responded with an incorrectly typed structure.`;
        error = result.error;
    }

    if (message) {
        app.showErrorModal(message, error);
    }
    return result?.value ?? null;
};

/**
 * Gets command information about a given button.
 * @param {ClientApp} app the app to download commands for
 * @param {PanelButton|null} button the button whose command we inspect
 */
const getCommand = (app, button) => {
    const commandName = lookup(app, button, 'command');
    const commandUrl = lookup(app, button, 'commandUrl');
    const commandSet = commandUrl ? app.commandMap.get(commandUrl) : null;
    const command = commandSet?.commands?.find(x => x.name === commandName);

    return { commandName, commandUrl, command };
};

/**
 * Adds a token to a URL, returning the new URL.
 * @param {string} url the existing URL
 * @param {string} delimiter the delimiter separating the URL and token
 * @param {string} key the token key to append to the url
 * @param {string|null} value the token value to append to the url
 * @return {string} the `url` with `token` appended
 */
const addToken = (url, delimiter, key, value = null) =>
    `${url}${url.includes(delimiter) ? '&' : delimiter}` +
    (value !== null ? `${key}=${encodeURIComponent(value)}` : key);

/**
 * Begins the process of refreshing the tasks.
 * @param {ClientApp} app the application orchestration global
 */
const refreshTasks = (app) => {
    app.tasks.clear();
    for(const commandUrl of app.commandUrls) {
        const url = addToken(commandUrl, '?', 'do=getTasks');
        /** @type {ClientTaskList} */
        const taskList = {
            url: commandUrl,
            loader: callCommandApi(app, url, isArrayOf(isTask)),
            tasks: null
        };
        taskList.loader.then(x => {
            taskList.tasks = x;
            app.updateTaskList();
        });
        app.tasks.set(commandUrl, taskList);
    }
};

//
//
// ## Event Handler Helpers

/**
 * On a `change` or `input` event, updates the set variable to match.
 * @param {ClientApp} app the application orchestration global
 * @param {EventLike} ev the event that triggered this
 */
const updateInput = async (app, ev) => {
    const input = cast(ev.target, HTMLInputElement);
    const select = cast(ev.target, HTMLSelectElement);
    const key = input?.name ?? select?.name;
    const value = input?.value ?? select?.value;
    if (app.input && typeof key === 'string' && typeof value === 'string') {
        app.input.set = app.input.set || {};
        app.input.set[key] = value;
    }
};

/**
 * Runs a button command, possibly setting up a repeat-timer.
 * @param {ClientApp} app the application orchestration global
 * @param {HTMLElement|null} domButton the button being held
 * @param {PanelButton} button the button being held
 * @param {AbortSignal} [signal] a signal to stop repeating
 * @param {boolean} [isRepeat] true if this is a repeated call
 */
const runButton = async (app, domButton, button, signal, isRepeat) => {
    // TODO: create event dispatcher

    const sub = expand.bind(null, app, button);
    const timeSent = Date.now();

    const { commandName, commandUrl, command } = getCommand(app, button);
    const proxyUrl = lookup(app, button, 'proxyUrl');
    const isPersisted = !!lookup(app, button, 'isPersisted');
    const showOutput = lookup(app, button, 'showOutput');
    const inRequest = lookup(app, button, 'request')
        ?? (command && commandUrl ? { method: '', url: '' } : null);

    if ((commandName && !command) || !inRequest) {
        return;
    }

    domButton?.classList.add('is-sending');

    // Create `request` as input (`inRequest`) with substitutions made
    const inHeaders = Array.from(Object.entries(inRequest.headers ?? {}));
    /** @type {HttpCallRequest} */
    const request = {
        method: sub(inRequest.method),
        url: sub(inRequest.url),
        body: inRequest.body ? sub(inRequest.body) : undefined,
        headers: inHeaders.reduce((map, [key, value]) => {
            map[sub(key)] = sub(value);
            return map;
        }, /** @type {Object<string, string>} */({}))
    };

    // Update request with `command` defaults
    if (command && commandUrl && request) {
        request.method = request.method || 'POST';
        request.url = request.url || addToken(commandUrl, '?', 'do=run');
        request.body = request.body || JSON.stringify({
            name: command.name,
            arguments: (button.set ?? {}),
            isPersisted
        });
    }

    // Update request with `proxyUrl` defaults
    if (proxyUrl && request) {
        const proxyBody = JSON.stringify(request);
        request.method = 'POST';
        request.url = addToken(proxyUrl, '?', 'do=proxy');
        request.headers = {};
        request.body = proxyBody;
    }
    
    // Make HTTP request, handle response
    /** @type {RequestInit} */
    const fetchOptions = {
        mode: !showOutput ? 'no-cors' : undefined,
        cache: 'no-cache',
        method: request.method,
        headers: request.headers,
        body: request.body
    };
    const response = await fetch(request.url, fetchOptions)
        .then(x => x.text())
        .catch(e => { app.onError(e); return null; });
    if (response && command && commandUrl) {
        const { value: task, error } = doTry(() =>
            isTask({ value: JSON.parse(response) })
        );
        refreshTasks(app);
        if (!task) {
            app.showErrorModal('Response was not a `Task`.', error);
        } else if (isPersisted) {
            app.showProcess(commandUrl, task.pid);
        } else {
            app.showOutput(task.results.out);
        }
    } else if (response && showOutput) {
        app.showOutput(response);
    }

    // Wait (if necessary) and recurse (based on repeat time)
    const timeWait = TIME_FEEDBACK - (Date.now() - timeSent);
    if (timeWait > 0) {
        await wait(timeWait);
    }
    domButton?.classList.remove('is-sending');
    if (signal && !signal.aborted) {
        const riKey = 'repeatInitial';
        const repeat = (!isRepeat ? lookup(app, button, riKey) : null)
            ?? lookup(app, button, 'repeat')
            ?? 1000;
        setTimeout(() => {
            if (!signal.aborted) {
                runButton(app, domButton, button, signal, true);
            }
        }, repeat);
    }
};

/**
 * The callback handling when a dropdown button is changed.
 * @param {ClientApp} app the application orchestration global
 * @param {PanelButton|null} button the button that changed
 * @param {EventLike} ev the event
 */
const onChange = (app, button, ev) => {
    const domSelect = cast(ev.target, HTMLSelectElement);
    const { commandName, command } = getCommand(app, button);
    if (!domSelect || !button || (commandName && !command)) {
        return;
    }

    const key = button.arguments?.[0]?.key ?? null;
    if (key) {
        button.set = button.set ?? { };
        button.set[key] = domSelect.value;
    }

    domSelect.value = '';
    runButton(app, domSelect, button);
};

/**
 * The callback handling when a button is pressed.
 * @param {ClientApp} app the application orchestration global
 * @param {PanelButton|null} button the button that was pressed
 * @param {boolean} showInputs if true, show inputs if needed
 * @param {EventLike} ev the event
 */
const onPress = (app, button, showInputs, ev) => {
    const domButton = cast(ev.target, HTMLButtonElement)?.closest('button');
    const { commandName, command } = getCommand(app, button);
    if (!button || !domButton || (commandName && !command)) {
        return;
    }

    if (showInputs && lookup(app, button, 'arguments')) {
        app.showInput(button);
    } else {
        const abort = new AbortController();
        app.heldButtons.get(button)?.abort();
        app.heldButtons.set(button, abort);
        runButton(app, domButton, button, abort.signal);
    }
};

/**
 * The callback handling when a button is released.
 * @param {ClientApp} app the application orchestration global
 * @param {PanelButton|null} button the button that was released
 */
const onRelease = (app, button) => {
    if (button) {
        app.heldButtons.get(button)?.abort();
        app.heldButtons.delete(button);
    }
};

/**
 * Releases all buttons.
 * @param {ClientApp} app the application orechestration global
 */
const releaseAll = (app) => {
    for(const button of app.heldButtons.keys()) {
        onRelease(app, button);
    }
};

//
//
// ## DOM Rendering Helper Functions

/**
 * @param {Error|string} info the error or text to display
 */
const makeError = (info) => {
    const error = info instanceof Error ? info : null;
    const now = new Date();
    return h('li', [
        h('div', [
            { className: 'errors-time' },
            now.toLocaleString()
        ]),
        h('div', [ { className: 'errors-name' }, error?.name ?? '' ]),
        h('div', [
            { className: 'errors-message' },
            h('span', [
                error?.message
                    ?? info?.toString()
                    ?? 'Unknown Cause'
            ]),
            h('details', [
                h('summary', 'Stack'),
                h('div', [
                    { className: 'errors-stack code-block' },
                    error?.stack ?? ''
                ])
            ])
        ])
    ]);
};

/**
 * Renders the output of a process
 * @param {ClientApp} app the application orchestration global
 * @return {HTMLDivElement} the process element
 */
const renderProcess = app => {
    const domOutput = h('div', { className: 'process-out' });
    const domError = h('div', { className: 'process-error' });

    const domMain = h('div', [
        { className: 'process is-loading' },
        domOutput,
        domError,
        h('div', [{ className: 'indicator-loading' }, 'PROCESS RUNNING']),
        h('div', [{ className: 'indicator-error' }, 'Error!'])
    ]);

    const abort = new AbortController();
    const signal = abort.signal;
    app.pidUpdater = abort;
    const updateOutput = async () => {
        const pidUrl = app.pidUrl;
        if (!pidUrl) {
            return;
        }
        try {
            const taskJson = await (await fetch(pidUrl)).json();
            const task = isTask({ value: taskJson });
            domOutput.innerText = task.results.out;
            domError.innerText = task.results.error;
            const isDone = typeof task.results.timeEnd === 'number';
            domMain.classList.toggle('is-loading', !isDone);

            if (!isDone && !signal.aborted) {
                window.setTimeout(updateOutput, 1000);
            }
        } catch(e) {
            domMain.classList.remove('is-loading');
            domMain.classList.add('is-error');
        }
    };

    updateOutput();

    return domMain;
};

/**
 * Renders a single button (or dropdown).
 * @param {ClientApp} app the application orchestration global
 * @param {PanelButton} button the button we are rendering
 * @param {boolean} [isUpdate] true if this is an update to an existing button
 * @return {HTMLButtonElement|HTMLSelectElement} the button element
 */
const renderButton = (app, button, isUpdate) => {
    const column = lookup(app, button, 'column');
    const args = lookup(app, button, 'arguments') ?? [];
    const select = args.length === 1 && args[0].values ? args[0] : null;
    const commandName = lookup(app, button, 'command');
    const commandUrl = lookup(app, button, 'commandUrl');
    const disabled = commandUrl ? 'disabled' : undefined;

    button.set = button.set ?? { };
    for(const { key, values } of button.arguments ?? []) {
        button.set[key] = values ? (values[0] || '') : button.set[key];
    }

    const domButton = select
        ? renderSelect(app, button, select, '', button.text, {
            disabled,
            onChange: ev => onChange(app, button, ev)
        })
        : h('button', [
            {
                disabled,
                style: { gridColumn: column?.toString() ?? '' },
                onPointerdown: e => onPress(app, button, true, e),
                onPointerup: () => onRelease(app, button),
                onPointercancel: () => onRelease(app, button)
            },
            button.text
        ]);

    if (!isUpdate) {
        app.commandMap.get(commandUrl ?? '')?.loader?.then(commands => {
            const command = commands?.find(x => x.name === commandName);
            if (command) {
                button.arguments = command.arguments;
                const domNewButton = renderButton(app, button, true);
                domButton.replaceWith(domNewButton);
                domNewButton.disabled = false;
            }
        });
    }

    return domButton;
};

/**
 * Renders a panel into a DOM element.
 * @param {ClientApp} app the application orchestration global
 * @param {Panel} panel the panel to render
 * @param {number} [level=1] this panel's nesting level
 * @return {HTMLElement} the constructed panel
 */
const renderPanel = (app, panel, level = 1) => {
    const header = headers[clamp(level - 1, 0, headers.length - 1)];
    const buttons = panel.buttons ?? [];

    for(const button of buttons) {
        const commandUrl = lookup(app, button, 'commandUrl');
        if (commandUrl) {
            app.commandUrls.add(commandUrl);
        }
        if (commandUrl && !app.commandMap.has(commandUrl)) {
            const url = addToken(commandUrl, '?', 'do=getCommands');
            /** @type {ClientCommandSet} */
            const commandSet = {
                loader: callCommandApi(app, url, isArrayOf(isCommandSchema)),
                commands: null
            };
            commandSet.loader.then(x => { commandSet.commands = x; });
            app.commandMap.set(commandUrl, commandSet);
        }
    }

    const domButtons = buttons.map(button => renderButton(app, button));

    const domChildren = (panel.children ?? [])
        .map(child => renderPanel(app, child, level + 1));
    
    return h('div', [
        { className: 'panel' },
        h(header, [panel.title]),
        h('div', [{ className: 'panel-buttons' }, ...domButtons]),
        ...domChildren
    ]);
};

/**
 * Renders a select field given an argument with `values`.
 * @param {ClientApp} _app the application orchestration global
 * @param {PanelButton} _button the button containing this argument
 * @param {ArgumentSchema} arg the argument to render
 * @param {string} value the current value this select has
 * @param {string} [title] an optional initial option, whose value is ''
 * @param {HtmlAttributeSet<'select', HTMLElement>} [attrs] optional attributes
 * @return {HTMLSelectElement} the select element representing argument
 */
const renderSelect = (_app, _button, arg, value, title, attrs) => {
    const values = arg.values ?? [];
    const titleSelected = value === '' ? 'selected' : undefined;
    const domTitle = title
        ? h('option', [{ value: '', selected: titleSelected }, title])
        : null;
    return h('select', [
        { name: arg.key },
        attrs,
        domTitle,
        ...values.map(v =>
            h('option', [
                { value: v, selected: v === value ? 'selected' : undefined },
                v
            ])
        )
    ]);
};

/**
 * Renders UI that controls the inputs for a given button.
 * @param {ClientApp} app the application orchestration global
 * @param {PanelButton} button the button whose inputs we render
 * @return {HTMLUListElement} the input content
 */
const renderInput = (app, button) => {
    const inputs = (button.arguments ?? []).map(arg => {
        const curValue = lookup(app, button, null, arg.key);
        return h('li', [
            { className: 'input-input'},
            h('div', [
                { className: 'input-desc' },
                h('div', [{ className: 'input-key' }, arg.key]),
                h('div', [{ className: 'input-info' }, arg.info]),
            ]),
            arg.values
                ? renderSelect(app, button, arg, curValue ?? '')
                : h('input', {
                    type: 'text',
                    name: arg.key,
                    value: (curValue ?? '')
                })
        ]);
    });

    return h('ul', inputs);
};

/**
 * Renders the current list of active/completed tasks.
 * @param {ClientApp} app the application orchestration global
 * @return {HTMLLIElement[]} the list of tasks
 */
const renderTasks = (app) => {
    const tasks = app.tasks.values()
        .flatMap(x => x.tasks?.map(t => ({ url: x.url, ...t })) ?? [])
        .toArray()
        .sort((a, b) => b.results.timeStart - a.results.timeStart);

    return tasks.map(task => {
        const args = Object.entries(task.request.arguments);
        const { timeStart, timeEnd } = task.results;
        const start = (new Date(timeStart)).toLocaleString();
        const end = timeEnd
            ? (new Date(timeEnd)).toLocaleString()
            : '';
        const startWords = start.split(' ');
        const endWords = end.split(' ');
        const endTrimIndex = endWords.findIndex((word, i) =>
            i >= startWords.length || word !== startWords[i]
        );
        const endTrimmed = endTrimIndex >= 0
            ? endWords.slice(endTrimIndex).join(' ')
            : '';

        return h('li', [
            { className: 'task' },
            h('a', [
                {
                    className: 'task-name',
                    href: getPidViewerUrl(task.url, task.pid),
                    target: '_blank'
                },
                task.request.name
            ]),
            h('span', [
                { className: 'task-time'},
                `${start}${join(' - ', endTrimmed || null)}`
            ]),
            h('details', [
                h('summary', ' ? '),
                h('ol', args.map(([k, v]) =>
                    h('li', [
                        { className: 'task-arg' },
                        h('span', [{ className: 'task-key' }, k]),
                        ' = ',
                        h('span', [{ className: 'task-value' }, v])
                    ])
                ))
            ])
        ]);
    });
};

//
//
// ## Main Function

const main = async () => {
    const domImport = cast(select('#config-import')[0], HTMLInputElement);
    const domExport = cast(select('#config-export')[0], HTMLAnchorElement);
    const domTaskList = cast(select('#task-list')[0], HTMLElement);
    const domRoot = cast(select('#root')[0], HTMLElement);
    const domErrors = cast(select('#errors-list')[0], HTMLUListElement);
    const domOutput = cast(select('#output')[0], HTMLDialogElement);
    const domOutputCopy = cast(select('#output-copy')[0], HTMLButtonElement);
    const domOutputContent = cast(select('#output-content')[0], HTMLElement);
    const domBackdrop = cast(select('#dialog-backdrop')[0], HTMLElement);
    const domInput = cast(select('#input')[0], HTMLDialogElement);
    const domInputs = cast(select('#input-inputs')[0], HTMLElement);
    const domInputSend = cast(select('#input-send')[0], HTMLButtonElement);

    if (!domImport || !domExport || !domRoot || !domErrors || !domTaskList) {
        alert('Initial DOM root-elements not found!');
        return;
    }
    if (!domOutput || !domOutputCopy || !domOutputContent) {
        alert('Initial DOM output-elements not found!');
        return;
    }
    if (!domInput || !domInputs || !domInputSend) {
        alert('Initial DOM input-elements not found!');
        return;
    }
    if (!domBackdrop) {
        alert('Initial backdrop missing!');
        return;
    }

    domBackdrop.style.display = '';

    /** @type {ClientApp} */
    const app = {
        output: '',
        input: null,
        pidUrl: null,
        pidUpdater: null,
        commandUrls: new Set(),
        heldButtons: new Map(),
        commandMap: new Map(),
        tasks: new Map(),
        config: readStorage(),
        showProcess: (commandUrl, pid) => {
            releaseAll(app);
            domInput.close();
            window.open(getPidViewerUrl(commandUrl, pid), '_blank');
        },
        showOutput: output => {
            releaseAll(app);
            app.output = output;
            domOutputContent.innerText = output;
            domInput.close();
            domOutput.showModal();
        },
        showInput: button => {
            releaseAll(app);
            app.input = button;
            clearDom(domInputs);
            domInputs.appendChild(renderInput(app, button));
            domOutput.close();
            domInput.showModal();
        },
        showErrorModal: (text, maybeError) => {
            releaseAll(app);
            const error = maybeError instanceof Error ? maybeError : null;
            alert('ERROR: ' + text + (error ? `\n\n${error.message}` : ''));
        },
        updateTaskList: () => {
            clearDom(domTaskList);
            for(const task of renderTasks(app)) {
                domTaskList.appendChild(task);
            }
        },
        onError: error => {
            if (typeof error === 'string' || error instanceof Error) {
                domErrors.prepend(makeError(error));
            }
        }
    };

    /**
     * Updates the UI any time it needs to be updated.
     * @param {PanelConfig|null} newConfig the configuration to write
     * @param {boolean} [isUpdate] true only if this is not the initial update
     */
    const updateUi = (newConfig, isUpdate = false) => {
        if (newConfig) {
            app.config = newConfig;
            const getJson = () => JSON.stringify(app.config, null, '    ');
            const json = doTry(getJson).value || '';
            if (isUpdate) {
                doTry(() => window.localStorage.setItem(configKey, json));
            }
            const data = new Blob([json], { type: 'octet/stream' });
            domExport.href = window.URL.createObjectURL(data);
        }

        const hashText = window.location.hash.replace(/^#/, '');
        const hashParams = new URLSearchParams(hashText);
        app.pidUrl = hashParams.get('pidUrl');
        document.body.classList.toggle('is-process', !!app.pidUrl);

        app.pidUpdater?.abort();
        releaseAll(app);
        app.input = null;
        clearDom(domInputs);
        clearDom(domRoot);
        app.commandUrls.clear();

        if (app.pidUrl) {
            domRoot.appendChild(renderProcess(app));
        } else {
            domRoot.appendChild(renderPanel(app, app.config.root));
            refreshTasks(app);
        }
    };

    updateUi(app.config);

    // Event Handling
    domImport.addEventListener('change', async () => {
        const file = domImport.files?.item(0);
        const textJs = file ? await file.text() : 'null';
        const textJson = textJs.replace(jsToJson, '');
        domImport.value = '';

        /** @type {Result<unknown, Json>} */
        const json = doTry(() => JSON.parse(textJson));
        if (!json.value || typeof json.value !== 'object') {
            app.showErrorModal('Config is not valid JSON.', json.error);
            return;
        }

        const panelConfig = doTry(() => isPanelConfig({ value: json.value }));
        if (!panelConfig.value) {
            const message = 'Config is not correctly structured/typed.';
            app.showErrorModal(message, panelConfig.error);
            return;
        }

        updateUi(panelConfig.value, true);
    });

    domOutputCopy.addEventListener('click', async () => {
        const item = new ClipboardItem({ 'text/plain': app.output });
        await navigator.clipboard.write([item]).catch(() => null);
    });

    domInput.addEventListener('change', e => updateInput(app, e));
    domInput.addEventListener('input', e => updateInput(app, e));
    domInputSend.addEventListener('pointerdown', e => {
        onPress(app, app.input, false, e);
    });
    domInputSend.addEventListener('pointerup', () => {
        onRelease(app, app.input)
    });
    domInputSend.addEventListener('pointercancel', () => {
        onRelease(app, app.input);
    });

    document.body.addEventListener('click', ev => {
        const target = ev.target instanceof HTMLElement ? ev.target : null;
        const closeBtn = target?.closest('.overlay-close');
        const closeTarget = closeBtn?.closest('dialog');

        if (ev.target instanceof HTMLDialogElement) {
            ev.target.close();
        } else if (closeBtn && closeTarget) {
            cast(closeTarget, HTMLDialogElement)?.close();
        }
    });
};

main().catch(e => { throw e; });

if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./cache-worker.js', { scope: './' });
}
