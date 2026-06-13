import { normalizeBlock } from './block_state.js';
import { eachPosInBounds, normalizeBounds } from './bounds.js';

export async function scanVolume(world, bounds) {
    const normalizedBounds = normalizeBounds(bounds);

    if (world && typeof world.scanVolume === 'function') {
        const scan = await world.scanVolume(normalizedBounds);
        return {
            bounds: normalizeBounds(scan.bounds || normalizedBounds),
            blocks: (scan.blocks || []).map((state) => ({
                pos: state.pos,
                block: normalizeBlock(state.block),
            })),
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
        blocks,
    };
}
