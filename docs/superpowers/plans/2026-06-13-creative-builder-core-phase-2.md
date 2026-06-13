# Creative Builder Core Phase 2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the builder core scan, reconcile, verify, retry, and repair against the actual world state instead of trusting only the registry.

**Architecture:** Extend the existing `src/builder-core/` modules with scan bounds, volume scanning, reconciliation, dirty-region metadata, verified execution, and repair APIs. Keep Mindcraft integration thin: new chat commands route into `BuilderCore`, while the builder core owns scan/reconcile/verify behavior. Use fake-world tests first; the Minecraft adapter uses Mineflayer `bot.blockAt()` for loaded-block scans and remains command-driven for writes.

**Tech Stack:** Node.js ESM, built-in `node:test`, `node:assert/strict`, existing builder-core registry/diff/command modules, Mineflayer `bot.blockAt()`, `vec3`.

---

## Scope

Implement Phase 2 from `docs/superpowers/specs/2026-06-13-creative-builder-core-design.md`.

Included:

- Rectangular volume scanner for fake worlds and Mineflayer worlds.
- Registry/world reconciliation for the active project.
- Dirty-region bounds stored on each new diff.
- Verification after each command batch.
- One retry pass for failed block placements.
- `repair` operation that restores the active project or active part from registry block state.
- `scan` status that reports drift concisely.
- Mindcraft commands: `!buildScan` and `!buildRepair`.

Excluded:

- Semantic inference of unregistered structures.
- Complex connected-component recognition.
- Full automated real Minecraft server test harness.
- Creative geometry DSL.
- Phase 4 natural-language operation planner.
- Dashboard UI.

## File Structure

Create these files:

- `src/builder-core/bounds.js`
  Normalizes bounds, expands bounds, iterates positions in deterministic order, and computes bounds from block states.

- `src/builder-core/scanner.js`
  Scans rectangular volumes from any world adapter with `getBlock(pos)` or `scanVolume(bounds)`.

- `src/builder-core/reconciliation.js`
  Compares registry-expected block states against scanned actual states and returns drift details plus concise summaries.

- `src/builder-core/verified_execution.js`
  Executes a diff, scans the dirty region, retries mismatched target blocks once, and returns verification metadata.

Create these tests:

- `test/builder-core/bounds.test.js`
- `test/builder-core/scanner.test.js`
- `test/builder-core/reconciliation.test.js`
- `test/builder-core/verified_execution.test.js`
- `test/builder-core/repair.test.js`
- `test/agent/commands/builder_phase2_commands.test.js`

Modify these files:

- `src/builder-core/world_adapters/fake_world.js`
  Add `scanVolume(bounds)`.

- `src/builder-core/world_adapters/minecraft_command_world.js`
  Add real `getBlock(pos)` and `scanVolume(bounds)` using Mineflayer loaded block reads.

- `src/builder-core/core.js`
  Add scan/reconcile/verify/repair behavior and store scan summaries in the registry.

- `src/agent/commands/builder.js`
  Add `!buildScan`, `!buildRepair`, and drift-aware status formatting.

- `test/builder-core/core.test.js`
  Extend existing build/edit tests to assert diff bounds and verification metadata where appropriate.

---

### Task 1: Add Bounds and Volume Scanning

**Files:**
- Create: `src/builder-core/bounds.js`
- Create: `src/builder-core/scanner.js`
- Modify: `src/builder-core/world_adapters/fake_world.js`
- Test: `test/builder-core/bounds.test.js`
- Test: `test/builder-core/scanner.test.js`

- [ ] **Step 1: Write the failing bounds test**

Create `test/builder-core/bounds.test.js`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import {
    boundsFromStates,
    eachPosInBounds,
    expandBounds,
    normalizeBounds,
} from '../../src/builder-core/bounds.js';

test('normalizeBounds sorts min and max coordinates', () => {
    assert.deepEqual(normalizeBounds({ min: [3, 5, 1], max: [1, 2, 9] }), {
        min: [1, 2, 1],
        max: [3, 5, 9],
    });
});

test('eachPosInBounds returns positions in deterministic y z x order', () => {
    assert.deepEqual([...eachPosInBounds({ min: [0, 0, 0], max: [1, 1, 0] })], [
        [0, 0, 0],
        [1, 0, 0],
        [0, 1, 0],
        [1, 1, 0],
    ]);
});

test('boundsFromStates computes tight bounds and expandBounds pads them', () => {
    const bounds = boundsFromStates([
        { pos: [2, 4, 6], block: 'stone' },
        { pos: [5, 1, 7], block: 'glass' },
    ]);

    assert.deepEqual(bounds, {
        min: [2, 1, 6],
        max: [5, 4, 7],
    });
    assert.deepEqual(expandBounds(bounds, 1), {
        min: [1, 0, 5],
        max: [6, 5, 8],
    });
});
```

- [ ] **Step 2: Run the bounds test and verify it fails**

Run:

```bash
node --test test/builder-core/bounds.test.js
```

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `src/builder-core/bounds.js`.

- [ ] **Step 3: Implement bounds helpers**

Create `src/builder-core/bounds.js`:

```js
import { normalizePos } from './block_state.js';

