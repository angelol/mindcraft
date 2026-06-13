import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { MinecraftCommandWorld } from '../../src/builder-core/world_adapters/minecraft_command_world.js';
import { getBuilderForAgent } from '../../src/builder-core/agent_builder_session.js';

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
    });

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
