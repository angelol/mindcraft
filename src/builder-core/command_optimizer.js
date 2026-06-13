import { normalizeBlock, normalizePos, posKey, sortBlockStates } from './block_state.js';

function normalizeBlockStates(blocks) {
    const seen = new Set();
    const states = blocks.map((state) => {
        const pos = normalizePos(state.pos);
        const key = posKey(pos);
        if (seen.has(key)) {
            throw new Error(`Duplicate block position: ${key}`);
        }
        seen.add(key);
        return {
            pos,
            block: normalizeBlock(state.block),
        };
    });
    return sortBlockStates(states);
}

function stateGroupKey(state) {
    const [, y, z] = state.pos;
    return `${y},${z},${state.block}`;
}

function commandForRun(run) {
    const first = run[0];
    const last = run[run.length - 1];
    const [x1, y1, z1] = first.pos;
    const [x2, y2, z2] = last.pos;

    if (run.length === 1) {
        return `/setblock ${x1} ${y1} ${z1} ${first.block}`;
    }
    return `/fill ${x1} ${y1} ${z1} ${x2} ${y2} ${z2} ${first.block}`;
}

function runsForGroup(states) {
    const runs = [];
    const sorted = states.slice().sort((a, b) => a.pos[0] - b.pos[0]);
    let run = [];

    for (const state of sorted) {
        const previous = run[run.length - 1];
        if (!previous || state.pos[0] === previous.pos[0] + 1) {
            run.push(state);
            continue;
        }

        runs.push(run);
        run = [state];
    }

    if (run.length > 0) {
        runs.push(run);
    }

    return runs;
}

export function blocksToCommands(blocks) {
    const states = normalizeBlockStates(blocks);
    const groups = new Map();

    for (const state of states) {
        const key = stateGroupKey(state);
        if (!groups.has(key)) {
            groups.set(key, []);
        }
        groups.get(key).push(state);
    }

    return Array.from(groups.values())
        .flatMap(runsForGroup)
        .sort((a, b) => posKey(a[0].pos).localeCompare(posKey(b[0].pos)))
        .map(commandForRun);
}

export function diffToCommands(diff, side = 'after') {
    const states = diff[side];
    if (!Array.isArray(states)) {
        throw new Error(`Diff side "${side}" is not an array.`);
    }
    return blocksToCommands(states);
}