export function normalizeBounds(bounds) {
    if (!bounds || !Array.isArray(bounds.min) || !Array.isArray(bounds.max)) {
        throw new Error('Bounds must have min and max [x, y, z] arrays.');
    }

    const min = normalizePos(bounds.min);
    const max = normalizePos(bounds.max);

    return {
        min: [
            Math.min(min[0], max[0]),
            Math.min(min[1], max[1]),
            Math.min(min[2], max[2]),
        ],
        max: [
            Math.max(min[0], max[0]),
            Math.max(min[1], max[1]),
            Math.max(min[2], max[2]),
        ],
    };
}

export function expandBounds(bounds, amount = 0) {
    const normalized = normalizeBounds(bounds);
    const padding = Math.max(0, Math.floor(Number(amount) || 0));

    return {
        min: normalized.min.map((value) => value - padding),
        max: normalized.max.map((value) => value + padding),
    };
}

export function* eachPosInBounds(bounds) {
    const normalized = normalizeBounds(bounds);

    for (let y = normalized.min[1]; y <= normalized.max[1]; y++) {
        for (let z = normalized.min[2]; z <= normalized.max[2]; z++) {
            for (let x = normalized.min[0]; x <= normalized.max[0]; x++) {
                yield [x, y, z];
            }
        }
    }
}

export function boundsFromStates(states) {
    if (!Array.isArray(states) || states.length === 0) {
        return null;
    }

    const first = normalizePos(states[0].pos);
    const min = first.slice();
    const max = first.slice();

    for (const state of states.slice(1)) {
        const pos = normalizePos(state.pos);
        for (let index = 0; index < 3; index++) {
            min[index] = Math.min(min[index], pos[index]);
            max[index] = Math.max(max[index], pos[index]);
        }
    }

    return { min, max };
}
```

- [ ] **Step 4: Write the failing scanner test**

Create `test/builder-core/scanner.test.js`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { scanVolume } from '../../src/builder-core/scanner.js';
import { FakeWorld } from '../../src/builder-core/world_adapters/fake_world.js';

test('scanVolume reads every block in rectangular bounds including air', async () => {
    const world = new FakeWorld([
        { pos: [0, 0, 0], block: 'stone' },
        { pos: [1, 0, 0], block: 'glass' },
    ]);

    const scan = await scanVolume(world, { min: [0, 0, 0], max: [1, 1, 0] });

    assert.deepEqual(scan, {
        bounds: { min: [0, 0, 0], max: [1, 1, 0] },
        blocks: [
            { pos: [0, 0, 0], block: 'stone' },
            { pos: [1, 0, 0], block: 'glass' },
            { pos: [0, 1, 0], block: 'air' },
            { pos: [1, 1, 0], block: 'air' },
        ],
    });
});

test('FakeWorld scanVolume delegates to the common scanner shape', async () => {
    const world = new FakeWorld([
        { pos: [2, 3, 4], block: 'oak_planks' },
    ]);

    const scan = await world.scanVolume({ min: [2, 3, 4], max: [2, 3, 4] });

    assert.deepEqual(scan.blocks, [
        { pos: [2, 3, 4], block: 'oak_planks' },
    ]);
});
```

- [ ] **Step 5: Run the scanner test and verify it fails**

Run:

```bash
node --test test/builder-core/scanner.test.js
```

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `src/builder-core/scanner.js`.

- [ ] **Step 6: Implement scanner**

Create `src/builder-core/scanner.js`:

```js
import { normalizeBlock, sortBlockStates } from './block_state.js';
import { eachPosInBounds, normalizeBounds } from './bounds.js';

export async function scanVolume(world, bounds) {
    const normalizedBounds = normalizeBounds(bounds);

    if (world && typeof world.scanVolume === 'function') {
        const scan = await world.scanVolume(normalizedBounds);
        return {
            bounds: normalizeBounds(scan.bounds || normalizedBounds),
            blocks: sortBlockStates((scan.blocks || []).map((state) => ({
                pos: state.pos,
                block: normalizeBlock(state.block),
            }))),
        };
    }

    if (!world || typeof world.getBlock !== 'function') {
        throw new Error('World adapter must implement getBlock(pos) or scanVolume(bounds).');
    }

    const blocks = [];
    for (const pos of eachPosInBounds(normalizedBounds)) {
        blocks.push({
            pos,
            block: normalizeBlock(await world.getBlock(pos)),
        });
    }

    return {
        bounds: normalizedBounds,
        blocks: sortBlockStates(blocks),
    };
}
```

