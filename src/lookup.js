import { number, string } from './lib.js';

/**
 * @typedef {import('../types').ClientApp} ClientApp
 * @typedef {import('../types').PanelButton} PanelButton
 */
 
/**
 * Looks up a value in the properties of a given button.
 * @template {keyof PanelButton} K the type of the key to read
 * @overload
 * @param {ClientApp} app the application orchestration global
 * @param {PanelButton|undefined|null} button the button to look within
 * @param {K} key the property name to read from `button`
 * @param {null} [setKey] this property is unused in this overload.
 * @param {boolean} [isLookup] if `true`, do not expand the result
 * @param {Set<string|number>} [seen] tokens seen in previous `expand` calls
 * @return {PanelButton[K]|null} the value from `button` or a parent
 */
/**
 * Looks up a value in the `set` or `setList` of a button.
 * @overload
 * @param {ClientApp} app the application orchestration global
 * @param {PanelButton|undefined|null} button the button to look within
 * @param {null} key this property is unused (must be `null`) in this overload
 * @param {string|number} setKey the `set` or `setList` key to read
 * @param {boolean} [isLookup] if `true`, do not expand the result
 * @param {Set<string|number>} [seen] tokens seen in previous `expand` calls
 * @return {string|null} the value from `button` or a parent
 */
/**
 * Looks up a value in the properties, `set`, or `setList` of a button.
 * @param {ClientApp} app the application orchestration global
 * @param {PanelButton|undefined|null} button the button to look within
 * @param {K|null} key the property name to read from `button`
 * @param {string|number|null} setKey the `set` or `setList` key to read
 * @param {boolean} [isLookup] if `true`, do not expand the result
 * @param {Set<string|number>} [seen] tokens seen in previous `expand` calls
 * @return {PanelButton[K]|string|null} the value from `button` or a parent
 */
export const lookup = (app, button, key, setKey = null, isLookup, seen) => {
    const templates = app.config.templates;
    const parent = button?.is ? (templates?.[button.is] ?? null) : null;

    const fromButton = button && key !== null && setKey === null;
    const fromList = button && key === null && typeof setKey === 'number';
    const fromMap = button && key === null && typeof setKey === 'string';
    const fromSet = fromList || fromMap;

    const setValue = (fromMap ? button.set?.[setKey] : null)
        ?? (fromList ? button.setList?.[setKey] : null)
        ?? (fromSet ? lookup(app, parent, null, setKey, true, seen) : null)
        ?? (fromSet ? (app.setGlobals[setKey] ?? null) : null);
    const result = fromButton
        ? (button[key] ?? lookup(app, parent, key, null, true, seen))
        : setValue;

    return !isLookup && typeof result === 'string'
        ? expand(app, button, result, seen ?? (new Set([setKey ?? ''])))
        : result;
};

/**
 * @param {ClientApp} app the application orchestration global
 * @param {PanelButton|null|undefined} button the context to expand within
 * @param {string} text the text to expand
 * @param {Set<string|number>} [seen] an optional set of ignored tokens
 * @return {string} the expanded string
 */
export const expand = (app, button, text, seen = new Set()) => {
    const getTokens = /\$(\\+)?\{((?:(\w+):)?(\w+))\}/g;
    return text.replaceAll(getTokens, (match, slash, mBody, mFn, mKey) => {
        const body = string(mBody) ?? '';
        const key = number(Number(mKey)) ?? string(mKey) ?? '';

        if (typeof slash === 'string' && slash.length > 0) {
            return `$${slash.substring(1)}{${body}}`;
        }
        if (seen.has(key)) {
            return string(match) ?? '';
        }

        seen.add(key);
        const value = lookup(app, button, null, key, false, seen);
        seen.delete(key);

        if (value && mFn === 'urlencode') {
            return encodeURIComponent(value);
        } else if (value && mFn === 'jsonString') {
            return JSON.stringify(value);
        }
        return value ?? string(match) ?? '';
    });
};
