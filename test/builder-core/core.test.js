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

test('BuilderCore builds a simple rectangular structure and records active selection', async () => {
    const world = new FakeWorld();
    const store = createMemoryStore();
    const core = new BuilderCore({ store, world });

    const result = await core.build('build a stone house 4x3x2');

    assert.equal(result.ok, true);
    assert.equal(result.commands.length, 6);
    assert.match(result.message, /Built simple structure/);

    const status = await core.status();
    assert.equal(status.activeProjectId, 'project_001');
    assert.equal(status.activeSelection.partIds[0], 'main_structure');
    assert.equal(world.getBlock([0, 0, 0]), 'stone');
    assert.equal(world.getBlock([3, 1, 2]), 'stone');
});

test('BuilderCore can replace material on active selection and undo/redo it', async () => {
    const world = new FakeWorld();
    const store = createMemoryStore();
    const core = new BuilderCore({ store, world });

    await core.build('build a stone house 2x1x1');
    const edit = await core.edit('change it to oak_planks');

    assert.equal(edit.ok, true);
    assert.deepEqual(world.getAllBlocks(), [
        { pos: [0, 0, 0], block: 'oak_planks' },
        { pos: [1, 0, 0], block: 'oak_planks' },
    ]);

    const undo = await core.undo();
    assert.equal(undo.ok, true);
    assert.deepEqual(world.getAllBlocks(), [
        { pos: [0, 0, 0], block: 'stone' },
        { pos: [1, 0, 0], block: 'stone' },
    ]);

    const redo = await core.redo();
    assert.equal(redo.ok, true);
    assert.deepEqual(world.getAllBlocks(), [
        { pos: [0, 0, 0], block: 'oak_planks' },
        { pos: [1, 0, 0], block: 'oak_planks' },
    ]);
});