- [ ] **Step 7: Add FakeWorld scanVolume**

Modify `src/builder-core/world_adapters/fake_world.js`:

```js
import { eachPosInBounds, normalizeBounds } from '../bounds.js';
```

Add this method inside `FakeWorld`:

```js
    async scanVolume(bounds) {
        const normalizedBounds = normalizeBounds(bounds);
        const blocks = [];

        for (const pos of eachPosInBounds(normalizedBounds)) {
            blocks.push({ pos, block: this.getBlock(pos) });
        }

        return {
            bounds: normalizedBounds,
            blocks: sortBlockStates(blocks),
        };
    }
```

- [ ] **Step 8: Run bounds and scanner tests**

Run:

```bash
node --test test/builder-core/bounds.test.js test/builder-core/scanner.test.js
```

Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add src/builder-core/bounds.js src/builder-core/scanner.js src/builder-core/world_adapters/fake_world.js test/builder-core/bounds.test.js test/builder-core/scanner.test.js
git commit -m "feat: add builder volume scanning"
```

---

### Task 2: Add Registry Reconciliation and Drift Summaries

**Files:**
- Create: `src/builder-core/reconciliation.js`
- Modify: `src/builder-core/core.js`
- Test: `test/builder-core/reconciliation.test.js`
- Test: `test/builder-core/core.test.js`

- [ ] **Step 1: Write failing reconciliation tests**

Create `test/builder-core/reconciliation.test.js`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import {
    formatDriftSummary,
    reconcileBlockStates,
} from '../../src/builder-core/reconciliation.js';

test('reconcileBlockStates reports missing changed and unexpected blocks', () => {
    const drift = reconcileBlockStates({
        expected: [
            { pos: [0, 0, 0], block: 'stone' },
            { pos: [1, 0, 0], block: 'glass' },
        ],
        actual: [
            { pos: [0, 0, 0], block: 'air' },
            { pos: [1, 0, 0], block: 'oak_planks' },
            { pos: [2, 0, 0], block: 'dirt' },
        ],
    });

    assert.equal(drift.ok, false);
    assert.deepEqual(drift.summary, {
        missing: 1,
        changed: 1,
        unexpected: 1,
    });
    assert.deepEqual(drift.missing, [
        { pos: [0, 0, 0], expected: 'stone', actual: 'air' },
    ]);
    assert.deepEqual(drift.changed, [
        { pos: [1, 0, 0], expected: 'glass', actual: 'oak_planks' },
    ]);
    assert.deepEqual(drift.unexpected, [
        { pos: [2, 0, 0], expected: 'air', actual: 'dirt' },
    ]);
});

test('formatDriftSummary keeps status concise', () => {
    assert.equal(formatDriftSummary({ ok: true, summary: { missing: 0, changed: 0, unexpected: 0 } }), 'World matches registry.');
    assert.equal(
        formatDriftSummary({ ok: false, summary: { missing: 2, changed: 1, unexpected: 3 } }),
        'World drift: 2 missing, 1 changed, 3 unexpected.'
    );
});
```

- [ ] **Step 2: Run reconciliation test and verify it fails**

Run:

```bash
node --test test/builder-core/reconciliation.test.js
```

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `src/builder-core/reconciliation.js`.

- [ ] **Step 3: Implement reconciliation**

Create `src/builder-core/reconciliation.js`:

```js
import { normalizeBlock, normalizePos, posKey, sortBlockStates } from './block_state.js';

function statesByPos(states) {
    const byPos = new Map();
    for (const state of states || []) {
        const pos = normalizePos(state.pos);
        byPos.set(posKey(pos), {
            pos,
            block: normalizeBlock(state.block),
        });
    }
    return byPos;
}

function driftItem(pos, expected, actual) {
    return {
        pos: normalizePos(pos),
        expected: normalizeBlock(expected),
        actual: normalizeBlock(actual),
    };
}

export function reconcileBlockStates({ expected, actual }) {
    const expectedByPos = statesByPos(expected);
    const actualByPos = statesByPos(actual);
    const missing = [];
    const changed = [];
    const unexpected = [];

    for (const expectedState of sortBlockStates(Array.from(expectedByPos.values()))) {
        const actualState = actualByPos.get(posKey(expectedState.pos));
        const actualBlock = normalizeBlock(actualState?.block);
        if (expectedState.block === 'air') {
            continue;
        }
        if (actualBlock === 'air') {
            missing.push(driftItem(expectedState.pos, expectedState.block, actualBlock));
        } else if (actualBlock !== expectedState.block) {
            changed.push(driftItem(expectedState.pos, expectedState.block, actualBlock));
        }
    }

    for (const actualState of sortBlockStates(Array.from(actualByPos.values()))) {
        const expectedState = expectedByPos.get(posKey(actualState.pos));
        const expectedBlock = normalizeBlock(expectedState?.block);
        if (actualState.block !== 'air' && expectedBlock === 'air') {
            unexpected.push(driftItem(actualState.pos, expectedBlock, actualState.block));
        }
    }

    return {
        ok: missing.length === 0 && changed.length === 0 && unexpected.length === 0,
        summary: {
            missing: missing.length,
            changed: changed.length,
            unexpected: unexpected.length,
        },
        missing,
        changed,
        unexpected,
    };
}

export function formatDriftSummary(drift) {
    if (!drift || drift.ok) {
        return 'World matches registry.';
    }

    return `World drift: ${drift.summary.missing} missing, ${drift.summary.changed} changed, ${drift.summary.unexpected} unexpected.`;
}
```

