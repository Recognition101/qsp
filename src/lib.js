// Generic (Non-Application Specific) Helper Functions

/**
 * @typedef {import('../types').DomApp} DomApp
 * @typedef {import('../types').EventLike} EventLike
 * @typedef {import('../types').HtmlUnknownHandler} HtmlUnknownHandler
 */
/**
 * @template {keyof HTMLElementTagNameMap} T
 * @typedef {import('../types').HtmlHandler<T>} HtmlHandler
 */
/**
 * @template E
 * @template T
 * @typedef {import('../types').Result<E, T>} Result
 */

/**
 * Returns a given variable iff it is a string (otherwise returns null).
 * @param {any} x the variable to check
 * @return {string|null} `x`, or null if `x` is not a string
 */
export const string = x => typeof x === 'string' ? x : null;

/**
 * Returns a given variable iff it is a non-NaN number (otherwise null).
 * @param {any} x the variable to check
 * @return {number|null} `x`, or null if `x` is not a number or NaN
 */
export const number = x => typeof x === 'number' && !isNaN(x) ? x : null;

/**
 * Finds elements within a given root that match a given selector
 * @param {string} s find all elements within `e` that match this selector
 * @param {HTMLElement} [e] the root element to search within
 * @return {HTMLElement[]} the elements that matched `s` within `e`
 */
export const select = (s, e=document.body) =>
    Array.from(e.querySelectorAll(s));

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
 * Given a number and some bounds, returns that number either wrapped to fit
 * within those bounds or clamped within those bounds.
 * @param {number} x the number to keep within the bounds
 * @param {number} min the minimum value the result can be
 * @param {number} max the maximum value the result can be
 * @param {boolean} [wrap] if true, wrap the value, otherwise clamp it
 */
export const clamp = (x, min, max, wrap) => {
    const offsetX = (x - min) % (max + 1 - min);
    return (wrap
        ? (offsetX < 0 ? max + 1 : min) + offsetX
        : Math.max(min, Math.min(max, x)));
};

/**
 * Joins strings unless any of them are null/undefined.
 * @param {...(string|boolean|number|undefined|null)} args the items to concat
 */
export const join = (...args) =>
    args.includes(null) || args.includes(undefined) ? '' : args.join('')

/**
 * Creates a promise that resolves after a timeout.
 * @param {number} time the time (in ms) to wait
 * @return {Promise<void>} a promise that resolves after waiting
 */
export const wait = (time) =>
    new Promise(yes => { window.setTimeout(() => yes(), time); });

/** @type {{[key: string]: string}} */
const attributeMap = {
    ariaLabel: "aria-label",
    ariaHidden: "aria-hidden",
    ariaChecked: "aria-checked",
    htmlFor: "for"
};

/**
 * Creates an HTML element with optional attributes/children.
 * @template {keyof HTMLElementTagNameMap} T the tag name of the result element
 * @param {DomApp} app global options for the creation of elements
 * @param {T} tag the tag name of the result element
 * @param {import('../types').HtmlOptions<T, HTMLElement>} [options]
 *  a list of attribute objects and children to append to the element
 * @return {HTMLElementTagNameMap[T]} the resulting HTML DOM element
 */
export const h = (app, tag, options) => {
    const el = document.createElement(tag);
    for (const child of options instanceof Array ? options : [options]) {
        const isText = typeof child === "string";
        if (isText || child instanceof Element) {
            el.appendChild(isText ? document.createTextNode(child) : child);
        } else if (child) {
            setAttributes(app, el, child);
        }
    }
    return el;
};

/**
 * Sets a given set of HTML attributes to specified values on a given element.
 * @template {keyof HTMLElementTagNameMap} T the tag name of the result element
 * @param {DomApp} app global options for the creation of elements
 * @param {HTMLElementTagNameMap[T]} el the element to set attributes on
 * @param {import("../types").HtmlAttributeSet<T, HTMLElement>} attributes
 *  a map of attribute keys to their values to set on `el`
 */
const setAttributes = (app, el, attributes) => {
    for (const key in attributes) {
        const value = /** @type {any} */ (attributes)[key];
        const hasValue = value || value === "" || value === 0;

        if (key.startsWith("on") && value) {
            addEventListener(app, el, key, value);
        } else if (key === "style" && attributes.style) {
            Object.assign(el.style, attributes.style);
        } else if (key === "classList" && attributes.classList) {
            for (const className of attributes.classList) {
                if (className) {
                    el.classList.add(className);
                }
            }
        } else if (key === "dataset" && attributes.dataset) {
            for (const dataKey in attributes.dataset) {
                el.setAttribute("data-" + dataKey, attributes.dataset[dataKey]);
            }
        } else if (key === "className" && hasValue) {
            el.className = String(value);
        } else if (key in attributeMap && hasValue) {
            el.setAttribute(attributeMap[key], String(value));
        } else if (key && key !== "locale" && hasValue) {
            el.setAttribute(key, String(value));
        }
    }
};

/**
 * @template {keyof HTMLElementTagNameMap} T the tag name of the result element
 * @param {DomApp} app global options for the creation of elements
 * @param {HTMLElementTagNameMap[T]} el the element to set attributes on
 * @param {string} evKey an event type key, ex: `onPointerdown`, `onclick`
 * @param {HtmlHandler<T>} callback the fn to call
 */
export const addEventListener = (app, el, evKey, callback) => {
    const evTypeInfo = evKey.toLowerCase().match(/^(?:on)?(global)?(.*)$/);
    const isGlobal = !!evTypeInfo?.[1];
    const evType = evTypeInfo?.[2];
    if (!evType) {
        return;
    }

    /** @type {Map<string, HtmlHandler<keyof HTMLElementTagNameMap>[]>} */
    const handlerMap = app.handlers.get(el) ?? new Map();
    const handlerList = handlerMap.get(evType) ?? [];
    handlerList.push(/** @type {any} */(callback));
    handlerMap.set(evType, handlerList);
    app.handlers.set(el, handlerMap);

    const listener = app.listeners.get(evType);
    if ((!isGlobal && !listener) || (isGlobal && !listener?.isGlobal)) {
        if (listener) {
            const oldTarget = listener.isGlobal ? window : document.body;
            oldTarget.removeEventListener(evType, listener.callback);
        }
        const callback = delegate.bind(null, app);
        const target = isGlobal ? window : document.body;
        target.addEventListener(evType, callback);
        app.listeners.set(evType, { isGlobal, callback });
    }
};

/**
 * Delegates events to their callbacks, as indicated by a `DomApp`.
 * @param {DomApp} app the map of callbacks to call per element
 * @param {EventLike} ev the event that fired
 */
const delegate = (app, ev) => {
    if (ev.target instanceof HTMLElement) {
        let target = /** @type {HTMLElement|null} */(ev.target);
        while(target) {
            const handlerMap = app.handlers.get(target);
            for(const handler of handlerMap?.get(ev.type) ?? []) {
                handler(ev, target);
            }
            target = target.parentElement;
        }
    }
};
