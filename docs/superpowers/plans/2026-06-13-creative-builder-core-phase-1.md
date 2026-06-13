# Creative Builder Core Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Phase 1 Creative Builder Core MVP: test harness, fake world adapter, JSON registry, undoable diffs, `/setblock` plus simple `/fill` command generation, minimal builder operations, and Mindcraft command integration.

**Architecture:** Add a new `src/builder-core/` module with pure, testable units and a thin adapter into Mindcraft commands. The builder core owns state, diffs, command generation, and basic operations; the agent command layer only routes chat commands into the core. Phase 1 intentionally avoids real world scanning, verification, creative DSL, rich primitives, dashboard work, and multi-project support.

**Tech Stack:** Node.js ESM, built-in `node:test`, `node:assert/strict`, `node:fs/promises`, existing Mineflayer command bridge through Mindcraft command definitions.

---

## Scope

Implement only Phase 1 from `docs/superpowers/specs/2026-06-13-creative-builder-core-design.md`.

Included:

- Node test harness for new code.
- Fake in-memory world adapter for deterministic tests.
- JSON registry store for one active project.
- Active project, active structure, active selection, parts, and edit history.
- Diff model with `before` and `after` block states.
- Undo and redo using stored diffs.
- `/setblock` command generation.
- Simple `/fill` optimization for rectangular same-block cuboids.
- Initial operations:
  - create a simple rectangular structure from a text request
  - replace material on active selection
  - add a rectangular window row
  - resize a simple rectangular structure
- Mindcraft commands: `!build`, `!buildEdit`, `!buildUndo`, `!buildRedo`, `!buildStatus`.

Excluded:

- LLM-authored geometry DSL.
- Rich creative primitives such as spiral stairs, roof pools, hidden cellars, and fire escapes.
- Real Minecraft world scanning.
- Post-execution verification.
- Multi-project support.
- Dashboard UI.

## File Structure

Create these new files:

- `src/builder-core/block_state.js`  
  Owns position keys, block-state normalization, and helper utilities shared by fake world, diffs, and command generation.

- `src/builder-core/world_adapters/fake_world.js`  
  In-memory world adapter for tests. Implements the same minimal read/write interface the core uses.

- `src/builder-core/diff.js`  
  Creates diffs from desired block changes, applies diffs to a world adapter, and inverts diffs for undo.

- `src/builder-core/command_optimizer.js`  
  Converts block changes into `/setblock` commands and compresses rectangular cuboids into `/fill` commands.

- `src/builder-core/registry_store.js`  
  Persists builder registry JSON and provides default registry shape.

- `src/builder-core/core.js`  
  Public builder API: `build`, `edit`, `undo`, `redo`, and `status`.

- `src/builder-core/agent_builder_session.js`  
  Creates/caches a builder core per agent and connects it to a Minecraft command adapter.

- `src/builder-core/world_adapters/minecraft_command_world.js`  
  Phase 1 command-only world adapter. It records command execution and sends `/setblock` or `/fill` to `agent.bot.chat`.

- `src/agent/commands/builder.js`  
  Mindcraft command definitions for `!build`, `!buildEdit`, `!buildUndo`, `!buildRedo`, and `!buildStatus`.

Create these test files:

- `test/builder-core/fake_world.test.js`
- `test/builder-core/diff.test.js`
- `test/builder-core/command_optimizer.test.js`
- `test/builder-core/registry_store.test.js`
- `test/builder-core/core.test.js`
- `test/agent/commands/builder_commands.test.js`

Modify these existing files:

- `package.json`  
  Add a `test` script using Node's built-in test runner.

- `src/agent/commands/index.js`  
  Add builder commands to the command map.

---

### Task 1: Add Node Test Harness and Fake World Adapter

**Files:**
- Modify: `package.json`
- Create: `src/builder-core/block_state.js`
- Create: `src/builder-core/world_adapters/fake_world.js`
- Test: `test/builder-core/fake_world.test.js`

- [ ] **Step 1: Write the failing fake world test**

Create `test/builder-core/fake_world.test.js`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { FakeWorld } from '../../src/builder-core/world_adapters/fake_world.js';
import { posKey } from '../../src/builder-core/block_state.js';

test('FakeWorld returns air for unset positions and stores normalized blocks', () => {
  const world = new FakeWorld();

  assert.equal(world.getBlock([1, 2, 3]), 'air');

  world.setBlock([1, 2, 3], 'stone_bricks');

  assert.equal(world.getBlock([1, 2, 3]), 'stone_bricks');
  assert.deepEqual(world.getAllBlocks(), [
    { pos: [1, 2, 3], block: 'stone_bricks' },
  ]);
  assert.equal(posKey([1, 2, 3]), '1,2,3');
});

