import test from 'node:test';
import assert from 'node:assert/strict';
import { scanVolume } from '../../src/builder-core/scanner.js';
import { FakeWorld } from '../../src/builder-core/world_adapters/fake_world.js';

test('scanVolume reads every block in rectangular bounds including air and sorts states', async () => {
    const world = {
        getBlock(pos) {
            if (pos[0] === 0 && pos[1] === 0 && pos[2] === 0) {
                return 'stone';
            }
            if (pos[0] === 1 && pos[1] === 0 && pos[2] === 0) {
                return 'glass';
            }
            return 'air';
        },
    };

    const scan = await scanVolume(world, { min: [0, 0, 0], max: [1, 1, 0] });

    assert.deepEqual(scan, {
        bounds: { min: [0, 0, 0], max: [1, 1, 0] },
        blocks: [
            { pos: [0, 0, 0], block: 'stone' },
            { pos: [0, 1, 0], block: 'air' },
            { pos: [1, 0, 0], block: 'glass' },
            { pos: [1, 1, 0], block: 'air' },
        ],
    });
});

test('scanVolume normalizes and sorts delegated world scan results', async () => {
    const world = {
        async scanVolume() {
            return {
                bounds: { min: ['1', '0', '0'], max: [0.1, '0', '0'] },
                blocks: [
                    { pos: ['1', '0', '0'], block: ' glass ' },
                    { pos: [0.1, '0', '0'], block: null },
                ],
            };
        },
    };

    const scan = await scanVolume(world, { min: [1, 0, 0], max: [0, 0, 0] });

    assert.deepEqual(scan, {
        bounds: { min: [0, 0, 0], max: [1, 0, 0] },
        blocks: [
            { pos: [0, 0, 0], block: 'air' },
            { pos: [1, 0, 0], block: 'glass' },
        ],
    });
});

test('FakeWorld scanVolume returns sorted block states', async () => {
    const world = new FakeWorld([
        { pos: [1, 0, 0], block: 'oak_planks' },
        { pos: [0, 0, 0], block: 'stone' },
    ]);

    const scan = await world.scanVolume({ min: [0, 0, 0], max: [1, 1, 0] });

    assert.deepEqual(scan.blocks, [
        { pos: [0, 0, 0], block: 'stone' },
        { pos: [0, 1, 0], block: 'air' },
        { pos: [1, 0, 0], block: 'oak_planks' },
        { pos: [1, 1, 0], block: 'air' },
    ]);
});
