import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { MinecraftCommandWorld } from '../../src/builder-core/world_adapters/minecraft_command_world.js';
import { getBuilderForAgent } from '../../src/builder-core/agent_builder_session.js';
import { createDiff } from '../../src/builder-core/diff.js';
import { executeVerifiedDiff } from '../../src/builder-core/verified_execution.js';

test('MinecraftCommandWorld sends commands and scans loaded bot blocks', async () => {
    const sent = [];
    const blocks = new Map([
        ['10,20,30', { name: 'stone' }],
        ['11,20,30', { name: 'air' }],
    ]);
    const world = new MinecraftCommandWorld({
        blockAt(pos) {
            return blocks.get(`${pos.x},${pos.y},${pos.z}`) || null;
        },
        chat(command) {
            sent.push(command);
        },
    }, { scanDelayMs: 0 });

    assert.equal(world.getBlock([10, 20, 30]), 'stone');
    assert.equal(world.getBlock([99, 20, 30]), 'air');

    world.setBlocks([
        { pos: [0, 0, 0], block: 'stone' },
    ]);
    world.executeCommands([
        '/setblock 0 0 0 stone',
        '/fill 0 0 0 1 0 0 glass',
    ]);

    const scan = await world.scanVolume({ min: [10, 20, 30], max: [11, 20, 30] });

    assert.deepEqual(scan.blocks, [
        { pos: [10, 20, 30], block: 'stone' },
        { pos: [11, 20, 30], block: 'air' },
    ]);
    assert.deepEqual(sent, [
        '/setblock 0 0 0 stone',
        '/fill 0 0 0 1 0 0 glass',
    ]);
});

test('MinecraftCommandWorld does not treat sent commands as scanned blocks', async () => {
    const sent = [];
    const world = new MinecraftCommandWorld({
        chat(command) {
            sent.push(command);
        },
    });

    world.executeCommands([
        '/setblock 0 0 0 stone',
    ]);

    const scan = await world.scanVolume({ min: [0, 0, 0], max: [0, 0, 0] });

    assert.equal(world.getBlock([0, 0, 0]), 'air');
    assert.deepEqual(scan.blocks, [
        { pos: [0, 0, 0], block: 'air' },
    ]);
    assert.deepEqual(sent, [
        '/setblock 0 0 0 stone',
    ]);
});

test('MinecraftCommandWorld waits for pending command updates before scanning', async () => {
    const sent = [];
    const blocks = new Map();
    const world = new MinecraftCommandWorld({
        blockAt(pos) {
            return blocks.get(`${pos.x},${pos.y},${pos.z}`) || null;
        },
        chat(command) {
            sent.push(command);
            queueMicrotask(() => {
                blocks.set('0,0,0', { name: 'stone' });
                blocks.set('1,0,0', { name: 'stone' });
            });
        },
    }, { scanDelayMs: 0 });
    const diff = createDiff(world, [
        { pos: [0, 0, 0], block: 'stone' },
        { pos: [1, 0, 0], block: 'stone' },
    ], { editId: 'edit_001', summary: 'build delayed line' });

    const result = await executeVerifiedDiff({ world, diff });

    assert.equal(result.ok, true);
    assert.equal(result.verification.skipped, false);
    assert.deepEqual(sent, [
        '/fill 0 0 0 1 0 0 stone',
    ]);
});

test('MinecraftCommandWorld without blockAt opts out of block verification', async () => {
    const sent = [];
    const world = new MinecraftCommandWorld({
        chat(command) {
            sent.push(command);
        },
    });
    const diff = createDiff(world, [
        { pos: [0, 0, 0], block: 'stone' },
    ], { editId: 'edit_001', summary: 'build command-only block' });

    const result = await executeVerifiedDiff({ world, diff });

    assert.equal(world.canVerifyBlocks, false);
    assert.equal(result.ok, false);
    assert.equal(result.verification.skipped, true);
    assert.equal(result.verification.reason, 'world_not_observable');
    assert.deepEqual(result.retryCommands, []);
    assert.deepEqual(sent, [
        '/setblock 0 0 0 stone',
    ]);
});

test('getBuilderForAgent caches builders and writes the agent registry path', async () => {
    const previousCwd = process.cwd();
    const tempDir = await mkdtemp(join(tmpdir(), 'mindcraft-builder-session-'));
    const sent = [];
    const agent = {
        name: 'task_7_agent',
        bot: {
            blockAt(pos) {
                if ((pos.x === 0 || pos.x === 1) && pos.y === 0 && pos.z === 0) {
                    return { name: 'stone' };
                }
                return null;
            },
            chat(command) {
                sent.push(command);
            },
        },
    };

    try {
        process.chdir(tempDir);
        const first = getBuilderForAgent(agent);
        const second = getBuilderForAgent(agent);

        assert.equal(second, first);

        const result = await first.build('build a stone house 2x1x1');

        assert.equal(result.ok, true);
        assert.deepEqual(sent, [
            '/fill 0 0 0 1 0 0 stone',
        ]);

        const registryPath = join(tempDir, 'bots', agent.name, 'builder-registry.json');
        const registry = JSON.parse(await readFile(registryPath, 'utf8'));
        assert.equal(registry.activeProjectId, 'project_001');
        assert.equal(registry.projects.project_001.blockStates.length, 2);
    } finally {
        process.chdir(previousCwd);
        await rm(tempDir, { recursive: true, force: true });
    }
});

test('getBuilderForAgent builds at the bot position instead of world origin', async () => {
    const previousCwd = process.cwd();
    const tempDir = await mkdtemp(join(tmpdir(), 'mindcraft-builder-origin-'));
    const sent = [];
    const blocks = new Map();
    const agent = {
        name: 'positioned_builder_agent',
        bot: {
            entity: {
                position: { x: 10.6, y: 70, z: -3.2 },
            },
            blockAt(pos) {
                return blocks.get(`${pos.x},${pos.y},${pos.z}`) || null;
            },
            chat(command) {
                sent.push(command);
                blocks.set('10,70,-4', { name: 'stone' });
                blocks.set('11,70,-4', { name: 'stone' });
            },
        },
    };

    try {
        process.chdir(tempDir);
        const builder = getBuilderForAgent(agent);

        const result = await builder.build('build a stone house 2x1x1');

        assert.equal(result.ok, true);
        assert.deepEqual(sent, [
            '/fill 10 70 -4 11 70 -4 stone',
        ]);

        const registryPath = join(tempDir, 'bots', agent.name, 'builder-registry.json');
        const registry = JSON.parse(await readFile(registryPath, 'utf8'));
        assert.deepEqual(registry.projects.project_001.origin, [10, 70, -4]);
        assert.deepEqual(registry.projects.project_001.bounds, {
            min: [10, 70, -4],
            max: [11, 70, -4],
        });
    } finally {
        process.chdir(previousCwd);
        await rm(tempDir, { recursive: true, force: true });
    }
});
