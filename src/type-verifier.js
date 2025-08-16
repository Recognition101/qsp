/**
 * @typedef {import('../types').PanelConfig} PanelConfig
 * @typedef {import('../types').Panel} Panel
 * @typedef {import('../types').PanelButton} PanelButton
 * @typedef {import('../types').HttpCallRequest} HttpCallRequest
 * @typedef {import('../types').QspServerConfig} QspServerConfig
 * @typedef {import('../types').QspServerConfigCommand} QspServerConfigCommand
 * @typedef {import('../types').QspServerConfigSlot} QspServerConfigSlot
 * @typedef {import('../types').CommandRequest} CommandRequest
 * @typedef {import('../types').CommandSchema} CommandSchema
 * @typedef {import('../types').ArgumentSchema} ArgumentSchema
 * @typedef {import('../types').Task} Task
 * @typedef {import('../types').TaskResults} TaskResults
 * @typedef {import('../types').TaskListing} TaskListing
 * @typedef {import('../types').ErrorResponse} ErrorResponse
 * @typedef {import('../types').IsContext} IsContext
 */
/**
 * @template T
 * @typedef {import('../types').IsA<T>} IsA
 */

/**
 * A Type-Verification Error, describing the failure to verify a particular
 * piece of data as a particular type during runtime.
 */
