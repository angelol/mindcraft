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

class RefuseWritesWorld extends FakeWorld {
    constructor(initialBlocks = []) {
        super(initialBlocks);
        this.refuseWrites = false;
    }

    setBlocks(blocks) {
        if (this.refuseWrites) {
            return;
        }

        super.setBlocks(blocks);
    }
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

test('undoing and redoing repair preserves registered block state and metadata', async () => {
    const world = new FakeWorld();
    const store = createMemoryStore();
    const core = new BuilderCore({ store, world });

    await core.build('build a stone house 3x1x1');
    world.setBlock([1, 0, 0], 'air');
    world.setBlock([2, 0, 0], 'oak_planks');
    await core.repair('repair this');

    const undo = await core.undo();

    assert.equal(undo.ok, true);
    assert.deepEqual(world.getAllBlocks(), [
        { pos: [0, 0, 0], block: 'stone' },
        { pos: [2, 0, 0], block: 'oak_planks' },
    ]);

    let registry = await store.load();
    let project = registry.projects.project_001;
    assert.deepEqual(project.blockStates, [
        { pos: [0, 0, 0], block: 'stone' },
        { pos: [1, 0, 0], block: 'stone' },
        { pos: [2, 0, 0], block: 'stone' },
    ]);
    assert.equal(project.parts.main_structure.material, 'stone');
    assert.deepEqual(project.parts.main_structure.blockPositions, [
        [0, 0, 0],
        [1, 0, 0],
        [2, 0, 0],
    ]);
    assert.deepEqual(project.activeSelection, {
        targetId: 'main_structure',
        partIds: ['main_structure'],
    });

    const scan = await core.scan();

    assert.equal(scan.ok, false);
    assert.deepEqual(scan.drift.summary, {
        missing: 1,
        changed: 1,
        unexpected: 0,
    });

    const redo = await core.redo();

    assert.equal(redo.ok, true);
    assert.deepEqual(world.getAllBlocks(), [
        { pos: [0, 0, 0], block: 'stone' },
        { pos: [1, 0, 0], block: 'stone' },
        { pos: [2, 0, 0], block: 'stone' },
    ]);

    registry = await store.load();
    project = registry.projects.project_001;
    assert.deepEqual(project.blockStates, [
        { pos: [0, 0, 0], block: 'stone' },
        { pos: [1, 0, 0], block: 'stone' },
        { pos: [2, 0, 0], block: 'stone' },
    ]);
    assert.equal(project.parts.main_structure.material, 'stone');
    assert.deepEqual(project.parts.main_structure.blockPositions, [
        [0, 0, 0],
        [1, 0, 0],
        [2, 0, 0],
    ]);
    assert.deepEqual(project.activeSelection, {
        targetId: 'main_structure',
        partIds: ['main_structure'],
    });

    await core.undo();
    const repairAgain = await core.repair('repair this again');

    assert.equal(repairAgain.ok, true);
    assert.equal(repairAgain.message, 'Repaired 2 registered blocks.');
    assert.deepEqual(world.getAllBlocks(), [
        { pos: [0, 0, 0], block: 'stone' },
        { pos: [1, 0, 0], block: 'stone' },
        { pos: [2, 0, 0], block: 'stone' },
    ]);

    registry = await store.load();
    project = registry.projects.project_001;
    assert.deepEqual(project.blockStates, [
        { pos: [0, 0, 0], block: 'stone' },
        { pos: [1, 0, 0], block: 'stone' },
        { pos: [2, 0, 0], block: 'stone' },
    ]);
    assert.equal(project.parts.main_structure.material, 'stone');
});

test('failed repair verification does not persist a successful repair edit', async () => {
    const world = new RefuseWritesWorld();
    const store = createMemoryStore();
    const core = new BuilderCore({ store, world });

    await core.build('build a stone house 2x1x1');
    await core.edit('change it to oak_planks');
    await core.undo();
    world.setBlock([1, 0, 0], 'air');
    world.refuseWrites = true;

    const repair = await core.repair('repair this');

    assert.equal(repair.ok, false);
    assert.equal(repair.message, 'Repair verification failed.');

    const registry = await store.load();
    const project = registry.projects.project_001;
    assert.deepEqual(project.edits.map((edit) => edit.editId), ['edit_001']);
    assert.equal(project.redo.length, 1);
    assert.deepEqual(project.blockStates, [
        { pos: [0, 0, 0], block: 'stone' },
        { pos: [1, 0, 0], block: 'stone' },
    ]);
    assert.equal(project.parts.main_structure.material, 'stone');
});