test('FakeWorld can apply many block writes in deterministic order', () => {
  const world = new FakeWorld();

  world.setBlocks([
    { pos: [0, 0, 0], block: 'oak_planks' },
    { pos: [1, 0, 0], block: 'oak_planks' },
    { pos: [0, 1, 0], block: 'glass_pane' },
  ]);

  assert.deepEqual(world.getAllBlocks(), [
    { pos: [0, 0, 0], block: 'oak_planks' },
    { pos: [0, 1, 0], block: 'glass_pane' },
    { pos: [1, 0, 0], block: 'oak_planks' },
  ]);
});
```

- [ ] **Step 2: Add the test script**

Modify `package.json` scripts to include `test`:

```json
"scripts": {
    "postinstall": "patch-package",
    "start": "node main.js",
    "test": "node --test",
    "reinstall": "npm run clean:modules && npm install",
    "clean:modules": "node -e \"const fs=require('fs');const p=require('path');['node_modules','package-lock.json'].forEach(f=>{if(fs.existsSync(f)){if(fs.lstatSync(f).isDirectory()){fs.rmSync(f,{recursive:true,force:true});}else{fs.unlinkSync(f);}}});\""
}
```

- [ ] **Step 3: Run test to verify it fails**

Run:

```bash
npm test -- test/builder-core/fake_world.test.js
```

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `src/builder-core/world_adapters/fake_world.js`.

- [ ] **Step 4: Implement block-state helpers**

Create `src/builder-core/block_state.js`:

```js
export function normalizePos(pos) {
    if (!Array.isArray(pos) || pos.length !== 3) {
        throw new Error('Position must be a [x, y, z] array.');
    }
    return pos.map((value) => {
        const number = Number(value);
        if (!Number.isFinite(number)) {
            throw new Error(`Invalid coordinate: ${value}`);
        }
        return Math.floor(number);
    });
}

export function posKey(pos) {
    return normalizePos(pos).join(',');
}

export function parsePosKey(key) {
    const parts = String(key).split(',').map(Number);
    return normalizePos(parts);
}

export function normalizeBlock(block) {
    if (block === null || block === undefined || block === '') {
        return 'air';
    }
    return String(block).trim();
}

export function sortBlockStates(states) {
    return states.slice().sort((a, b) => posKey(a.pos).localeCompare(posKey(b.pos)));
}
```

- [ ] **Step 5: Implement FakeWorld**

Create `src/builder-core/world_adapters/fake_world.js`:

```js
import { normalizeBlock, parsePosKey, posKey, sortBlockStates } from '../block_state.js';

export class FakeWorld {
    constructor(initialBlocks = []) {
        this.blocks = new Map();
        this.commands = [];
        this.setBlocks(initialBlocks);
    }

    getBlock(pos) {
        return this.blocks.get(posKey(pos)) || 'air';
    }

    setBlock(pos, block) {
        const key = posKey(pos);
        const normalized = normalizeBlock(block);
        if (normalized === 'air') {
            this.blocks.delete(key);
        } else {
            this.blocks.set(key, normalized);
        }
    }

    setBlocks(blocks) {
        for (const block of blocks) {
            this.setBlock(block.pos, block.block);
        }
    }

    getAllBlocks() {
        const states = [];
        for (const [key, block] of this.blocks.entries()) {
            states.push({ pos: parsePosKey(key), block });
        }
        return sortBlockStates(states);
    }

    executeCommands(commands) {
        this.commands.push(...commands);
    }

    getExecutedCommands() {
        return this.commands.slice();
    }
}
```

- [ ] **Step 6: Run test to verify it passes**

Run:

```bash
npm test -- test/builder-core/fake_world.test.js
```

Expected: PASS for both fake world tests.

- [ ] **Step 7: Commit**

```bash
git add package.json src/builder-core/block_state.js src/builder-core/world_adapters/fake_world.js test/builder-core/fake_world.test.js
git commit -m "test: add builder core test harness"
```

---

### Task 2: Add Diff Model and Undo Primitive

**Files:**
- Create: `src/builder-core/diff.js`
- Test: `test/builder-core/diff.test.js`

- [ ] **Step 1: Write the failing diff tests**

Create `test/builder-core/diff.test.js`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { createDiff, applyDiff, invertDiff } from '../../src/builder-core/diff.js';
import { FakeWorld } from '../../src/builder-core/world_adapters/fake_world.js';

test('createDiff records before and after block states', () => {
  const world = new FakeWorld([
    { pos: [0, 0, 0], block: 'dirt' },
    { pos: [1, 0, 0], block: 'oak_planks' },
  ]);

  const diff = createDiff(world, [
    { pos: [0, 0, 0], block: 'stone' },
    { pos: [1, 0, 0], block: 'air' },
    { pos: [2, 0, 0], block: 'glass' },
  ], {
    editId: 'edit_001',
    summary: 'replace test blocks',
    targetPartIds: ['part_001'],
  });

  assert.deepEqual(diff, {
    editId: 'edit_001',
    summary: 'replace test blocks',
    targetPartIds: ['part_001'],
    before: [
      { pos: [0, 0, 0], block: 'dirt' },
      { pos: [1, 0, 0], block: 'oak_planks' },
      { pos: [2, 0, 0], block: 'air' },
    ],
    after: [
      { pos: [0, 0, 0], block: 'stone' },
      { pos: [1, 0, 0], block: 'air' },
      { pos: [2, 0, 0], block: 'glass' },
    ],
  });
});

test('applyDiff changes world blocks and invertDiff restores them', () => {
  const world = new FakeWorld([{ pos: [0, 0, 0], block: 'dirt' }]);
  const diff = createDiff(world, [
    { pos: [0, 0, 0], block: 'stone' },
    { pos: [1, 0, 0], block: 'glass' },
  ], {
    editId: 'edit_002',
    summary: 'apply test',
  });

  applyDiff(world, diff);

  assert.deepEqual(world.getAllBlocks(), [
    { pos: [0, 0, 0], block: 'stone' },
    { pos: [1, 0, 0], block: 'glass' },
  ]);

  applyDiff(world, invertDiff(diff));

  assert.deepEqual(world.getAllBlocks(), [
    { pos: [0, 0, 0], block: 'dirt' },
  ]);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
npm test -- test/builder-core/diff.test.js
```

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `src/builder-core/diff.js`.