export class TvError extends Error {
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
export const isIn = (c, key) => {
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
export const isConstant = x => c => {
    if (c.value !== x) { throw new TvError(c, '' + x); }
    return c.value;
};

/** @type {IsA<boolean>} */
export const isBoolean = (c) => {
    if (typeof c.value !== 'boolean') { throw new TvError(c, 'boolean'); }
    return c.value;
};

/** @type {IsA<string>} */
export const isString = c => {
    if (typeof c.value !== 'string') { throw new TvError(c, 'string'); }
    return c.value;
};

/** @type {IsA<number>} */
export const isNumber = c => {
    if (typeof c.value !== 'number') { throw new TvError(c, 'number'); }
    return c.value;
};

export const isNull = isConstant(null);
export const isUndefined = isConstant(undefined);

/**
 * Creates an object-checker whose values are checked by a given checker.
 * @template T the type of the children
 * @param {IsA<T>} fn the child checker
 * @return {IsA<{[key: string]: T}>} the new array checker
 */
export const isObjectMap = fn => c => {
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
export const isArrayOf = fn => c => {
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
export const isOneOf = (...list) => c => {
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
export const isMaybe = fn => isOneOf(fn, isUndefined);

/**
 * Creates a checker for something that is either T or T[].
 * @template T the type of item to check
 * @param {IsA<T>} fn the item checker
 * @return {IsA<T | T[]>} the maybe array checker
 */
export const isMaybeArray = fn => isOneOf(isArrayOf(fn), fn);

/** @type {IsA<ErrorResponse>} */
export const isErrorResponse = c => ({
    status: isConstant(/** @type {const} */('error')) (isIn(c, 'status')),
    message: isString (isIn(c, 'message')),
    type: isOneOf(
        isConstant(/** @type {const} */('command-name')),
        isConstant(/** @type {const} */('command-json')),
        isConstant(/** @type {const} */('command-bin')),
        isConstant(/** @type {const} */('task-pid')),
        isConstant(/** @type {const} */('proxy-json')),
        isConstant(/** @type {const} */('proxy-response'))
    ) (isIn(c, 'type'))
});

/** @type {IsA<TaskListing>} */
export const isTaskListing = c => ({
    pid: isString (isIn(c, 'pid')),
    request: isCommandRequest (isIn(c, 'request'))
});

/** @type {IsA<TaskResults>} */
export const isTaskResults = c => ({
    out: isString (isIn(c, 'out')),
    error: isString (isIn(c, 'error')),
    timeStart: isNumber (isIn(c, 'timeStart')),
    timeEnd: isOneOf(isNull, isNumber) (isIn(c, 'timeEnd')),
    code: isOneOf(isNull, isNumber) (isIn(c, 'code')),
});

/** @type {IsA<Task>} */
export const isTask = c => ({
    pid: isString (isIn(c, 'pid')),
    request: isCommandRequest (isIn(c, 'request')),
    results: isTaskResults (isIn(c, 'results'))
});

/** @type {IsA<ArgumentSchema>} */
export const isArgumentSchema = c => ({
    key: isString (isIn(c, 'key')),
    info: isString (isIn(c, 'info')),
    values: isMaybe(isArrayOf(isString)) (isIn(c, 'values'))
});

/** @type {IsA<CommandSchema>} */
export const isCommandSchema = c => ({
    name: isString (isIn(c, 'name')),
    arguments: isMaybe(isArrayOf(isArgumentSchema)) (isIn(c, 'arguments'))
});

/** @type {IsA<CommandRequest>} */
export const isCommandRequest = c => ({
    name: isString (isIn(c, 'name')),
    arguments: isObjectMap(isString) (isIn(c, 'arguments')),
    isPersisted: isMaybe(isBoolean) (isIn(c, 'isPersisted')),
});

/** @type {IsA<QspServerConfigSlot>} */
export const isQspServerConfigSlot = c => ({ key: isString (isIn(c, 'key')) });

/** @type {IsA<QspServerConfigCommand>} */
export const isQspServerConfigCommand = c => ({
    name: isString (isIn(c, 'name')),
    arguments: isMaybe(isArrayOf(isArgumentSchema)) (isIn(c, 'arguments')),
    cwd: isMaybe(isString) (isIn(c, 'cwd')),
    runner: isArrayOf(isMaybeArray(isOneOf(isString, isQspServerConfigSlot)))
        (isIn(c, 'runner'))
});

/** @type {IsA<QspServerConfig>} */
export const isQspServerConfig = c => ({
    commands: isMaybe(isArrayOf(isQspServerConfigCommand))(isIn(c, 'commands'))
});

/** @type {IsA<HttpCallRequest>} */
export const isHttpCallRequest = c => ({
    method: isString(isIn(c, 'method')),
    url: isString(isIn(c, 'url')),
    headers: isMaybe(isObjectMap(isString))(isIn(c, 'headers')),
    body: isMaybe(isString)(isIn(c, 'body')),
    mode: isMaybe(isString)(isIn(c, 'mode'))
});

/** @type {IsA<PanelButton>} */
export const isPanelButton = c => ({
    text: isString (isIn(c, 'text')),
    is: isMaybe(isString) (isIn(c, 'is')),
    set: isMaybe(isObjectMap(isString)) (isIn(c, 'set')),
    setList: isMaybe(isArrayOf(isString)) (isIn(c, 'setList')),
    arguments: isMaybe(isArrayOf(isArgumentSchema)) (isIn(c, 'arguments')),
    proxyUrl: isMaybe(isString) (isIn(c, 'proxyUrl')),
    repeat: isMaybe(isNumber) (isIn(c, 'repeat')),
    repeatInitial: isMaybe(isNumber) (isIn(c, 'repeatInitial')),
    column: isMaybe(isNumber) (isIn(c, 'column')),
    showOutput: isMaybe(isBoolean) (isIn(c, 'showOutput')),
    request: isMaybe(isHttpCallRequest) (isIn(c, 'request')),
    command: isMaybe(isString) (isIn(c, 'command')),
    commandUrl: isMaybe(isString) (isIn(c, 'commandUrl')),
    isPersisted: isMaybe(isBoolean)  (isIn(c, 'isPersisted'))
});

/** @type {IsA<Panel>} */
export const isPanel = c => ({
    title: isString (isIn(c, 'title')),
    buttons: isMaybe(isArrayOf(isPanelButton)) (isIn(c, 'buttons')),
    children: isMaybe(isArrayOf(isPanel)) (isIn(c, 'children'))
});

/** @type {IsA<PanelConfig>} */
export const isPanelConfig = c => ({
    templates: isMaybe(isObjectMap(isPanelButton)) (isIn(c, 'templates')),
    root: isPanel (isIn(c, 'root'))
});
