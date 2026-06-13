import test from 'node:test';
import assert from 'node:assert/strict';
import { createDiff, invertDiff, applyDiff } from '../../src/builder-core/diff.js';
import { FakeWorld } from '../../src/builder-core/world_adapters/fake_world.js';

test('createDiff ignores unchanged blocks and normalizes air', () => {
    const diff = createDiff({
        reason: 'replace wall blocks',
        before: [
            { pos: [0, 0, 0], block: 'stone' },
            { pos: [1, 0, 0], block: null },
            { pos: [2, 0, 0], block: 'glass' },
            { pos: [3, 0, 0], block: 'oak_planks' },
        ],
        after: [
            { pos: [0, 0, 0], block: 'stone' },
            { pos: [1, 0, 0], block: '' },
            { pos: [2, 0, 0], block: undefined },
            { pos: [3, 0, 0], block: ' oak_planks ' },
        ],
    });

    assert.ok(diff.id);
    assert.equal(diff.reason, 'replace wall blocks');
    assert.deepEqual(diff.changes, [
        { pos: [2, 0, 0], before: 'glass', after: 'air' },
    ]);
});

test('applyDiff mutates FakeWorld as expected', () => {
    const world = new FakeWorld([
        { pos: [0, 0, 0], block: 'stone' },
        { pos: [1, 0, 0], block: 'dirt' },
    ]);
    const diff = createDiff({
        reason: 'apply wall edit',
        before: world.getAllBlocks(),
        after: [
            { pos: [0, 0, 0], block: 'stone_bricks' },
            { pos: [2, 0, 0], block: 'glass' },
        ],
    });

    const applied = applyDiff(world, diff);

    assert.deepEqual(applied, diff.changes);
    assert.deepEqual(world.getAllBlocks(), [
        { pos: [0, 0, 0], block: 'stone_bricks' },
        { pos: [2, 0, 0], block: 'glass' },
    ]);
});

test('invertDiff can undo an applied diff', () => {
    const world = new FakeWorld([
        { pos: [0, 0, 0], block: 'stone' },
        { pos: [1, 0, 0], block: 'dirt' },
    ]);
    const originalBlocks = world.getAllBlocks();
    const diff = createDiff({
        reason: 'replace floor',
        before: originalBlocks,
        after: [
            { pos: [0, 0, 0], block: 'stone_bricks' },
            { pos: [2, 0, 0], block: 'glass' },
        ],
    });

    applyDiff(world, diff);
    const undoDiff = invertDiff(diff);
    const undone = applyDiff(world, undoDiff);

    assert.equal(undoDiff.reason, 'undo');
    assert.deepEqual(undone, undoDiff.changes);
    assert.deepEqual(world.getAllBlocks(), originalBlocks);
});

test('change order is deterministic', () => {
    const first = createDiff({
        reason: 'ordered edit',
        before: [
            { pos: [10, 0, 0], block: 'stone' },
            { pos: [2, 0, 0], block: 'stone' },
            { pos: [1, 0, 0], block: 'stone' },
        ],
        after: [
            { pos: [1, 0, 0], block: 'glass' },
            { pos: [10, 0, 0], block: 'glass' },
            { pos: [2, 0, 0], block: 'glass' },
        ],
    });
    const second = createDiff({
        reason: 'ordered edit',
        before: [
            { pos: [1, 0, 0], block: 'stone' },
            { pos: [10, 0, 0], block: 'stone' },
            { pos: [2, 0, 0], block: 'stone' },
        ],
        after: [
            { pos: [2, 0, 0], block: 'glass' },
            { pos: [1, 0, 0], block: 'glass' },
            { pos: [10, 0, 0], block: 'glass' },
        ],
    });

    assert.deepEqual(first.changes.map((change) => change.pos), [
        [1, 0, 0],
        [10, 0, 0],
        [2, 0, 0],
    ]);
    assert.deepEqual(second.changes, first.changes);
    assert.deepEqual(invertDiff(first).changes.map((change) => change.pos), [
        [1, 0, 0],
        [10, 0, 0],
        [2, 0, 0],
    ]);
});
