// Generic (Non-Application Specific) Helper Functions

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
 * @param {T} tag the tag name of the result element
 * @param {import('../types').HtmlOptions<T, HTMLElement>} [options]
 *  a list of attribute objects and children to append to the element
 * @return {HTMLElementTagNameMap[T]} the resulting HTML DOM element
 */
export const h = (tag, options) => {
    const el = document.createElement(tag);
    for (const child of options instanceof Array ? options : [options]) {
        const isText = typeof child === "string";
        if (isText || child instanceof Element) {
            el.appendChild(isText ? document.createTextNode(child) : child);
        } else if (child) {
            setAttributes(el, child);
        }
    }
    return el;
};

/**
 * Sets a given set of HTML attributes to specified values on a given element.
 * @template {keyof HTMLElementTagNameMap} T the tag name of the result element
 * @param {HTMLElementTagNameMap[T]} el the element to set attributes on
 * @param {import("../types").HtmlAttributeSet<T, HTMLElement>} attributes
 *  a map of attribute keys to their values to set on `el`
 */
const setAttributes = (el, attributes) => {
    for (const key in attributes) {
        const value = /** @type {any} */ (attributes)[key];
        const hasValue = value || value === "" || value === 0;

        if (key.startsWith("on") && value) {
            el.addEventListener(key.slice(2).toLowerCase(), value);
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