- [ ] **Step 4: Add core scan test**

Add this test to `test/builder-core/core.test.js`:

```js
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
```

- [ ] **Step 5: Run core scan test and verify it fails**

Run:

```bash
node --test test/builder-core/core.test.js --test-name-pattern "scan reports registry drift"
```

Expected: FAIL with `TypeError: core.scan is not a function`.

- [ ] **Step 6: Implement `BuilderCore.scan()`**

Modify imports in `src/builder-core/core.js`:

```js
import { expandBounds } from './bounds.js';
import { reconcileBlockStates, formatDriftSummary } from './reconciliation.js';
import { scanVolume } from './scanner.js';
```

Add this helper near `getActiveProject`:

```js
function getProjectScanBounds(project) {
    if (!project?.bounds) {
        return null;
    }
    return expandBounds(project.bounds, 0);
}
```

Add this method inside `BuilderCore`:

```js
    async scan() {
        const registry = await this.store.load();
        const project = getActiveProject(registry);
        if (!project) {
            return {
                ok: false,
                message: 'No active build project.',
                drift: null,
            };
        }

        const bounds = getProjectScanBounds(project);
        const scan = await scanVolume(this.world, bounds);
        const drift = reconcileBlockStates({
            expected: project.blockStates || [],
            actual: scan.blocks,
        });

        project.lastScan = {
            scannedAt: new Date().toISOString(),
            bounds: scan.bounds,
            drift,
        };
        await this.store.save(registry);

        return {
            ok: drift.ok,
            message: formatDriftSummary(drift),
            drift,
            scan,
        };
    }
```

- [ ] **Step 7: Run reconciliation and scan tests**

Run:

```bash
node --test test/builder-core/reconciliation.test.js test/builder-core/core.test.js
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/builder-core/reconciliation.js src/builder-core/core.js test/builder-core/reconciliation.test.js test/builder-core/core.test.js
git commit -m "feat: reconcile builder registry with world scans"
```

---

### Task 3: Add Dirty Bounds, Verification, and One Retry

**Files:**
- Create: `src/builder-core/verified_execution.js`
- Modify: `src/builder-core/core.js`
- Test: `test/builder-core/verified_execution.test.js`
- Test: `test/builder-core/core.test.js`

- [ ] **Step 1: Write failing verified execution tests**

Create `test/builder-core/verified_execution.test.js`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { FakeWorld } from '../../src/builder-core/world_adapters/fake_world.js';
import { createDiff } from '../../src/builder-core/diff.js';
import { executeVerifiedDiff } from '../../src/builder-core/verified_execution.js';

class FlakyWorld extends FakeWorld {
    constructor() {
        super();
        this.setBlocksCalls = 0;
    }

    setBlocks(blocks) {
        this.setBlocksCalls += 1;
        if (this.setBlocksCalls === 1) {
            super.setBlocks(blocks.slice(0, 1));
            return;
        }
        super.setBlocks(blocks);
    }
}

test('executeVerifiedDiff succeeds when scanned world matches target blocks', async () => {
    const world = new FakeWorld();
    const diff = createDiff(world, [
        { pos: [0, 0, 0], block: 'stone' },
        { pos: [1, 0, 0], block: 'stone' },
    ], { editId: 'edit_001', summary: 'build line' });

    const result = await executeVerifiedDiff({ world, diff });

    assert.equal(result.ok, true);
    assert.equal(result.retryCommands.length, 0);
    assert.equal(result.verification.drift.ok, true);
    assert.deepEqual(world.getAllBlocks(), [
        { pos: [0, 0, 0], block: 'stone' },
        { pos: [1, 0, 0], block: 'stone' },
    ]);
});

