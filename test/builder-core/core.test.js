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
        this.skipVerification = true;
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

class DropLastWriteWorld extends FakeWorld {
    constructor(initialBlocks = []) {
        super(initialBlocks);
        this.dropLastWrite = true;
    }

    setBlocks(blocks) {
        const appliedBlocks = this.dropLastWrite ? blocks.slice(0, -1) : blocks;
        super.setBlocks(appliedBlocks);
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

test('BuilderCore does not persist failed build verification as a successful project', async () => {
    const world = new DropLastWriteWorld();
    const store = createMemoryStore();
    const core = new BuilderCore({ store, world });

    const result = await core.build('build a stone house 2x1x1');

    assert.equal(result.ok, false);
    assert.equal(result.verification.ok, false);
    assert.equal(result.verification.skipped, false);

    const registry = await store.load();
    assert.equal(registry.activeProjectId, null);
    assert.deepEqual(registry.projects, {});
});

test('BuilderCore stores dirty bounds and verification metadata for edits', async () => {
    const world = new FakeWorld();
    const store = createMemoryStore();
    const core = new BuilderCore({ store, world });

    const result = await core.build('build a stone house 2x1x1');

    assert.equal(result.ok, true);
    assert.equal(result.verification.ok, true);

    const registry = await store.load();
    const diff = registry.projects.project_001.edits[0];
    assert.deepEqual(diff.bounds, {
        min: [0, 0, 0],
        max: [1, 0, 0],
    });
    assert.deepEqual(diff.verification.drift.summary, {
        missing: 0,
        changed: 0,
        unexpected: 0,
    });
});

test('BuilderCore does not persist failed edit verification as successful block state', async () => {
    const world = new DropLastWriteWorld();
    world.dropLastWrite = false;
    const store = createMemoryStore();
    const core = new BuilderCore({ store, world });

    await core.build('build a stone house 2x1x1');
    world.dropLastWrite = true;
    const edit = await core.edit('change it to oak_planks');

    assert.equal(edit.ok, false);
    assert.equal(edit.verification.ok, false);
    assert.equal(edit.verification.skipped, false);

    const registry = await store.load();
    const project = registry.projects.project_001;
    assert.deepEqual(project.edits.map((diff) => diff.editId), ['edit_001']);
    assert.deepEqual(project.blockStates, [
        { pos: [0, 0, 0], block: 'stone' },
        { pos: [1, 0, 0], block: 'stone' },
    ]);
    assert.equal(project.parts.main_structure.material, 'stone');
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

test('BuilderCore rejects a second build while a project is active', async () => {
    const world = new FakeWorld();
    const store = createMemoryStore();
    const core = new BuilderCore({ store, world });

    await core.build('build a stone house 3x1x1');
    const result = await core.build('build a stone house 1x1x1');

    assert.equal(result.ok, false);
    assert.deepEqual(result.commands, []);
    assert.match(result.message, /already active/);
    assert.deepEqual(world.getAllBlocks(), [
        { pos: [0, 0, 0], block: 'stone' },
        { pos: [1, 0, 0], block: 'stone' },
        { pos: [2, 0, 0], block: 'stone' },
    ]);

    const registry = await store.load();
    assert.deepEqual(registry.projects.project_001.blockStates, world.getAllBlocks());
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

test('BuilderCore adds a simple rectangular window row to active structure', async () => {
    const world = new FakeWorld();
    const store = createMemoryStore();
    const core = new BuilderCore({ store, world });

    await core.build('build a stone house 5x4x3');
    const edit = await core.edit('add windows');

    assert.equal(edit.ok, true);
    assert.match(edit.message, /Added window row/);
    assert.deepEqual(edit.commands, [
        '/fill 1 2 0 3 2 0 glass_pane',
    ]);
    assert.equal(world.getBlock([1, 2, 0]), 'glass_pane');
    assert.equal(world.getBlock([2, 2, 0]), 'glass_pane');
    assert.equal(world.getBlock([3, 2, 0]), 'glass_pane');
    assert.equal(world.getBlock([0, 2, 0]), 'stone');
    assert.equal(world.getBlock([4, 2, 0]), 'stone');

    const registry = await store.load();
    const project = registry.projects.project_001;
    assert.deepEqual(project.parts.window_row_001, {
        id: 'window_row_001',
        type: 'window_row',
        material: 'glass_pane',
        blockPositions: [
            [1, 2, 0],
            [2, 2, 0],
            [3, 2, 0],
        ],
    });
    assert.deepEqual(project.activeSelection, {
        targetId: 'window_row_001',
        partIds: ['window_row_001'],
    });
    assert.deepEqual(project.redo, []);
});

test('BuilderCore restores window metadata across undo and redo', async () => {
    const world = new FakeWorld();
    const store = createMemoryStore();
    const core = new BuilderCore({ store, world });

    await core.build('build a stone house 5x4x3');
    await core.edit('add windows');
    await core.undo();

    let registry = await store.load();
    let project = registry.projects.project_001;
    assert.equal(project.parts.window_row_001, undefined);
    assert.deepEqual(project.activeSelection, {
        targetId: 'main_structure',
        partIds: ['main_structure'],
    });
    assert.equal(project.blockStates.find((state) => state.block === 'glass_pane'), undefined);

    await core.redo();

    registry = await store.load();
    project = registry.projects.project_001;
    assert.deepEqual(project.parts.window_row_001, {
        id: 'window_row_001',
        type: 'window_row',
        material: 'glass_pane',
        blockPositions: [
            [1, 2, 0],
            [2, 2, 0],
            [3, 2, 0],
        ],
    });
    assert.deepEqual(project.activeSelection, {
        targetId: 'window_row_001',
        partIds: ['window_row_001'],
    });
    assert.deepEqual(
        project.blockStates.filter((state) => state.block === 'glass_pane').map((state) => state.pos),
        [
            [1, 2, 0],
            [2, 2, 0],
            [3, 2, 0],
        ],
    );
});

test('BuilderCore resizes the simple rectangular structure', async () => {
    const world = new FakeWorld();
    const store = createMemoryStore();
    const core = new BuilderCore({ store, world });

    await core.build('build a stone house 2x2x1');
    const edit = await core.edit('make it bigger 3x2x2');

    assert.equal(edit.ok, true);
    assert.match(edit.message, /Resized simple structure/);
    assert.equal(world.getBlock([2, 0, 0]), 'stone');
    assert.equal(world.getBlock([2, 1, 1]), 'stone');
    assert.deepEqual(edit.commands, [
        '/fill 0 0 1 2 0 1 stone',
        '/fill 0 1 1 2 1 1 stone',
        '/setblock 2 0 0 stone',
        '/setblock 2 1 0 stone',
    ]);

    const registry = await store.load();
    const project = registry.projects.project_001;
    assert.deepEqual(project.bounds, {
        min: [0, 0, 0],
        max: [2, 1, 1],
    });
    assert.equal(project.parts.main_structure.material, 'stone');
    assert.equal(project.parts.main_structure.blockPositions.length, 12);
    assert.deepEqual(project.activeSelection, {
        targetId: 'main_structure',
        partIds: ['main_structure'],
    });
    assert.deepEqual(project.blockStates, world.getAllBlocks());
    assert.deepEqual(project.redo, []);
});

test('BuilderCore restores resize metadata across undo and redo', async () => {
    const world = new FakeWorld();
    const store = createMemoryStore();
    const core = new BuilderCore({ store, world });

    await core.build('build a stone house 2x2x1');
    await core.edit('make it bigger 3x2x2');
    await core.undo();

    let registry = await store.load();
    let project = registry.projects.project_001;
    assert.deepEqual(project.bounds, {
        min: [0, 0, 0],
        max: [1, 1, 0],
    });
    assert.equal(project.parts.main_structure.blockPositions.length, 4);
    assert.deepEqual(project.activeSelection, {
        targetId: 'main_structure',
        partIds: ['main_structure'],
    });

    await core.redo();

    registry = await store.load();
    project = registry.projects.project_001;
    assert.deepEqual(project.bounds, {
        min: [0, 0, 0],
        max: [2, 1, 1],
    });
    assert.equal(project.parts.main_structure.blockPositions.length, 12);
    assert.deepEqual(project.activeSelection, {
        targetId: 'main_structure',
        partIds: ['main_structure'],
    });
});

test('BuilderCore window and resize undo diffs come from registry state in command-only worlds', async () => {
    const world = new CommandOnlyWorld();
    const store = createMemoryStore();
    const core = new BuilderCore({ store, world });

    await core.build('build a stone house 4x3x1');
    await core.edit('add a front window');
    const undoWindow = await core.undo();

    assert.equal(undoWindow.ok, true);
    assert.deepEqual(undoWindow.commands, [
        '/fill 1 2 0 2 2 0 stone',
    ]);

    await core.edit('make it wider 5x3x1');
    const undoResize = await core.undo();

    assert.equal(undoResize.ok, true);
    assert.deepEqual(undoResize.commands, [
        '/setblock 4 0 0 air',
        '/setblock 4 1 0 air',
        '/setblock 4 2 0 air',
    ]);
});

test('BuilderCore scan reports registry drift after manual world edits', async () => {
    const world = new FakeWorld();
    const store = createMemoryStore();
    const core = new BuilderCore({ store, world });

    await core.build('build a stone house 2x1x1');
    world.setBlock([0, 0, 0], 'air');
    world.setBlock([1, 0, 0], 'oak_planks');
    world.setBlock([2, 0, 0], 'dirt');

    const result = await core.scan();

    assert.equal(result.ok, false);
    assert.equal(result.drift.summary.missing, 1);
    assert.equal(result.drift.summary.changed, 1);
    assert.equal(result.drift.summary.unexpected, 1);
    assert.equal(result.message, 'World drift: 1 missing, 1 changed, 1 unexpected.');

    const registry = await store.load();
    assert.deepEqual(registry.projects.project_001.lastScan.drift.summary, {
        missing: 1,
        changed: 1,
        unexpected: 1,
    });
});
