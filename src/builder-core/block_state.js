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
    if (block === null || block === undefined) {
        return 'air';
    }
    const normalized = String(block).trim();
    return normalized || 'air';
}

export function sortBlockStates(states) {
    return states.slice().sort((a, b) => posKey(a.pos).localeCompare(posKey(b.pos)));
}
