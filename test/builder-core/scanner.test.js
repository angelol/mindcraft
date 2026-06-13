import test from 'node:test';
import assert from 'node:assert/strict';
import { scanVolume } from '../../src/builder-core/scanner.js';
import { FakeWorld } from '../../src/builder-core/world_adapters/fake_world.js';

test('scanVolume reads every block in rectangular bounds including air', async () => {
    const world = new FakeWorld([
        { pos: [0, 0, 0], block: 'stone' },
        { pos: [1, 0, 0], block: 'glass' },
    ]);

    const scan = await scanVolume(world, { min: [0, 0, 0], max: [1, 1, 0] });

    assert.deepEqual(scan, {
        bounds: { min: [0, 0, 0], max: [1, 1, 0] },
        blocks: [
            { pos: [0, 0, 0], block: 'stone' },
            { pos: [1, 0, 0], block: 'glass' },
            { pos: [0, 1, 0], block: 'air' },
            { pos: [1, 1, 0], block: 'air' },
        ],
    });
});

test('FakeWorld scanVolume delegates to the common scanner shape', async () => {
    const world = new FakeWorld([
        { pos: [2, 3, 4], block: 'oak_planks' },
    ]);

    const scan = await world.scanVolume({ min: [2, 3, 4], max: [2, 3, 4] });

    assert.deepEqual(scan.blocks, [
        { pos: [2, 3, 4], block: 'oak_planks' },
    ]);
});
