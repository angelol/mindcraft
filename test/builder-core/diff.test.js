import test from 'node:test';
import assert from 'node:assert/strict';
import { createDiff, applyDiff, invertDiff } from '../../src/builder-core/diff.js';
import { FakeWorld } from '../../src/builder-core/world_adapters/fake_world.js';

test('createDiff records before and after block states', () => {
    const world = new FakeWorld([
        { pos: [0, 0, 0], block: 'dirt' },
        { pos: [1, 0, 0], block: 'oak_planks' },
    ]);

    const diff = createDiff(world, [
        { pos: [0, 0, 0], block: 'stone' },
        { pos: [1, 0, 0], block: 'air' },
        { pos: [2, 0, 0], block: 'glass' },
    ], {
        editId: 'edit_001',
        summary: 'replace test blocks',
        targetPartIds: ['part_001'],
    });

    assert.deepEqual(diff, {
        editId: 'edit_001',
        summary: 'replace test blocks',
        targetPartIds: ['part_001'],
        before: [
            { pos: [0, 0, 0], block: 'dirt' },
            { pos: [1, 0, 0], block: 'oak_planks' },
            { pos: [2, 0, 0], block: 'air' },
        ],
        after: [
            { pos: [0, 0, 0], block: 'stone' },
            { pos: [1, 0, 0], block: 'air' },
            { pos: [2, 0, 0], block: 'glass' },
        ],
    });
});

test('applyDiff changes world blocks and invertDiff restores them', () => {
    const world = new FakeWorld([{ pos: [0, 0, 0], block: 'dirt' }]);
    const diff = createDiff(world, [
        { pos: [0, 0, 0], block: 'stone' },
        { pos: [1, 0, 0], block: 'glass' },
    ], {
        editId: 'edit_002',
        summary: 'apply test',
    });

    applyDiff(world, diff);

    assert.deepEqual(world.getAllBlocks(), [
        { pos: [0, 0, 0], block: 'stone' },
        { pos: [1, 0, 0], block: 'glass' },
    ]);

    applyDiff(world, invertDiff(diff));

    assert.deepEqual(world.getAllBlocks(), [
        { pos: [0, 0, 0], block: 'dirt' },
    ]);
});

test('createDiff collapses duplicate positions and normalizes air', () => {
    const world = new FakeWorld([
        { pos: [0, 0, 0], block: 'dirt' },
        { pos: [1, 0, 0], block: 'stone' },
    ]);

    const diff = createDiff(world, [
        { pos: [0, 0, 0], block: 'stone' },
        { pos: ['0', 0.9, 0], block: 'glass' },
        { pos: [1, 0, 0], block: '   ' },
    ], {
        editId: 'edit_003',
    });

    assert.deepEqual(diff.before, [
        { pos: [0, 0, 0], block: 'dirt' },
        { pos: [1, 0, 0], block: 'stone' },
    ]);
    assert.deepEqual(diff.after, [
        { pos: [0, 0, 0], block: 'glass' },
        { pos: [1, 0, 0], block: 'air' },
    ]);
});

test('createDiff sorts unique target changes deterministically', () => {
    const world = new FakeWorld();
    const first = createDiff(world, [
        { pos: [10, 0, 0], block: 'stone' },
        { pos: [2, 0, 0], block: 'glass' },
        { pos: [1, 0, 0], block: 'oak_planks' },
    ], {
        editId: 'edit_004',
    });
    const second = createDiff(world, [
        { pos: [1, 0, 0], block: 'oak_planks' },
        { pos: [10, 0, 0], block: 'stone' },
        { pos: [2, 0, 0], block: 'glass' },
    ], {
        editId: 'edit_004',
    });

    assert.deepEqual(first.after.map((state) => state.pos), [
        [1, 0, 0],
        [10, 0, 0],
        [2, 0, 0],
    ]);
    assert.deepEqual(second, first);
});

test('applyDiff applies a selected side and rejects invalid sides', () => {
    const world = new FakeWorld([{ pos: [0, 0, 0], block: 'dirt' }]);
    const diff = createDiff(world, [
        { pos: [0, 0, 0], block: 'stone' },
    ], {
        editId: 'edit_005',
    });

    applyDiff(world, diff);
    applyDiff(world, diff, 'before');

    assert.deepEqual(world.getAllBlocks(), [
        { pos: [0, 0, 0], block: 'dirt' },
    ]);
    assert.throws(
        () => applyDiff(world, diff, 'missing'),
        /Diff side "missing" is not an array\./,
    );
});
