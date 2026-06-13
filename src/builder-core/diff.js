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
    return states;
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
