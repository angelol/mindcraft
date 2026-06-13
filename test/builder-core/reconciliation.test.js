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
