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
