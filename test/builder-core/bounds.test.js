import test from 'node:test';
import assert from 'node:assert/strict';
import {
    boundsFromStates,
    eachPosInBounds,
    expandBounds,
    normalizeBounds,
} from '../../src/builder-core/bounds.js';

test('normalizeBounds sorts min and max coordinates', () => {
    assert.deepEqual(normalizeBounds({ min: [3, 5, 1], max: [1, 2, 9] }), {
        min: [1, 2, 1],
        max: [3, 5, 9],
    });
});

test('eachPosInBounds returns positions in deterministic y z x order', () => {
    assert.deepEqual([...eachPosInBounds({ min: [0, 0, 0], max: [1, 1, 0] })], [
        [0, 0, 0],
        [1, 0, 0],
        [0, 1, 0],
        [1, 1, 0],
    ]);
});

test('boundsFromStates computes tight bounds and expandBounds pads them', () => {
    const bounds = boundsFromStates([
        { pos: [2, 4, 6], block: 'stone' },
        { pos: [5, 1, 7], block: 'glass' },
    ]);

    assert.deepEqual(bounds, {
        min: [2, 1, 6],
        max: [5, 4, 7],
    });
    assert.deepEqual(expandBounds(bounds, 1), {
        min: [1, 0, 5],
        max: [6, 5, 8],
    });
});
