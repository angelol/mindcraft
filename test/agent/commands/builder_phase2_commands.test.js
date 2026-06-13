import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { builderActionsList } from '../../../src/agent/commands/builder.js';

function command(name) {
    return builderActionsList.find((action) => action.name === name);
}

function blockKey(pos) {
    return `${pos.x},${pos.y},${pos.z}`;
}

function createCommandAwareBot() {
    const blocks = new Map();

    function setBlock(x, y, z, block) {
        const key = `${x},${y},${z}`;
        if (block === 'air') {
            blocks.delete(key);
            return;
        }
        blocks.set(key, block);
    }

    return {
        setBlock,
        blockAt(pos) {
            return { name: blocks.get(blockKey(pos)) || 'air' };
        },
        chat(command) {
            const parts = command.split(/\s+/);
            if (parts[0] === '/setblock') {
                setBlock(Number(parts[1]), Number(parts[2]), Number(parts[3]), parts[4]);
                return;
            }

            if (parts[0] === '/fill') {
                const [x1, y1, z1, x2, y2, z2] = parts.slice(1, 7).map(Number);
                const block = parts[7];
                for (let x = Math.min(x1, x2); x <= Math.max(x1, x2); x++) {
                    for (let y = Math.min(y1, y2); y <= Math.max(y1, y2); y++) {
                        for (let z = Math.min(z1, z2); z <= Math.max(z1, z2); z++) {
                            setBlock(x, y, z, block);
                        }
                    }
                }
            }
        },
    };
}

async function withTempCwd(prefix, callback) {
    const previousCwd = process.cwd();
    const tempDir = await mkdtemp(join(tmpdir(), prefix));

    try {
        process.chdir(tempDir);
        return await callback();
    } finally {
        process.chdir(previousCwd);
        await rm(tempDir, { recursive: true, force: true });
    }
}

test('phase 2 builder commands are registered by name', () => {
    assert.ok(command('!buildScan'));
    assert.ok(command('!buildRepair'));
});

test('buildScan returns scan result message', async () => {
    await withTempCwd('mindcraft-builder-scan-command-', async () => {
        const agent = {
            name: 'andy',
            bot: createCommandAwareBot(),
        };

        const build = command('!build');
        const scan = command('!buildScan');
        await build.perform(agent, 'build a stone house 1x1x1');

        const message = await scan.perform(agent);

        assert.match(message, /World matches registry|World drift:/);
    });
});

test('buildRepair returns repair result message', async () => {
    await withTempCwd('mindcraft-builder-repair-command-', async () => {
        const agent = {
            name: 'repair_agent',
            bot: createCommandAwareBot(),
        };

        const build = command('!build');
        const repair = command('!buildRepair');
        await build.perform(agent, 'build a stone house 1x1x1');

        const message = await repair.perform(agent, 'repair this');

        assert.match(message, /Repaired 1 registered blocks|No registered blocks needed repair/);
    });
});

test('buildStatus reports drift from last scan', async () => {
    await withTempCwd('mindcraft-builder-status-drift-command-', async () => {
        const agent = {
            name: 'status_drift_agent',
            bot: createCommandAwareBot(),
        };

        const build = command('!build');
        const scan = command('!buildScan');
        const status = command('!buildStatus');
        await build.perform(agent, 'build a stone house 1x1x1');
        agent.bot.setBlock(0, 0, 0, 'air');
        await scan.perform(agent);

        const message = await status.perform(agent);

        assert.match(message, /World drift: 1 missing, 0 changed, 0 unexpected\./);
    });
});
