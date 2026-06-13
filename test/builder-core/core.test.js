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

class CommandOnlyWorld {
    constructor() {
        this.commands = [];
    }

    getBlock() {
        return 'air';
    }

    executeCommands(commands) {
        this.commands.push(...commands);
    }

    getExecutedCommands() {
        return this.commands.slice();
    }
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
    assert.equal(world.getBlock([3, 2, 1]), 'stone');

    const registry = await store.load();
    assert.deepEqual(registry.projects.project_001.bounds, {
        min: [0, 0, 0],
        max: [3, 2, 1],
    });
    assert.deepEqual(registry.projects.project_001.blockStates, world.getAllBlocks());
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

test('BuilderCore uses registry state for command-only world undo diffs', async () => {
    const world = new CommandOnlyWorld();
    const store = createMemoryStore();
    const core = new BuilderCore({ store, world });

    await core.build('build a stone house 2x1x1');
    await core.edit('change it to oak_planks');
    const undo = await core.undo();

    assert.equal(undo.ok, true);
    assert.deepEqual(undo.commands, [
        '/fill 0 0 0 1 0 0 stone',
    ]);
    assert.deepEqual(world.getExecutedCommands().slice(-1), [
        '/fill 0 0 0 1 0 0 stone',
    ]);

    const registry = await store.load();
    assert.deepEqual(registry.projects.project_001.blockStates, [
        { pos: [0, 0, 0], block: 'stone' },
        { pos: [1, 0, 0], block: 'stone' },
    ]);
});

test('BuilderCore undo and redo restore active part material metadata', async () => {
    const world = new FakeWorld();
    const store = createMemoryStore();
    const core = new BuilderCore({ store, world });

    await core.build('build a stone house 2x1x1');
    await core.edit('change it to oak_planks');
    await core.undo();

    let registry = await store.load();
    assert.equal(registry.projects.project_001.parts.main_structure.material, 'stone');

    await core.redo();

    registry = await store.load();
    assert.equal(registry.projects.project_001.parts.main_structure.material, 'oak_planks');
});

test('BuilderCore creates fresh edit ids after undo and clears redo on new edits', async () => {
    const world = new FakeWorld();
    const store = createMemoryStore();
    const core = new BuilderCore({ store, world });

    await core.build('build a stone house 2x1x1');
    await core.edit('change it to oak_planks');
    await core.undo();
    await core.edit('change it to bricks');

    const registry = await store.load();
    const project = registry.projects.project_001;
    assert.deepEqual(project.edits.map((edit) => edit.editId), ['edit_001', 'edit_003']);
    assert.deepEqual(project.redo, []);
});