test('executeVerifiedDiff retries missing target blocks once', async () => {
    const world = new FlakyWorld();
    const diff = createDiff(world, [
        { pos: [0, 0, 0], block: 'stone' },
        { pos: [1, 0, 0], block: 'stone' },
    ], { editId: 'edit_001', summary: 'build line' });

    const result = await executeVerifiedDiff({ world, diff });

    assert.equal(result.ok, true);
    assert.equal(result.retryCommands.length, 1);
    assert.deepEqual(result.retryCommands, [
        '/setblock 1 0 0 stone',
    ]);
    assert.equal(world.setBlocksCalls, 2);
});
```

- [ ] **Step 2: Run verified execution test and verify it fails**

Run:

```bash
node --test test/builder-core/verified_execution.test.js
```

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `src/builder-core/verified_execution.js`.

- [ ] **Step 3: Implement verified execution**

Create `src/builder-core/verified_execution.js`:

```js
import { diffToCommands } from './command_optimizer.js';
import { applyDiff, createDiff } from './diff.js';
import { boundsFromStates } from './bounds.js';
import { scanVolume } from './scanner.js';
import { reconcileBlockStates } from './reconciliation.js';

function executeCommands(world, commands) {
    if (typeof world.executeCommands === 'function') {
        world.executeCommands(commands);
    }
}

function failedTargetStates(drift) {
    return [
        ...drift.missing,
        ...drift.changed,
    ].map((item) => ({
        pos: item.pos,
        block: item.expected,
    }));
}

export async function verifyDiff(world, diff, side = 'after') {
    const expected = diff[side] || [];
    const bounds = diff.bounds || boundsFromStates(expected);
    if (!bounds) {
        return {
            ok: true,
            drift: {
                ok: true,
                summary: { missing: 0, changed: 0, unexpected: 0 },
                missing: [],
                changed: [],
                unexpected: [],
            },
            scan: null,
        };
    }

    const scan = await scanVolume(world, bounds);
    const drift = reconcileBlockStates({
        expected,
        actual: scan.blocks,
    });

    return {
        ok: drift.ok,
        drift,
        scan,
    };
}

export async function executeVerifiedDiff({ world, diff, commands = diffToCommands(diff) }) {
    diff.bounds = diff.bounds || boundsFromStates([...diff.before, ...diff.after]);

    if (typeof world.setBlocks === 'function') {
        applyDiff(world, diff, 'after');
    }
    executeCommands(world, commands);

    let verification = await verifyDiff(world, diff, 'after');
    let retryCommands = [];

    if (!verification.ok) {
        const retryStates = failedTargetStates(verification.drift);
        if (retryStates.length > 0) {
            const retryDiff = createDiff(world, retryStates, {
                editId: `${diff.editId}_retry`,
                summary: `retry ${diff.summary}`,
                targetPartIds: diff.targetPartIds || [],
            });
            retryDiff.bounds = boundsFromStates(retryStates);
            retryCommands = diffToCommands(retryDiff);

            if (typeof world.setBlocks === 'function') {
                applyDiff(world, retryDiff, 'after');
            }
            executeCommands(world, retryCommands);
            verification = await verifyDiff(world, diff, 'after');
        }
    }

    return {
        ok: verification.ok,
        commands,
        retryCommands,
        verification,
    };
}
```

- [ ] **Step 4: Add core diff-bounds and verification metadata test**

Add this test to `test/builder-core/core.test.js`:

```js
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
```

- [ ] **Step 5: Run core metadata test and verify it fails**

Run:

```bash
node --test test/builder-core/core.test.js --test-name-pattern "stores dirty bounds"
```

Expected: FAIL because `result.verification` and `diff.bounds` are undefined.

- [ ] **Step 6: Replace core execution helpers with verified execution**

Modify imports in `src/builder-core/core.js`:

```js
import { executeVerifiedDiff } from './verified_execution.js';
import { boundsFromStates } from './bounds.js';
```

Remove the local `executeCommands()` and `applyDiffToWorld()` helpers.

Add this helper:

```js
async function executeAndRecord(world, diff, commands) {
    diff.bounds = diff.bounds || boundsFromStates([...diff.before, ...diff.after]);
    const execution = await executeVerifiedDiff({ world, diff, commands });
    diff.commands = commands;
    diff.retryCommands = execution.retryCommands;
    diff.verification = execution.verification;
    return execution;
}
```

In every core method that currently does:

```js
applyDiffToWorld(this.world, diff);
executeCommands(this.world, commands);
```

replace it with:

```js
const execution = await executeAndRecord(this.world, diff, commands);
```

Add `verification: execution.verification` to each successful return object.

Do this in:

- `build(request)`
- `edit(request)` material replacement path
- `addWindowRow(registry, project)`
- `resizeStructure(registry, project, request)`
- `undo()`
- `redo()`

- [ ] **Step 7: Run verified execution and core tests**

Run:

```bash
node --test test/builder-core/verified_execution.test.js test/builder-core/core.test.js
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/builder-core/verified_execution.js src/builder-core/core.js test/builder-core/verified_execution.test.js test/builder-core/core.test.js
git commit -m "feat: verify and retry builder diffs"
```

---

### Task 4: Add Repair Operation

**Files:**
- Modify: `src/builder-core/core.js`
- Test: `test/builder-core/repair.test.js`

- [ ] **Step 1: Write failing repair tests**

Create `test/builder-core/repair.test.js`:

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
```