- [ ] **Step 3: Implement diff utilities**

Create `src/builder-core/diff.js`:

```js
import { normalizeBlock, normalizePos, posKey, sortBlockStates } from './block_state.js';

function uniqueChanges(changes) {
    const byPos = new Map();
    for (const change of changes) {
        byPos.set(posKey(change.pos), {
            pos: normalizePos(change.pos),
            block: normalizeBlock(change.block),
        });
    }
    return sortBlockStates(Array.from(byPos.values()));
}

export function createDiff(world, changes, metadata = {}) {
    const after = uniqueChanges(changes);
    const before = after.map((change) => ({
        pos: change.pos,
        block: normalizeBlock(world.getBlock(change.pos)),
    }));

    return {
        editId: metadata.editId || `edit_${Date.now()}`,
        summary: metadata.summary || 'builder edit',
        targetPartIds: metadata.targetPartIds || [],
        before,
        after,
    };
}

export function applyDiff(world, diff, side = 'after') {
    const states = diff[side];
    if (!Array.isArray(states)) {
        throw new Error(`Diff side "${side}" is not an array.`);
    }
    world.setBlocks(states);
}

export function invertDiff(diff) {
    return {
        editId: `${diff.editId}_undo`,
        summary: `Undo ${diff.summary}`,
        targetPartIds: diff.targetPartIds || [],
        before: diff.after,
        after: diff.before,
    };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run:

```bash
npm test -- test/builder-core/diff.test.js
```

Expected: PASS for both diff tests.

- [ ] **Step 5: Run all builder-core tests**

Run:

```bash
npm test -- test/builder-core
```

Expected: PASS for fake world and diff tests.

- [ ] **Step 6: Commit**

```bash
git add src/builder-core/diff.js test/builder-core/diff.test.js
git commit -m "feat: add builder diff model"
```

---

### Task 3: Add Command Optimizer

**Files:**
- Create: `src/builder-core/command_optimizer.js`
- Test: `test/builder-core/command_optimizer.test.js`

- [ ] **Step 1: Write failing command optimizer tests**

Create `test/builder-core/command_optimizer.test.js`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { blocksToCommands } from '../../src/builder-core/command_optimizer.js';

test('blocksToCommands emits setblock for isolated detail blocks', () => {
  const commands = blocksToCommands([
    { pos: [1, 2, 3], block: 'oak_planks' },
    { pos: [5, 6, 7], block: 'glass_pane' },
  ]);

  assert.deepEqual(commands, [
    '/setblock 1 2 3 oak_planks',
    '/setblock 5 6 7 glass_pane',
  ]);
});

test('blocksToCommands compresses a straight same-block run into fill', () => {
  const commands = blocksToCommands([
    { pos: [0, 0, 0], block: 'stone' },
    { pos: [1, 0, 0], block: 'stone' },
    { pos: [2, 0, 0], block: 'stone' },
  ]);

  assert.deepEqual(commands, [
    '/fill 0 0 0 2 0 0 stone',
  ]);
});

test('blocksToCommands keeps different blocks separate', () => {
  const commands = blocksToCommands([
    { pos: [0, 0, 0], block: 'stone' },
    { pos: [1, 0, 0], block: 'stone' },
    { pos: [2, 0, 0], block: 'glass' },
  ]);

  assert.deepEqual(commands, [
    '/fill 0 0 0 1 0 0 stone',
    '/setblock 2 0 0 glass',
  ]);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
npm test -- test/builder-core/command_optimizer.test.js
```

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `src/builder-core/command_optimizer.js`.

- [ ] **Step 3: Implement command optimizer**

Create `src/builder-core/command_optimizer.js`:

