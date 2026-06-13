import test from 'node:test';
import assert from 'node:assert/strict';
import { FakeWorld } from '../../src/builder-core/world_adapters/fake_world.js';
import { posKey } from '../../src/builder-core/block_state.js';

test('FakeWorld returns air for unset positions and stores normalized blocks', () => {
    const world = new FakeWorld();

    assert.equal(world.getBlock([1, 2, 3]), 'air');

    world.setBlock([1, 2, 3], 'stone_bricks');

    assert.equal(world.getBlock([1, 2, 3]), 'stone_bricks');
    assert.deepEqual(world.getAllBlocks(), [
        { pos: [1, 2, 3], block: 'stone_bricks' },
    ]);
    assert.equal(posKey([1, 2, 3]), '1,2,3');
});

test('FakeWorld can apply many block writes in deterministic order', () => {
    const world = new FakeWorld();

    world.setBlocks([
        { pos: [0, 0, 0], block: 'oak_planks' },
        { pos: [1, 0, 0], block: 'oak_planks' },
        { pos: [0, 1, 0], block: 'glass_pane' },
    ]);

    assert.deepEqual(world.getAllBlocks(), [
        { pos: [0, 0, 0], block: 'oak_planks' },
        { pos: [0, 1, 0], block: 'glass_pane' },
        { pos: [1, 0, 0], block: 'oak_planks' },
    ]);
});

test('FakeWorld treats whitespace-only blocks as air', () => {
    const world = new FakeWorld();

    world.setBlock([2, 0, 0], 'stone');
    world.setBlock([2, 0, 0], '   ');

    assert.equal(world.getBlock([2, 0, 0]), 'air');
    assert.deepEqual(world.getAllBlocks(), []);
});

test('FakeWorld records command arrays and rejects non-arrays', () => {
    const world = new FakeWorld();

    world.executeCommands(['/setblock 0 0 0 stone', '/setblock 1 0 0 glass']);

    assert.deepEqual(world.getExecutedCommands(), [
        '/setblock 0 0 0 stone',
        '/setblock 1 0 0 glass',
    ]);
    assert.throws(
        () => world.executeCommands('/setblock 2 0 0 oak_planks'),
        /Commands must be an array\./,
    );
});
