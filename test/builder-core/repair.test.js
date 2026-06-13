import test from 'node:test';
import assert from 'node:assert/strict';
import { BuilderCore } from '../../src/builder-core/core.js';
import { FakeWorld } from '../../src/builder-core/world_adapters/fake_world.js';
import { createEmptyRegistry } from '../../src/builder-core/registry_store.js';

function createMemoryStore() {
    let registry = createEmptyRegistry();
    return {
        async load() {
            return structuredClone(registry);
        },
        async save(nextRegistry) {
            registry = structuredClone(nextRegistry);
        },
    };
}

test('repair restores damaged registered blocks from project state', async () => {
    const world = new FakeWorld();
    const store = createMemoryStore();
    const core = new BuilderCore({ store, world });

    await core.build('build a stone house 3x1x1');
    world.setBlock([1, 0, 0], 'air');
    world.setBlock([2, 0, 0], 'oak_planks');

    const repair = await core.repair('repair this');

    assert.equal(repair.ok, true);
    assert.equal(repair.message, 'Repaired 2 registered blocks.');
    assert.deepEqual(world.getAllBlocks(), [
        { pos: [0, 0, 0], block: 'stone' },
        { pos: [1, 0, 0], block: 'stone' },
        { pos: [2, 0, 0], block: 'stone' },
    ]);

    const registry = await store.load();
    const lastEdit = registry.projects.project_001.edits.at(-1);
    assert.equal(lastEdit.summary, 'repair registered blocks');
    assert.deepEqual(lastEdit.targetPartIds, ['main_structure']);
});

test('repair reports clean state when no registered drift exists', async () => {
    const world = new FakeWorld();
    const store = createMemoryStore();
    const core = new BuilderCore({ store, world });

    await core.build('build a stone house 2x1x1');
    const repair = await core.repair('repair this');

    assert.equal(repair.ok, true);
    assert.equal(repair.message, 'No registered blocks needed repair.');
    assert.deepEqual(repair.commands, []);
});