```js
import { normalizeBlock, normalizePos, posKey, sortBlockStates } from './block_state.js';

function commandForSetblock(state) {
    const [x, y, z] = normalizePos(state.pos);
    return `/setblock ${x} ${y} ${z} ${normalizeBlock(state.block)}`;
}

function commandForFill(start, end, block) {
    return `/fill ${start[0]} ${start[1]} ${start[2]} ${end[0]} ${end[1]} ${end[2]} ${normalizeBlock(block)}`;
}

function isNextXRun(prev, next) {
    return prev.block === next.block
        && prev.pos[1] === next.pos[1]
        && prev.pos[2] === next.pos[2]
        && prev.pos[0] + 1 === next.pos[0];
}

export function blocksToCommands(blocks) {
    const normalized = sortBlockStates(blocks.map((block) => ({
        pos: normalizePos(block.pos),
        block: normalizeBlock(block.block),
    })));

    const commands = [];
    let index = 0;

    while (index < normalized.length) {
        const start = normalized[index];
        let end = start;
        let cursor = index + 1;

        while (cursor < normalized.length && isNextXRun(end, normalized[cursor])) {
            end = normalized[cursor];
            cursor++;
        }

        if (end.pos[0] !== start.pos[0]) {
            commands.push(commandForFill(start.pos, end.pos, start.block));
        } else {
            commands.push(commandForSetblock(start));
        }

        index = cursor;
    }

    return commands;
}

export function diffToCommands(diff, side = 'after') {
    const states = diff[side];
    if (!Array.isArray(states)) {
        throw new Error(`Diff side "${side}" is not an array.`);
    }
    return blocksToCommands(states);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run:

```bash
npm test -- test/builder-core/command_optimizer.test.js
```

Expected: PASS for all command optimizer tests.

- [ ] **Step 5: Run all builder-core tests**

Run:

```bash
npm test -- test/builder-core
```

Expected: PASS for fake world, diff, and command optimizer tests.

- [ ] **Step 6: Commit**

```bash
git add src/builder-core/command_optimizer.js test/builder-core/command_optimizer.test.js
git commit -m "feat: add builder command optimizer"
```

---

### Task 4: Add JSON Registry Store

**Files:**
- Create: `src/builder-core/registry_store.js`
- Test: `test/builder-core/registry_store.test.js`

- [ ] **Step 1: Write failing registry tests**

Create `test/builder-core/registry_store.test.js`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { JsonRegistryStore, createEmptyRegistry } from '../../src/builder-core/registry_store.js';

test('createEmptyRegistry returns one active empty registry shape', () => {
  assert.deepEqual(createEmptyRegistry(), {
    activeProjectId: null,
    projects: {},
  });
});

test('JsonRegistryStore loads empty registry when file does not exist and persists updates', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'builder-registry-'));
  const filePath = path.join(dir, 'registry.json');
  const store = new JsonRegistryStore(filePath);

  const empty = await store.load();
  assert.deepEqual(empty, createEmptyRegistry());

  const registry = createEmptyRegistry();
  registry.activeProjectId = 'project_001';
  registry.projects.project_001 = {
    id: 'project_001',
    name: 'test house',
    parts: {},
    edits: [],
    redo: [],
    activeSelection: null,
  };

  await store.save(registry);
  const loaded = await store.load();

  assert.deepEqual(loaded, registry);

  await rm(dir, { recursive: true, force: true });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
npm test -- test/builder-core/registry_store.test.js
```

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `src/builder-core/registry_store.js`.

- [ ] **Step 3: Implement registry store**

Create `src/builder-core/registry_store.js`:

```js
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

export function createEmptyRegistry() {
    return {
        activeProjectId: null,
        projects: {},
    };
}

export class JsonRegistryStore {
    constructor(filePath) {
        this.filePath = filePath;
    }

    async load() {
        try {
            const raw = await readFile(this.filePath, 'utf8');
            const parsed = JSON.parse(raw);
            if (!parsed || typeof parsed !== 'object') {
                return createEmptyRegistry();
            }
            return {
                activeProjectId: parsed.activeProjectId || null,
                projects: parsed.projects || {},
            };
        } catch (error) {
            if (error.code === 'ENOENT') {
                return createEmptyRegistry();
            }
            throw error;
        }
    }

    async save(registry) {
        await mkdir(path.dirname(this.filePath), { recursive: true });
        await writeFile(this.filePath, `${JSON.stringify(registry, null, 2)}\n`, 'utf8');
    }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run:

```bash
npm test -- test/builder-core/registry_store.test.js
```

Expected: PASS for both registry tests.

- [ ] **Step 5: Run all builder-core tests**

Run:

```bash
npm test -- test/builder-core
```

Expected: PASS for all current builder-core tests.

- [ ] **Step 6: Commit**

```bash
git add src/builder-core/registry_store.js test/builder-core/registry_store.test.js
git commit -m "feat: add builder registry store"
```

---

### Task 5: Add Builder Core Build, Material Edit, Undo, Redo, and Status

**Files:**
- Create: `src/builder-core/core.js`
- Test: `test/builder-core/core.test.js`

- [ ] **Step 1: Write failing core tests for build, edit, undo, redo, status**

Create `test/builder-core/core.test.js`:

```js
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
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
npm test -- test/builder-core/core.test.js
```

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `src/builder-core/core.js`.

- [ ] **Step 3: Implement the initial BuilderCore**

Create `src/builder-core/core.js`:

```js
import { blocksToCommands, diffToCommands } from './command_optimizer.js';
import { applyDiff, createDiff, invertDiff } from './diff.js';

function parseDimensions(request) {
    const match = String(request).match(/(\d+)x(\d+)x(\d+)/);
    if (!match) {
        return { width: 5, height: 4, depth: 5 };
    }
    return {
        width: Number(match[1]),
        height: Number(match[2]),
        depth: Number(match[3]),
    };
}

function parseMaterial(request, fallback = 'stone') {
    const known = [
        'stone',
        'stone_bricks',
        'oak_planks',
        'spruce_planks',
        'dark_oak_planks',
        'glass',
        'glass_pane',
        'gray_stained_glass_pane',
        'bricks',
        'quartz_block',
    ];
    const text = String(request);
    return known.find((block) => text.includes(block)) || fallback;
}

