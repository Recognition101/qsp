import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { lookup } from '../src/lookup.js';

/**
 * @typedef {import('../types').ClientApp} ClientApp
 * @typedef {import('../types').PanelButton} PanelButton
 * @typedef {import('../types').PanelConfig} PanelConfig
 */

/**
 * Makes an app shim.
 * @param {PanelConfig["templates"]} templates the templates
 * @return {ClientApp}
 */
const makeApp = (templates) => ({
    output: '',
    input: null,
    pidUrl: null,
    pidUpdater: null,
    heldButtons: new Map(),
    commandMap: new Map(),
    config: { templates, root: { title: 'test' } },

    showProcess: () => {},
    showOutput: () => {},
    showInput: () => {},
    showErrorModal: () => {},
    onError: () => {},
    // @ts-ignore
    h: () => {}
});

describe('lookup, without expand', () => {
    it('should handle simple property lookup', () => {
        const app = makeApp({});
        /** @type {PanelButton} */
        const button = {
            text: 'simple',
            proxyUrl: 'simple-url',
            request: { method: 'GET', url: 'a.b.c' },
            showOutput: true
        };

        assert.strictEqual(lookup(app, button, 'proxyUrl'), 'simple-url');
        assert.strictEqual(lookup(app, button, 'request'), button.request);
        assert.strictEqual(lookup(app, button, 'showOutput'), true);
        assert.strictEqual(lookup(app, button, 'command'), null);
    });

    it('should handle inherited property lookup', () => {
        const app = makeApp({
            a: {
                text: 'a',
                proxyUrl: 'a-url',
                command: 'a-command'
            },
            bA: {
                text: 'b',
                proxyUrl: 'bA-url',
                is: 'bB'
            },
            bB: {
                text: 'bB',
                proxyUrl: 'bB-url',
                command: 'bB-command'
            }
        });
        /** @type {PanelButton} */
        const buttonA = {
            text: 'isa',
            is: 'a',
            proxyUrl: 'isa-url'
        };

        /** @type {PanelButton} */
        const buttonB = {
            text: 'isb',
            is: 'bA'
        };

        assert.strictEqual(lookup(app, buttonA, 'proxyUrl'), 'isa-url');
        assert.strictEqual(lookup(app, buttonA, 'command'), 'a-command');
        assert.strictEqual(lookup(app, buttonA, 'repeat'), null);

        assert.strictEqual(lookup(app, buttonB, 'proxyUrl'), 'bA-url');
        assert.strictEqual(lookup(app, buttonB, 'command'), 'bB-command');
    });

    it('should handle simple set and set-list lookup', () => {
        const app = makeApp({});
        /** @type {PanelButton} */
        const button = {
            text: 's1',
            set: { 'a': 's1-a' },
            setList: ['x', 'y', 'z']
        };

        assert.strictEqual(lookup(app, button, null, 'a'), 's1-a');
        assert.strictEqual(lookup(app, button, null, 'z'), null);
        assert.strictEqual(lookup(app, button, null, 0), 'x');
        assert.strictEqual(lookup(app, button, null, 4), null);
    });

    it('should handle inherited set and set-list lookup', () => {
        const app = makeApp({
            a: {
                text: 'a',
                set: { 'a': 'a-a' },
                setList: ['a-0', 'a-1', 'a-2']
            },
            bA: {
                text: 'bA',
                is: 'bB',
                set: { 'a': 'bA-a' },
                setList: ['bA-0', 'bA-1']
            },
            bB: {
                text: 'bB',
                set: { 'a': 'bB-a', 'b': 'bB-b' },
                setList: ['bB-0', 'bB-1', 'bB-2']
            }
        });

        /** @type {PanelButton} */
        const buttonM1 = {
            text: 'main1',
            is: 'a',
            set: { 'z': 'main1-z' },
            setList: ['main1-0']
        };

        /** @type {PanelButton} */
        const buttonM2 = {
            text: 'main2',
            is: 'bA',
            set: { 'z': 'main2-z' },
            setList: ['main2-0']
        };

        assert.strictEqual(lookup(app, buttonM1, null, 'z'), 'main1-z');
        assert.strictEqual(lookup(app, buttonM1, null, 0), 'main1-0');
        assert.strictEqual(lookup(app, buttonM1, null, 'a'), 'a-a');
        assert.strictEqual(lookup(app, buttonM1, null, 1), 'a-1');

        assert.strictEqual(lookup(app, buttonM2, null, 'z'), 'main2-z');
        assert.strictEqual(lookup(app, buttonM2, null, 0), 'main2-0');
        assert.strictEqual(lookup(app, buttonM2, null, 'a'), 'bA-a');
        assert.strictEqual(lookup(app, buttonM2, null, 1), 'bA-1');
        assert.strictEqual(lookup(app, buttonM2, null, 'b'), 'bB-b');
        assert.strictEqual(lookup(app, buttonM2, null, 2), 'bB-2');
    });
});

