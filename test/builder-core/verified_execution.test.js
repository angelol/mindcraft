import test from 'node:test';
import assert from 'node:assert/strict';
import { FakeWorld } from '../../src/builder-core/world_adapters/fake_world.js';
import { createDiff } from '../../src/builder-core/diff.js';
import { executeVerifiedDiff } from '../../src/builder-core/verified_execution.js';

class FlakyWorld extends FakeWorld {
    constructor() {
        super();
        this.setBlocksCalls = 0;
    }

    setBlocks(blocks) {
        this.setBlocksCalls += 1;
        if (this.setBlocksCalls === 1) {
            super.setBlocks(blocks.slice(0, 1));
            return;
        }
        super.setBlocks(blocks);
    }
}

class CommandOnlyWorld {
    constructor() {
        this.commands = [];
        this.skipVerification = true;
    }

    getBlock() {
        return 'air';
    }

    executeCommands(commands) {
        this.commands.push(...commands);
    }
}

class ObservableCommandWorld {
    constructor() {
        this.blocks = new Map();
        this.commands = [];
    }

    getBlock(pos) {
        return this.blocks.get(pos.join(',')) || 'air';
    }

    setBlocks(blocks) {
        for (const block of blocks) {
            if (block.block === 'air') {
                this.blocks.delete(block.pos.join(','));
            } else {
                this.blocks.set(block.pos.join(','), block.block);
            }
        }
    }

    executeCommands(commands) {
        this.commands.push(...commands);
    }
}

test('executeVerifiedDiff succeeds when scanned world matches target blocks', async () => {
    const world = new FakeWorld();
    const diff = createDiff(world, [
        { pos: [0, 0, 0], block: 'stone' },
        { pos: [1, 0, 0], block: 'stone' },
    ], { editId: 'edit_001', summary: 'build line' });

    const result = await executeVerifiedDiff({ world, diff });

    assert.equal(result.ok, true);
    assert.equal(result.retryCommands.length, 0);
    assert.equal(result.verification.drift.ok, true);
    assert.deepEqual(world.getAllBlocks(), [
        { pos: [0, 0, 0], block: 'stone' },
        { pos: [1, 0, 0], block: 'stone' },
    ]);
});

test('executeVerifiedDiff verifies getBlock worlds that also execute commands by default', async () => {
    const world = new ObservableCommandWorld();
    const diff = createDiff(world, [
        { pos: [0, 0, 0], block: 'stone' },
    ], { editId: 'edit_001', summary: 'build block' });

    const result = await executeVerifiedDiff({ world, diff });

    assert.equal(result.ok, true);
    assert.equal(result.verification.ok, true);
    assert.equal(result.verification.skipped, false);
    assert.deepEqual(world.commands, [
        '/setblock 0 0 0 stone',
    ]);
});

test('executeVerifiedDiff retries missing target blocks once', async () => {
    const world = new FlakyWorld();
    const diff = createDiff(world, [
        { pos: [0, 0, 0], block: 'stone' },
        { pos: [1, 0, 0], block: 'stone' },
    ], { editId: 'edit_001', summary: 'build line' });

    const result = await executeVerifiedDiff({ world, diff });

    assert.equal(result.ok, true);
    assert.equal(result.retryCommands.length, 1);
    assert.deepEqual(result.retryCommands, [
        '/setblock 1 0 0 stone',
    ]);
    assert.equal(world.setBlocksCalls, 2);
});

test('executeVerifiedDiff reports unexpected blocks inside dirty bounds', async () => {
    const world = new FakeWorld([
        { pos: [1, 0, 0], block: 'dirt' },
    ]);
    const diff = createDiff(world, [
        { pos: [0, 0, 0], block: 'stone' },
    ], { editId: 'edit_001', summary: 'build block' });
    diff.bounds = {
        min: [0, 0, 0],
        max: [1, 0, 0],
    };

    const result = await executeVerifiedDiff({ world, diff });

    assert.equal(result.ok, false);
    assert.equal(result.verification.drift.summary.unexpected, 1);
    assert.deepEqual(result.verification.drift.unexpected, [
        { pos: [1, 0, 0], expected: 'air', actual: 'dirt' },
    ]);
});

test('executeVerifiedDiff marks command-only worlds as unverified without retrying', async () => {
    const world = new CommandOnlyWorld();
    const diff = createDiff(world, [
        { pos: [0, 0, 0], block: 'stone' },
    ], { editId: 'edit_001', summary: 'build block' });

    const result = await executeVerifiedDiff({ world, diff });

    assert.equal(result.ok, false);
    assert.deepEqual(result.retryCommands, []);
    assert.deepEqual(world.commands, [
        '/setblock 0 0 0 stone',
    ]);
    assert.deepEqual(result.verification, {
        ok: false,
        skipped: true,
        reason: 'world_not_observable',
        drift: null,
        scan: null,
    });
});