- [ ] **Step 2: Run repair test and verify it fails**

Run:

```bash
node --test test/builder-core/repair.test.js
```

Expected: FAIL with `TypeError: core.repair is not a function`.

- [ ] **Step 3: Implement repair helper and method**

Modify `src/builder-core/core.js`.

Add this helper near `getActivePart`:

```js
function expectedStatesForActiveSelection(project) {
    const partIds = project.activeSelection?.partIds || [];
    const wanted = new Set();

    for (const partId of partIds) {
        const part = project.parts?.[partId];
        for (const pos of part?.blockPositions || []) {
            wanted.add(posKey(pos));
        }
    }

    if (wanted.size === 0) {
        return project.blockStates || [];
    }

    return (project.blockStates || []).filter((state) => wanted.has(posKey(state.pos)));
}
```

Add this method inside `BuilderCore`:

```js
    async repair() {
        const registry = await this.store.load();
        const project = getActiveProject(registry);
        if (!project) {
            return { ok: false, message: 'No active build project.', commands: [] };
        }

        const scanResult = await this.scan();
        const repairStates = [
            ...scanResult.drift.missing,
            ...scanResult.drift.changed,
        ].map((item) => ({
            pos: item.pos,
            block: item.expected,
        }));

        const allowed = new Set(expectedStatesForActiveSelection(project).map((state) => posKey(state.pos)));
        const changes = repairStates.filter((state) => allowed.size === 0 || allowed.has(posKey(state.pos)));

        if (changes.length === 0) {
            return { ok: true, message: 'No registered blocks needed repair.', commands: [] };
        }

        const diff = createDiff(createProjectStateWorld({ blockStates: scanResult.scan.blocks }), changes, {
            editId: consumeNextEditId(project),
            summary: 'repair registered blocks',
            targetPartIds: project.activeSelection?.partIds || [],
        });
        const commands = diffToCommands(diff);
        const execution = await executeAndRecord(this.world, diff, commands);

        updateProjectBlockStates(project, diff);
        project.edits.push(diff);
        project.redo = [];
        project.lastScan = {
            scannedAt: new Date().toISOString(),
            bounds: execution.verification.scan?.bounds || scanResult.scan.bounds,
            drift: execution.verification.drift,
        };
        await this.store.save(registry);

        return {
            ok: execution.ok,
            message: `Repaired ${changes.length} registered blocks.`,
            commands: [...commands, ...execution.retryCommands],
            verification: execution.verification,
        };
    }
```

- [ ] **Step 4: Run repair tests**

Run:

```bash
node --test test/builder-core/repair.test.js test/builder-core/core.test.js
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/builder-core/core.js test/builder-core/repair.test.js
git commit -m "feat: repair registered builder blocks"
```

---

### Task 5: Add Minecraft World Scanning

**Files:**
- Modify: `src/builder-core/world_adapters/minecraft_command_world.js`
- Test: `test/builder-core/agent_builder_session.test.js`

- [ ] **Step 1: Update adapter test for real block reads**

Modify the first test in `test/builder-core/agent_builder_session.test.js` to this:

```js
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
```

- [ ] **Step 2: Run adapter test and verify it fails**

Run:

```bash
node --test test/builder-core/agent_builder_session.test.js --test-name-pattern "MinecraftCommandWorld sends commands"
```

Expected: FAIL because `MinecraftCommandWorld.getBlock()` still returns `air` for every position and has no `scanVolume()`.

- [ ] **Step 3: Implement Minecraft scanning**

Replace `src/builder-core/world_adapters/minecraft_command_world.js` with:

```js
import { Vec3 } from 'vec3';
import { normalizeBlock, sortBlockStates } from '../block_state.js';
import { eachPosInBounds, normalizeBounds } from '../bounds.js';

export class MinecraftCommandWorld {
    constructor(bot) {
        this.bot = bot;
    }

    getBlock(pos) {
        const block = this.bot.blockAt(new Vec3(pos[0], pos[1], pos[2]));
        return normalizeBlock(block?.name || 'air');
    }

    setBlocks() {
    }

    async scanVolume(bounds) {
        const normalizedBounds = normalizeBounds(bounds);
        const blocks = [];

        for (const pos of eachPosInBounds(normalizedBounds)) {
            blocks.push({ pos, block: this.getBlock(pos) });
        }

        return {
            bounds: normalizedBounds,
            blocks: sortBlockStates(blocks),
        };
    }

    executeCommands(commands) {
        for (const command of commands) {
            this.bot.chat(command);
        }
    }
}
```