describe('lookup, with expand', () => {
    it('should perform simple expansions', () => {
        const app = makeApp({});

        /** @type {PanelButton} */
        const buttonM1 = {
            text: 'main1',
            proxyUrl: 'hello ${z} ${0} ${a} ${4} $\\{z} $\\\\\\{0}',
            command: 't: ${urlencode:y}',
            set: {
                z: 'main1-z',
                y: 's s',
                x: ':${y}:',
                i: 'i: ${jsonString:j}',
                j: 'x"y'
            },
            setList: ['main1-0', ':${0}:']
        };

        assert.strictEqual(
            lookup(app, buttonM1, 'proxyUrl'),
            'hello main1-z main1-0 ${a} ${4} ${z} $\\\\{0}'
        );
        assert.strictEqual(lookup(app, buttonM1, null, 'i'), 'i: "x\\"y"');
        assert.strictEqual(lookup(app, buttonM1, 'command'), 't: s%20s');
        assert.strictEqual(lookup(app, buttonM1, null, 1), ':main1-0:');
        assert.strictEqual(lookup(app, buttonM1, null, 'x'), ':s s:');
    });

    it('should handle inherited expansions', () => {
        const app = makeApp({
            a: {
                text: 'a',
                is: 'b',
                set: { 'b': '[${y}]' },
                setList: ['a0', 'a1:${2}']
            },
            b: {
                text: 'b',
                set: { 'c': '{${b}}', 'd': '(${z})' },
                setList: ['b0', 'b1', 'b2:${z}']
            }
        });

        /** @type {PanelButton} */
        const buttonM1 = {
            text: 'main1',
            is: 'a',
            set: { 'x': '${y}-${b}-${c}-${d}', 'y': ':${z}:', 'z': '!' },
            setList: ['${z}-${1}-${2}']
        };

        assert.strictEqual(
            lookup(app, buttonM1, null, 'x'),
            ':!:-[:!:]-{[:!:]}-(!)'
        );
        assert.strictEqual(
            lookup(app, buttonM1, null, 0),
            '!-a1:b2:!-b2:!'
        );
    });

    it('should prevent infinite recursion', () => {
        const app = makeApp({
            a: {
                text: 'a',
                is: 'b',
                set: { 'a': 'a${y}a', 'aa': 'aa${b}aa' }
            },
            b: {
                text: 'b',
                set: { 'b': 'b${z}b' }
            }
        });

        /** @type {PanelButton} */
        const buttonM1 = {
            text: 'main1',
            is: 'a',
            proxyUrl: 'url:${z}',
            set: { 'x': 'x${x}x', 'y': 'y${a}y', 'z': 'z${aa}z' }
        };

        assert.strictEqual(lookup(app, buttonM1, null, 'x'), 'x${x}x');
        assert.strictEqual(lookup(app, buttonM1, null, 'y'), 'ya${y}ay');
        assert.strictEqual(lookup(app, buttonM1, null, 'z'), 'zaab${z}baaz');
        assert.strictEqual(
            lookup(app, buttonM1, 'proxyUrl'),
            'url:zaab${z}baaz'
        );
    });
});