function createRectBlocks({ width, height, depth, material }) {
    const blocks = [];
    for (let x = 0; x < width; x++) {
        for (let y = 0; y < height; y++) {
            for (let z = 0; z < depth; z++) {
                blocks.push({ pos: [x, y, z], block: material });
            }
        }
    }
    return blocks;
}

function createProject({ id, name, dimensions, material, blocks }) {
    return {
        id,
        name,
        origin: [0, 0, 0],
        bounds: {
            min: [0, 0, 0],
            max: [dimensions.width - 1, dimensions.height - 1, dimensions.depth - 1],
        },
        activeSelection: {
            targetId: 'main_structure',
            partIds: ['main_structure'],
        },
        parts: {
            main_structure: {
                id: 'main_structure',
                type: 'structure',
                name: name,
                material,
                blockPositions: blocks.map((block) => block.pos),
            },
        },
        edits: [],
        redo: [],
    };
}

function nextEditId(project) {
    return `edit_${String(project.edits.length + 1).padStart(3, '0')}`;
}

export class BuilderCore {
    constructor({ store, world }) {
        this.store = store;
        this.world = world;
    }

    async build(request) {
        const registry = await this.store.load();
        const dimensions = parseDimensions(request);
        const material = parseMaterial(request);
        const blocks = createRectBlocks({ ...dimensions, material });
        const projectId = 'project_001';
        const project = createProject({
            id: projectId,
            name: 'simple structure',
            dimensions,
            material,
            blocks,
        });

        const diff = createDiff(this.world, blocks, {
            editId: 'edit_001',
            summary: `build ${project.name}`,
            targetPartIds: ['main_structure'],
        });

        applyDiff(this.world, diff);
        project.edits.push(diff);
        registry.activeProjectId = projectId;
        registry.projects[projectId] = project;
        await this.store.save(registry);

        const commands = diffToCommands(diff);
        if (this.world.executeCommands) {
            this.world.executeCommands(commands);
        }

        return {
            ok: true,
            message: `Built simple structure with ${blocks.length} blocks.`,
            commands,
        };
    }

    async edit(request) {
        const registry = await this.store.load();
        const project = registry.projects[registry.activeProjectId];
        if (!project) {
            return { ok: false, message: 'No active build project.', commands: [] };
        }

        const material = parseMaterial(request, project.parts.main_structure.material);
        const part = project.parts[project.activeSelection.partIds[0]];
        const changes = part.blockPositions.map((pos) => ({ pos, block: material }));
        const diff = createDiff(this.world, changes, {
            editId: nextEditId(project),
            summary: `replace active selection with ${material}`,
            targetPartIds: project.activeSelection.partIds,
        });

        applyDiff(this.world, diff);
        part.material = material;
        project.edits.push(diff);
        project.redo = [];
        await this.store.save(registry);

        const commands = diffToCommands(diff);
        if (this.world.executeCommands) {
            this.world.executeCommands(commands);
        }

        return {
            ok: true,
            message: `Changed active selection to ${material}.`,
            commands,
        };
    }

    async undo() {
        const registry = await this.store.load();
        const project = registry.projects[registry.activeProjectId];
        if (!project || project.edits.length === 0) {
            return { ok: false, message: 'Nothing to undo.', commands: [] };
        }

        const diff = project.edits.pop();
        const undoDiff = invertDiff(diff);
        applyDiff(this.world, undoDiff);
        project.redo.push(diff);
        await this.store.save(registry);

        const commands = diffToCommands(undoDiff);
        if (this.world.executeCommands) {
            this.world.executeCommands(commands);
        }

        return { ok: true, message: `Undid ${diff.summary}.`, commands };
    }

    async redo() {
        const registry = await this.store.load();
        const project = registry.projects[registry.activeProjectId];
        if (!project || project.redo.length === 0) {
            return { ok: false, message: 'Nothing to redo.', commands: [] };
        }

        const diff = project.redo.pop();
        applyDiff(this.world, diff);
        project.edits.push(diff);
        await this.store.save(registry);

        const commands = diffToCommands(diff);
        if (this.world.executeCommands) {
            this.world.executeCommands(commands);
        }

        return { ok: true, message: `Redid ${diff.summary}.`, commands };
    }

    async status() {
        const registry = await this.store.load();
        const project = registry.projects[registry.activeProjectId] || null;
        return {
            activeProjectId: registry.activeProjectId,
            activeSelection: project?.activeSelection || null,
            editCount: project?.edits.length || 0,
            redoCount: project?.redo.length || 0,
        };
    }
}
```

- [ ] **Step 4: Run core test to verify it passes**

Run:

```bash
npm test -- test/builder-core/core.test.js
```

Expected: PASS for both core tests.

- [ ] **Step 5: Run all builder-core tests**

Run:

```bash
npm test -- test/builder-core
```

Expected: PASS for fake world, diff, command optimizer, registry, and core tests.

- [ ] **Step 6: Commit**

```bash
git add src/builder-core/core.js test/builder-core/core.test.js
git commit -m "feat: add builder core mvp operations"
```

---

### Task 6: Add Phase 1 Window and Resize Operations

**Files:**
- Modify: `src/builder-core/core.js`
- Test: `test/builder-core/core.test.js`

- [ ] **Step 1: Add failing tests for window row and resize**

Append these tests to `test/builder-core/core.test.js`:

```js
test('BuilderCore adds a simple rectangular window row to active structure', async () => {
  const world = new FakeWorld();
  const store = createMemoryStore();
  const core = new BuilderCore({ store, world });

  await core.build('build a stone house 5x4x3');
  const result = await core.edit('add windows');

  assert.equal(result.ok, true);
  assert.match(result.message, /Added window row/);

  const status = await core.status();
  assert.deepEqual(status.activeSelection.partIds, ['window_row_001']);
  assert.equal(world.getBlock([1, 2, 0]), 'glass_pane');
  assert.equal(world.getBlock([2, 2, 0]), 'glass_pane');
  assert.equal(world.getBlock([3, 2, 0]), 'glass_pane');
});