- [ ] **Step 4: Run adapter tests**

Run:

```bash
node --test test/builder-core/agent_builder_session.test.js
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/builder-core/world_adapters/minecraft_command_world.js test/builder-core/agent_builder_session.test.js
git commit -m "feat: scan loaded minecraft blocks for builder core"
```

---

### Task 6: Add `!buildScan`, `!buildRepair`, and Drift-Aware Status

**Files:**
- Modify: `src/agent/commands/builder.js`
- Test: `test/agent/commands/builder_phase2_commands.test.js`
- Test: `test/agent/commands/builder_commands.test.js`

- [ ] **Step 1: Write failing command tests**

Create `test/agent/commands/builder_phase2_commands.test.js`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { builderActionsList } from '../../../src/agent/commands/builder.js';

function command(name) {
    return builderActionsList.find((action) => action.name === name);
}

test('phase 2 builder commands are registered by name', () => {
    assert.ok(command('!buildScan'));
    assert.ok(command('!buildRepair'));
});

test('buildScan returns scan result message', async () => {
    const agent = {
        name: 'andy',
        bot: {
            blockAt() {
                return { name: 'air' };
            },
            chat() {
            },
        },
    };

    const build = command('!build');
    const scan = command('!buildScan');
    await build.perform(agent, 'build a stone house 1x1x1');

    const message = await scan.perform(agent);

    assert.match(message, /World matches registry|World drift:/);
});

test('buildRepair returns repair result message', async () => {
    const agent = {
        name: 'repair_agent',
        bot: {
            blockAt() {
                return { name: 'air' };
            },
            chat() {
            },
        },
    };

    const build = command('!build');
    const repair = command('!buildRepair');
    await build.perform(agent, 'build a stone house 1x1x1');

    const message = await repair.perform(agent, 'repair this');

    assert.match(message, /Repaired 1 registered blocks|No registered blocks needed repair/);
});
```

- [ ] **Step 2: Run command tests and verify they fail**

Run:

```bash
node --test test/agent/commands/builder_phase2_commands.test.js
```

Expected: FAIL because `!buildScan` and `!buildRepair` are not registered.

- [ ] **Step 3: Add command formatting and actions**

Modify `src/agent/commands/builder.js`.

Update `formatStatus(status)`:

```js
function formatStatus(status) {
    if (!status.activeProjectId) {
        return 'No active builder project.';
    }

    const selection = status.activeSelection?.partIds?.join(', ') || 'none';
    const lines = [
        `Active builder project: ${status.activeProjectId}`,
        `Active selection: ${selection}`,
        `Undo edits: ${status.editCount}`,
        `Redo edits: ${status.redoCount}`,
    ];

    if (status.lastScan?.drift?.summary) {
        const summary = status.lastScan.drift.summary;
        lines.push(`World drift: ${summary.missing} missing, ${summary.changed} changed, ${summary.unexpected} unexpected.`);
    }

    return lines.join('\n');
}
```

Add these actions to `builderActionsList` before `!buildStatus`:

```js
    {
        name: '!buildScan',
        description: 'Scan the active builder project and report registry/world drift.',
        perform: async function(agent) {
            const result = await getBuilderForAgent(agent).scan();
            return result.message;
        },
    },
    {
        name: '!buildRepair',
        description: 'Repair damaged registered blocks in the active builder project or active selection.',
        params: {
            request: { type: 'string', description: 'The repair request.' },
        },
        perform: async function(agent, request = 'repair this') {
            const result = await getBuilderForAgent(agent).repair(request);
            return result.message;
        },
    },
```

Modify `BuilderCore.status()` in `src/builder-core/core.js` to include `lastScan`:

```js
    async status() {
        const registry = await this.store.load();
        const project = getActiveProject(registry);

        return {
            activeProjectId: registry.activeProjectId,
            activeSelection: project?.activeSelection || null,
            editCount: project?.edits.length || 0,
            redoCount: project?.redo.length || 0,
            lastScan: project?.lastScan || null,
        };
    }
