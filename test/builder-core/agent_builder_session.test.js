import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { MinecraftCommandWorld } from '../../src/builder-core/world_adapters/minecraft_command_world.js';
import { getBuilderForAgent } from '../../src/builder-core/agent_builder_session.js';

test('MinecraftCommandWorld sends commands through bot chat and reads air', () => {
    const sent = [];
    const world = new MinecraftCommandWorld({
        chat(command) {
            sent.push(command);
        },
    });

    assert.equal(world.getBlock([10, 20, 30]), 'air');

    world.setBlocks([
        { pos: [0, 0, 0], block: 'stone' },
    ]);
    world.executeCommands([
        '/setblock 0 0 0 stone',
        '/fill 0 0 0 1 0 0 glass',
    ]);

    assert.deepEqual(sent, [
        '/setblock 0 0 0 stone',
        '/fill 0 0 0 1 0 0 glass',
    ]);
});

test('getBuilderForAgent caches builders and writes the agent registry path', async () => {
    const previousCwd = process.cwd();
    const tempDir = await mkdtemp(join(tmpdir(), 'mindcraft-builder-session-'));
    const sent = [];
    const agent = {
        name: 'task_7_agent',
        bot: {
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