test('BuilderCore resizes the simple rectangular structure', async () => {
  const world = new FakeWorld();
  const store = createMemoryStore();
  const core = new BuilderCore({ store, world });

  await core.build('build a stone house 2x1x1');
  const result = await core.edit('resize 3x1x1');

  assert.equal(result.ok, true);
  assert.match(result.message, /Resized active structure/);
  assert.deepEqual(world.getAllBlocks(), [
    { pos: [0, 0, 0], block: 'stone' },
    { pos: [1, 0, 0], block: 'stone' },
    { pos: [2, 0, 0], block: 'stone' },
  ]);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
npm test -- test/builder-core/core.test.js
```

Expected: FAIL because `edit('add windows')` and `edit('resize 3x1x1')` are treated as material edits or no-ops.

- [ ] **Step 3: Add operation routing and helpers to `core.js`**

Modify `src/builder-core/core.js` by adding these helper functions above `export class BuilderCore`:

```js
function requestWantsWindows(request) {
    return /window/i.test(String(request));
}

function requestWantsResize(request) {
    return /resize|bigger|larger|smaller|shrink|wider/i.test(String(request));
}

function createWindowRow(project) {
    const bounds = project.bounds;
    const minX = bounds.min[0];
    const maxX = bounds.max[0];
    const z = bounds.min[2];
    const y = Math.min(bounds.max[1], bounds.min[1] + 2);
    const changes = [];

    for (let x = minX + 1; x < maxX; x++) {
        changes.push({ pos: [x, y, z], block: 'glass_pane' });
    }

    return changes;
}

function updatePartPositions(project, partId, positions) {
    project.parts[partId].blockPositions = positions.map((pos) => pos.slice());
}
```

Then replace the body of `edit(request)` with this version:

```js
    async edit(request) {
        const registry = await this.store.load();
        const project = registry.projects[registry.activeProjectId];
        if (!project) {
            return { ok: false, message: 'No active build project.', commands: [] };
        }

        if (requestWantsWindows(request)) {
            return await this.addWindowRow(registry, project);
        }

        if (requestWantsResize(request)) {
            return await this.resizeStructure(registry, project, request);
        }

        return await this.replaceActiveMaterial(registry, project, request);
    }
```

Add these methods inside `BuilderCore` before `undo()`:

```js
    async replaceActiveMaterial(registry, project, request) {
        const material = parseMaterial(request, project.parts.main_structure.material);
        const part = project.parts[project.activeSelection.partIds[0]];
        const changes = part.blockPositions.map((pos) => ({ pos, block: material }));
        const diff = createDiff(this.world, changes, {
            editId: nextEditId(project),
            summary: `replace active selection with ${material}`,
            targetPartIds: project.activeSelection.partIds,
        });

        applyDiff(this.world, diff);
        part.material = material;
        project.edits.push(diff);
        project.redo = [];
        await this.store.save(registry);

        const commands = diffToCommands(diff);
        if (this.world.executeCommands) {
            this.world.executeCommands(commands);
        }

        return {
            ok: true,
            message: `Changed active selection to ${material}.`,
            commands,
        };
    }

    async addWindowRow(registry, project) {
        const changes = createWindowRow(project);
        const partId = 'window_row_001';
        const diff = createDiff(this.world, changes, {
            editId: nextEditId(project),
            summary: 'add simple window row',
            targetPartIds: [partId],
        });

        applyDiff(this.world, diff);
        project.parts[partId] = {
            id: partId,
            type: 'window_row',
            name: 'simple window row',
            material: 'glass_pane',
            blockPositions: changes.map((change) => change.pos),
        };
        project.activeSelection = {
            targetId: partId,
            partIds: [partId],
        };
        project.edits.push(diff);
        project.redo = [];
        await this.store.save(registry);

        const commands = diffToCommands(diff);
        if (this.world.executeCommands) {
            this.world.executeCommands(commands);
        }

        return { ok: true, message: 'Added window row.', commands };
    }

    async resizeStructure(registry, project, request) {
        const dimensions = parseDimensions(request);
        const material = project.parts.main_structure.material;
        const nextBlocks = createRectBlocks({ ...dimensions, material });
        const existingPositions = new Set(project.parts.main_structure.blockPositions.map((pos) => pos.join(',')));
        const nextPositions = new Set(nextBlocks.map((block) => block.pos.join(',')));
        const removals = project.parts.main_structure.blockPositions
            .filter((pos) => !nextPositions.has(pos.join(',')))
            .map((pos) => ({ pos, block: 'air' }));
        const additions = nextBlocks.filter((block) => !existingPositions.has(block.pos.join(',')));
        const changes = removals.concat(additions);
        const diff = createDiff(this.world, changes, {
            editId: nextEditId(project),
            summary: `resize active structure to ${dimensions.width}x${dimensions.height}x${dimensions.depth}`,
            targetPartIds: ['main_structure'],
        });

        applyDiff(this.world, diff);
        project.bounds = {
            min: [0, 0, 0],
            max: [dimensions.width - 1, dimensions.height - 1, dimensions.depth - 1],
        };
        updatePartPositions(project, 'main_structure', nextBlocks.map((block) => block.pos));
        project.activeSelection = {
            targetId: 'main_structure',
            partIds: ['main_structure'],
        };
        project.edits.push(diff);
        project.redo = [];
        await this.store.save(registry);

        const commands = diffToCommands(diff);
        if (this.world.executeCommands) {
            this.world.executeCommands(commands);
        }

        return { ok: true, message: 'Resized active structure.', commands };
    }
```

- [ ] **Step 4: Run core tests to verify they pass**

Run:

```bash
npm test -- test/builder-core/core.test.js
```

Expected: PASS for build, material edit, undo/redo, window row, and resize tests.

- [ ] **Step 5: Run all builder-core tests**

Run:

```bash
npm test -- test/builder-core
```

Expected: PASS for all builder-core tests.

- [ ] **Step 6: Commit**

```bash
git add src/builder-core/core.js test/builder-core/core.test.js
git commit -m "feat: add phase one builder edit operations"
```

---

### Task 7: Add Minecraft Command Adapter and Agent Builder Session

**Files:**
- Create: `src/builder-core/world_adapters/minecraft_command_world.js`
- Create: `src/builder-core/agent_builder_session.js`
- Test: extend `test/builder-core/core.test.js`

- [ ] **Step 1: Add failing test for command execution through adapter**

Append this test to `test/builder-core/core.test.js`:

```js
test('BuilderCore sends generated commands through world adapter', async () => {
  const chats = [];
  const world = {
    getBlock() {
      return 'air';
    },
    setBlocks() {
    },
    executeCommands(commands) {
      chats.push(...commands);
    },
  };
  const store = createMemoryStore();
  const core = new BuilderCore({ store, world });

  await core.build('build a stone house 3x1x1');

  assert.deepEqual(chats, [
    '/fill 0 0 0 2 0 0 stone',
  ]);
});
```

- [ ] **Step 2: Run test to verify current behavior**

Run:

```bash
npm test -- test/builder-core/core.test.js
```

Expected: PASS. The `BuilderCore` implementation from Task 5 and Task 6 calls `this.world.executeCommands(commands)` in `build`, `replaceActiveMaterial`, `addWindowRow`, `resizeStructure`, `undo`, and `redo`.

- [ ] **Step 3: Write the Minecraft command world adapter**

Create `src/builder-core/world_adapters/minecraft_command_world.js`:

```js
export class MinecraftCommandWorld {
    constructor(bot) {
        this.bot = bot;
    }

    getBlock() {
        return 'air';
    }

    setBlocks() {
    }

    executeCommands(commands) {
        for (const command of commands) {
            this.bot.chat(command);
        }
    }
}
```

Phase 1 does not scan actual world state, so `getBlock()` returns `air`. Phase 2 replaces this behavior with real scanning.

- [ ] **Step 4: Write the agent builder session helper**

Create `src/builder-core/agent_builder_session.js`:

```js
import path from 'node:path';
import { BuilderCore } from './core.js';
import { JsonRegistryStore } from './registry_store.js';
import { MinecraftCommandWorld } from './world_adapters/minecraft_command_world.js';

const sessions = new WeakMap();

export function getBuilderForAgent(agent) {
    if (sessions.has(agent)) {
        return sessions.get(agent);
    }

    const registryPath = path.join('bots', agent.name, 'builder-registry.json');
    const builder = new BuilderCore({
        store: new JsonRegistryStore(registryPath),
        world: new MinecraftCommandWorld(agent.bot),
    });

    sessions.set(agent, builder);
    return builder;
}
```

- [ ] **Step 5: Run tests**

Run:

```bash
npm test -- test/builder-core
```

Expected: PASS for all builder-core tests.

- [ ] **Step 6: Commit**

```bash
git add src/builder-core/world_adapters/minecraft_command_world.js src/builder-core/agent_builder_session.js test/builder-core/core.test.js
git commit -m "feat: add minecraft builder session adapter"
```

---

### Task 8: Add Mindcraft Builder Commands

**Files:**
- Create: `src/agent/commands/builder.js`
- Modify: `src/agent/commands/index.js`
- Test: `test/agent/commands/builder_commands.test.js`

- [ ] **Step 1: Write failing command registration test**

Create `test/agent/commands/builder_commands.test.js`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { commandExists, getCommand } from '../../../src/agent/commands/index.js';

test('builder commands are registered', () => {
  for (const command of ['!build', '!buildEdit', '!buildUndo', '!buildRedo', '!buildStatus']) {
    assert.equal(commandExists(command), true);
    assert.equal(getCommand(command).name, command);
  }
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
npm test -- test/agent/commands/builder_commands.test.js
```

Expected: FAIL because builder commands are not registered.

- [ ] **Step 3: Add builder command definitions**

Create `src/agent/commands/builder.js`:

```js
import { getBuilderForAgent } from '../../builder-core/agent_builder_session.js';

async function runBuilderCommand(agent, fn) {
    const builder = getBuilderForAgent(agent);
    const result = await fn(builder);
    return result.message;
}

export const builderActionsList = [
    {
        name: '!build',
        description: 'Create a simple builder-core structure in creative mode. Phase 1 supports simple rectangular structures.',
        params: {
            request: { type: 'string', description: 'Natural language build request.' },
        },
        perform: async function(agent, request) {
            return await runBuilderCommand(agent, (builder) => builder.build(request));
        },
    },
    {
        name: '!buildEdit',
        description: 'Edit the active builder-core structure or selection. Phase 1 supports material replacement, simple windows, and resizing.',
        params: {
            request: { type: 'string', description: 'Natural language edit request.' },
        },
        perform: async function(agent, request) {
            return await runBuilderCommand(agent, (builder) => builder.edit(request));
        },
    },
    {
        name: '!buildUndo',
        description: 'Undo the last builder-core edit.',
        perform: async function(agent) {
            return await runBuilderCommand(agent, (builder) => builder.undo());
        },
    },
    {
        name: '!buildRedo',
        description: 'Redo the last undone builder-core edit.',
        perform: async function(agent) {
            return await runBuilderCommand(agent, (builder) => builder.redo());
        },
    },
    {
        name: '!buildStatus',
        description: 'Show the active builder-core project and edit status.',
        perform: async function(agent) {
            const builder = getBuilderForAgent(agent);
            const status = await builder.status();
            if (!status.activeProjectId) {
                return 'No active builder project.';
            }
            return `Builder project ${status.activeProjectId}; edits: ${status.editCount}; redo: ${status.redoCount}; selection: ${status.activeSelection?.partIds?.join(', ') || 'none'}.`;
        },
    },
];
```

- [ ] **Step 4: Register builder commands**

Modify `src/agent/commands/index.js`:

```js
import { actionsList } from './actions.js';
import { builderActionsList } from './builder.js';
import { queryList } from './queries.js';
```

Replace:

```js
const commandList = queryList.concat(actionsList);
```

with:

```js
const commandList = queryList.concat(actionsList, builderActionsList);
```

- [ ] **Step 5: Run command registration test**

Run:

```bash
npm test -- test/agent/commands/builder_commands.test.js
```

Expected: PASS for builder command registration.

- [ ] **Step 6: Run all tests**

Run:

```bash
npm test
```

Expected: PASS for all added tests.

- [ ] **Step 7: Commit**

```bash
git add src/agent/commands/builder.js src/agent/commands/index.js test/agent/commands/builder_commands.test.js
git commit -m "feat: add builder commands"
```

---

### Task 9: Update Agent Guidance and Phase 1 Notes

**Files:**
- Modify: `AGENTS.md`
- Modify: `docs/superpowers/specs/2026-06-13-creative-builder-core-design.md`

- [ ] **Step 1: Update `AGENTS.md` with the new test command**

Add this bullet under "Common Commands":

```markdown
- Run tests for new code: `npm test`
```

- [ ] **Step 2: Update Phase 1 spec with the chosen test harness**

In `docs/superpowers/specs/2026-06-13-creative-builder-core-design.md`, under Phase 1 deliverables, add:

```markdown
- Node built-in unit test harness for new builder-core code.
```

- [ ] **Step 3: Run tests**

Run:

```bash
npm test
```

Expected: PASS for all added tests.

- [ ] **Step 4: Commit**

```bash
git add AGENTS.md docs/superpowers/specs/2026-06-13-creative-builder-core-design.md
git commit -m "docs: document builder test harness"
```

---

## Final Verification

- [ ] **Step 1: Run full test suite**

```bash
npm test
```

Expected: all tests pass.

- [ ] **Step 2: Check working tree**

```bash
git status --short --branch
```

Expected: clean working tree on `angelol/creative-builder-core-design`.

- [ ] **Step 3: Push branch**

```bash
git push
```

Expected: branch updates on `origin/angelol/creative-builder-core-design`.

## Spec Coverage Review

- Builder core module public API: Task 5.
- JSON registry store: Task 4.
- One active project and active selection: Tasks 4 and 5.
- World adapter abstraction: Tasks 1 and 7.
- Fake in-memory adapter for tests: Task 1.
- Minecraft command adapter: Task 7.
- Diff model: Task 2.
- Undo/redo: Task 5.
- `/setblock` generation: Task 3.
- Simple `/fill` optimization: Task 3.
- Mindcraft commands: Task 8.
- Create simple rectangular structure: Task 5.
- Replace material on active selection: Task 5.
- Add rectangular window row: Task 6.
- Resize simple rectangular structure: Task 6.
- Tests for new code: Tasks 1 through 8.

Phase 1 exclusions remain excluded: no creative DSL, rich primitives, real scanning, verification, multi-project support, or dashboard UI.
