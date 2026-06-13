import { normalizeBlock, normalizePos, parsePosKey, posKey } from './block_state.js';

function normalizeBlockStateMap(states = []) {
    const blocks = new Map();
    for (const state of states) {
        blocks.set(posKey(state.pos), normalizeBlock(state.block));
    }
    return blocks;
}

function nextDiffId() {
    return `diff-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function createDiff({ before = [], after = [], reason = '' }) {
    const beforeBlocks = normalizeBlockStateMap(before);
    const afterBlocks = normalizeBlockStateMap(after);
    const keys = new Set([...beforeBlocks.keys(), ...afterBlocks.keys()]);
    const changes = [];

    for (const key of [...keys].sort((a, b) => a.localeCompare(b))) {
        const beforeBlock = beforeBlocks.get(key) || 'air';
        const afterBlock = afterBlocks.get(key) || 'air';
        if (beforeBlock !== afterBlock) {
            changes.push({
                pos: parsePosKey(key),
                before: beforeBlock,
                after: afterBlock,
            });
        }
    }

    return {
        id: nextDiffId(),
        reason,
        changes,
    };
}

export function invertDiff(diff, reason = 'undo') {
    return {
        id: nextDiffId(),
        reason,
        changes: diff.changes.map((change) => ({
            pos: normalizePos(change.pos),
            before: normalizeBlock(change.after),
            after: normalizeBlock(change.before),
        })),
    };
}

export function applyDiff(world, diff) {
    for (const change of diff.changes) {
        world.setBlock(change.pos, change.after);
    }
    return diff.changes;
}
