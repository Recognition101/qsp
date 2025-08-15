import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
    isOneOf,
    isArrayOf,
    isObjectMap,
    isBoolean,
    isString,
    isNumber,
    isNull,
    isUndefined,
    isConstant,
    isIn,
    TvError
} from '../src/type-verifier.js';

/**
 * @typedef {Object} TestSimple
 * @prop {number} x
 *
 * @typedef {Object} TestA
 * @prop {'a'} type
 * @prop {number} x
 *
 * @typedef {Object} TestB
 * @prop {'b'} type
 * @prop {number} x
 *
 * @typedef {Object} TestC
 * @prop {'c'} type
 * @prop {string} x
 */
/**
 * @template T
 * @typedef {import('../types').IsA<T>} IsA
 */

/**
 * @template {Function} T the type of function to run
 * @param {T} fn the function to run
 * @return {ReturnType<T>|TvError|null} the returned value
 */
const tryTest = fn => {
    try {
        return fn();
    } catch(e) {
        if (e instanceof TvError) {
            return e;
        }
    }
    return null;
};

describe('lookup, without expand', () => {
    it('should verify primitives', () => {
        const null1 = tryTest(() => isNull({ value: null }));
        const null2 = tryTest(() => isNull({ value: 'hi' }));
        assert.strictEqual(null1, null);
        assert.strictEqual(null2 instanceof TvError, true);
        if (null2 instanceof TvError) {
            assert.strictEqual(null2.key, '');
            assert.strictEqual(null2.expected, 'null');
            assert.strictEqual(null2.observed, 'hi');
        }

        const undefined1 = tryTest(() => isUndefined({ value: undefined }));
        const undefined2 = tryTest(() => isUndefined({ value: 'hi' }));
        assert.strictEqual(undefined1, undefined);
        assert.strictEqual(undefined2 instanceof TvError, true);
        if (undefined2 instanceof TvError) {
            assert.strictEqual(undefined2.key, '');
            assert.strictEqual(undefined2.expected, 'undefined');
            assert.strictEqual(undefined2.observed, 'hi');
        }
        
        const bool1 = tryTest(() => isBoolean({ value: true }));
        const bool2 = tryTest(() => isBoolean({ value: false }));
        const bool3 = tryTest(() => isBoolean({ value: 5 }));
        assert.strictEqual(bool1, true);
        assert.strictEqual(bool2, false);
        assert.strictEqual(bool3 instanceof TvError, true);
        if (bool3 instanceof TvError) {
            assert.strictEqual(bool3.key, '');
            assert.strictEqual(bool3.expected, 'boolean');
            assert.strictEqual(bool3.observed, 5);
        }

        const number0 = tryTest(() => isNumber({ value: 0 }));
        const number1 = tryTest(() => isNumber({ value: 1 }));
        const number2 = tryTest(() => isNumber({ value: NaN }));
        const number3 = tryTest(() => isNumber({ value: true }));
        assert.strictEqual(number0, 0);
        assert.strictEqual(number1, 1);
        assert.strictEqual(number2, NaN);
        assert.strictEqual(number3 instanceof TvError, true);
        if (number3 instanceof TvError) {
            assert.strictEqual(number3.key, '');
            assert.strictEqual(number3.expected, 'number');
            assert.strictEqual(number3.observed, true);
        }

        const string1 = tryTest(() => isString({ value: '' }));
        const string2 = tryTest(() => isString({ value: 's' }));
        const string3 = tryTest(() => isString({ value: 900 }));
        assert.strictEqual(string1, '');
        assert.strictEqual(string2, 's');
        assert.strictEqual(string3 instanceof TvError, true);
        if (string3 instanceof TvError) {
            assert.strictEqual(string3.key, '');
            assert.strictEqual(string3.expected, 'string');
            assert.strictEqual(string3.observed, 900);
        }
    });

    it('glues keys together correctly', () => {
        const data = { z: [{ a: [1, 2] }, { b: [3, 4] }, { c: [5, 'six'] }] };

        const result = tryTest(() =>
            isObjectMap(isArrayOf(isObjectMap(isArrayOf(isNumber))))
                ({ value: data })
        );

        assert.strictEqual(result instanceof TvError, true);
        if (result instanceof TvError) {
            assert.strictEqual(result.key, 'z[2].c[1]');
            assert.strictEqual(result.expected, 'number');
            assert.strictEqual(result.observed, 'six');
        }

        /** @type {IsA<TestSimple>} */
        const isSimple = c => ({ x: isNumber(isIn(c, 'x')) })
        const result2 = tryTest(() => isSimple({ value: { x: 'hi' } }));
        assert.strictEqual(result2 instanceof TvError, true);
        if (result2 instanceof TvError) {
            assert.strictEqual(result2.key, 'x');
            assert.strictEqual(result2.expected, 'number');
            assert.strictEqual(result2.observed, 'hi');
        }
    });

    it('should properly run isOneOf', () => {
        const isNumberString = isOneOf(isNumber, isString);

        /** @type {IsA<TestA>} */
        const isTestA = c => ({
            type: isConstant(/** @type {const} */('a'))(isIn(c, 'type')),
            x: isNumber(isIn(c, 'x'))
        });
        /** @type {IsA<TestB>} */
        const isTestB = c => ({
            type: isConstant(/** @type {const} */('b'))(isIn(c, 'type')),
            x: isNumber(isIn(c, 'x'))
        });
        /** @type {IsA<TestC>} */
        const isTestC = c => ({
            type: isConstant(/** @type {const} */('c'))(isIn(c, 'type')),
            x: isString(isIn(c, 'x'))
        });

        const result1 = tryTest(() => isNumberString({ value: 5 }));
        const result2 = tryTest(() => isNumberString({ value: 'x' }));
        const result3 = tryTest(() => isNumberString({ value: true }));
        assert.strictEqual(result1, 5);
        assert.strictEqual(result2, 'x');
        assert.strictEqual(result3 instanceof TvError, true);
        if (result3 instanceof TvError) {
            assert.strictEqual(result3.expected, 'number | string');
            assert.strictEqual(result3.observed, true);
        }

        const result4 = tryTest(() => isOneOf(isTestA, isTestC)({
            value: { type: 'c', x: 'hello' }
        }));
        const result5 = tryTest(() => isOneOf(isTestA, isTestB)({
            value: { type: 'c', x: 5 }
        }));
        assert.deepStrictEqual(result4, {
            type: 'c',
            x: 'hello'
        });
        assert.strictEqual(result5 instanceof TvError, true);
        if (result5 instanceof TvError) {
            assert.strictEqual(
                result5.expected,
                '[At key-path `type`, expected `a` but was given `string` ' +
                    '(c).] | [At key-path `type`, expected `b` but was ' +
                    'given `string` (c).]'
            );
        }
    });
});