```

- [ ] **Step 4: Run command tests**

Run:

```bash
node --test test/agent/commands/builder_commands.test.js test/agent/commands/builder_phase2_commands.test.js
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/agent/commands/builder.js src/builder-core/core.js test/agent/commands/builder_phase2_commands.test.js test/agent/commands/builder_commands.test.js
git commit -m "feat: add builder scan and repair commands"
```

---

### Task 7: Integration Hardening and Full Verification

**Files:**
- Modify: `src/builder-core/core.js`
- Modify: `test/builder-core/core.test.js`
- Modify: `docs/superpowers/specs/2026-06-13-creative-builder-core-design.md`

- [ ] **Step 1: Add an end-to-end Phase 2 fake-world test**

Add this test to `test/builder-core/core.test.js`:

```js
test('BuilderCore scans repairs verifies and preserves undo across drift', async () => {
    const world = new FakeWorld();
    const store = createMemoryStore();
    const core = new BuilderCore({ store, world });

    await core.build('build a stone house 3x1x1');
    world.setBlock([1, 0, 0], 'air');

    const scan = await core.scan();
    assert.equal(scan.ok, false);
    assert.deepEqual(scan.drift.summary, {
        missing: 1,
        changed: 0,
        unexpected: 0,
    });

    const repair = await core.repair('repair this');
    assert.equal(repair.ok, true);
    assert.equal(world.getBlock([1, 0, 0]), 'stone');

    const status = await core.status();
    assert.equal(status.lastScan.drift.ok, true);

    const undo = await core.undo();
    assert.equal(undo.ok, true);
    assert.equal(world.getBlock([1, 0, 0]), 'air');
});
```

- [ ] **Step 2: Run end-to-end test and verify it passes**

Run:

```bash
node --test test/builder-core/core.test.js --test-name-pattern "scans repairs verifies"
```

Expected: PASS.

- [ ] **Step 3: Update design spec Phase 2 status**

In `docs/superpowers/specs/2026-06-13-creative-builder-core-design.md`, under `### Phase 2: Scanner and Verification`, append:

```markdown

Implementation note after Phase 2:

- Real-server scanning is based on Mineflayer loaded-block reads through `bot.blockAt()`.
- Fake-world tests cover scan, reconciliation, verification, retry, repair, and drift status.
- This phase does not infer semantic meaning for unregistered user-built structures; unexpected blocks are reported as drift only.
```

- [ ] **Step 4: Run full verification**

Run:

```bash
npx patch-package --error-on-fail --error-on-warn
npm test
```

Expected:

- `patch-package` applies all patches with no warnings or errors.
- `npm test` reports all tests passing.

- [ ] **Step 5: Commit**

```bash
git add src/builder-core/core.js test/builder-core/core.test.js docs/superpowers/specs/2026-06-13-creative-builder-core-design.md
git commit -m "test: cover phase two builder scan repair flow"
```

---

## Execution Notes

- Keep each task in a separate commit.
- Do not modify `src/agent/agent.js` for Phase 2 unless a test proves the command layer cannot route the new behavior.
- Do not add creative geometry primitives in this phase.
- Do not add a real-server automated test harness in this phase; use fake-world tests and a manual Minecraft smoke test after implementation.
- Preserve `bots/` runtime state unless explicitly asked to clean it.
- If `MinecraftCommandWorld.scanVolume()` returns many `air` blocks during manual testing, first verify the target chunks are loaded before changing scanner logic.

## Manual Smoke Test After Implementation

Run Mindcraft with the existing local Gemini profile and vision/build settings after Minecraft LAN is open on the configured port:

```bash
source ~/.nvm/nvm.sh
nvm use 22.22.2
PROFILES='["./andy_gemini_35_flash.json"]' SETTINGS_JSON='{"auto_open_ui":false,"base_profile":"god_mode","load_memory":true,"allow_insecure_coding":true,"allow_vision":true,"render_bot_view":false,"max_messages":30,"num_examples":3}' node main.js
```

In Minecraft chat:

```text
!build("build a stone house 3x1x1")
!buildScan()
```

Manually remove one block from the structure, then run:

```text
!buildScan()
!buildRepair("repair this")
!buildScan()
!buildUndo()
```

Expected:

- First scan reports `World matches registry.`
- Second scan reports one missing or changed block.
- Repair restores the block.
- Final scan reports the world matches the registry.
- Undo removes the repaired block again because repair is a normal undoable edit.

## Self-Review

Spec coverage:

- Rectangular scanner: Task 1 and Task 5.
- Registry reconciliation: Task 2.
- Dirty-region tracking: Task 3 stores `diff.bounds`.
- Verification after command batches: Task 3.
- One retry pass: Task 3.
- Repair operation: Task 4.
- Concise drift status: Task 2 and Task 6.
- `!buildScan`: Task 6.
- Fake-world tests for scan/reconcile/verify/repair: Tasks 1 through 4 and Task 7.

Deferred by design:

- Semantic inference of unknown structures.
- Connected-component recognition.
- Full real-server automation.
- Creative geometry DSL.
- Rich natural-language operation planning.

Placeholder scan:

- This plan intentionally avoids placeholder language and unspecified error handling.
- Every new module has concrete tests, concrete functions, and exact commands.

Type consistency:

- Bounds shape is consistently `{ min: [x, y, z], max: [x, y, z] }`.
- Scan shape is consistently `{ bounds, blocks }`.
- Drift shape is consistently `{ ok, summary, missing, changed, unexpected }`.
- Verification shape is consistently `{ ok, drift, scan }`.
- Core result objects include `ok`, `message`, `commands`, and where applicable `verification`.
