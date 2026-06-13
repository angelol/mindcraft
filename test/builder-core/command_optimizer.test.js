import test from 'node:test';
import assert from 'node:assert/strict';
import { blocksToCommands, diffToCommands } from '../../src/builder-core/command_optimizer.js';

test('blocksToCommands emits setblock commands for isolated detail blocks', () => {
    const commands = blocksToCommands([
        { pos: [2.8, 5, 0], block: ' glass_pane ' },
        { pos: [0, 5, 0], block: 'torch' },
    ]);

    assert.deepEqual(commands, [
        '/setblock 0 5 0 torch',
        '/setblock 2 5 0 glass_pane',
    ]);
});

test('blocksToCommands emits fill commands for straight same-block X runs', () => {
    const commands = blocksToCommands([
        { pos: [2, 4, 6], block: 'oak_planks' },
        { pos: [0, 4, 6], block: 'oak_planks' },
        { pos: [1, 4, 6], block: 'oak_planks' },
    ]);

    assert.deepEqual(commands, [
        '/fill 0 4 6 2 4 6 oak_planks',
    ]);
});

test('blocksToCommands keeps different blocks separate', () => {
    const commands = blocksToCommands([
        { pos: [0, 0, 0], block: 'stone' },
        { pos: [1, 0, 0], block: 'glass' },
        { pos: [2, 0, 0], block: 'stone' },
    ]);

    assert.deepEqual(commands, [
        '/setblock 0 0 0 stone',
        '/setblock 1 0 0 glass',
        '/setblock 2 0 0 stone',
    ]);
});

test('blocksToCommands rejects duplicate normalized positions', () => {
    assert.throws(
        () => blocksToCommands([
            { pos: [0, 0, 0], block: 'stone' },
            { pos: ['0', 0.9, 0], block: 'glass' },
        ]),
        /Duplicate block position: 0,0,0/,
    );
});

test('diffToCommands uses a selected side and rejects invalid sides', () => {
    const diff = {
        before: [
            { pos: [0, 0, 0], block: 'dirt' },
        ],
        after: [
            { pos: [0, 0, 0], block: 'stone' },
            { pos: [1, 0, 0], block: 'stone' },
        ],
    };

    assert.deepEqual(diffToCommands(diff), [
        '/fill 0 0 0 1 0 0 stone',
    ]);
    assert.deepEqual(diffToCommands(diff, 'before'), [
        '/setblock 0 0 0 dirt',
    ]);
    assert.throws(
        () => diffToCommands(diff, 'missing'),
        /Diff side "missing" is not an array\./,
    );
});
