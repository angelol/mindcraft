import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { commandExists, executeCommand, getCommand, isAction } from '../../../src/agent/commands/index.js';

const builderCommands = ['!build', '!buildEdit', '!buildUndo', '!buildRedo', '!buildStatus'];

test('builder commands are registered by name', () => {
    for (const command of builderCommands) {
        assert.equal(commandExists(command), true);
        assert.equal(getCommand(command).name, command);
    }
});

test('builder commands are classified as actions', () => {
    for (const command of builderCommands) {
        assert.equal(isAction(command), true);
    }
});

test('build command executes a simple request through bot chat', async () => {
    const previousCwd = process.cwd();
    const tempDir = await mkdtemp(join(tmpdir(), 'mindcraft-builder-command-'));
    const sent = [];
    const agent = {
        name: 'builder_command_agent',
        bot: {
            chat(command) {
                sent.push(command);
            },
        },
    };

    try {
        process.chdir(tempDir);

        const result = await executeCommand(agent, '!build("build a stone house 2x1x1")');

        assert.match(result, /Built simple structure with 2 blocks\./);
        assert.deepEqual(sent, [
            '/fill 0 0 0 1 0 0 stone',
        ]);
    } finally {
        process.chdir(previousCwd);
        await rm(tempDir, { recursive: true, force: true });
    }
});

test('buildStatus reports no active builder project before build', async () => {
    const previousCwd = process.cwd();
    const tempDir = await mkdtemp(join(tmpdir(), 'mindcraft-builder-status-'));
    const agent = {
        name: 'builder_status_agent',
        bot: {
            chat() {},
        },
    };

    try {
        process.chdir(tempDir);

        const result = await executeCommand(agent, '!buildStatus()');

        assert.equal(result, 'No active builder project.');
    } finally {
        process.chdir(previousCwd);
        await rm(tempDir, { recursive: true, force: true });
    }
});
