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
