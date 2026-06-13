import { diffToCommands } from './command_optimizer.js';
import { applyDiff, createDiff } from './diff.js';
import { boundsFromStates } from './bounds.js';
import { posKey } from './block_state.js';
import { scanVolume } from './scanner.js';
import { reconcileBlockStates } from './reconciliation.js';

function ensureDiffBounds(diff) {
    diff.bounds = diff.bounds || boundsFromStates([...diff.before, ...diff.after]);
    return diff.bounds;
}

function canObserveWorld(world) {
    return Boolean(
        world
        && (
            typeof world.scanVolume === 'function'
            || (typeof world.getBlock === 'function' && typeof world.executeCommands !== 'function')
        ),
    );
}

function createSkippedVerification(reason) {
    return {
        ok: false,
        skipped: true,
        reason,
        drift: null,
        scan: null,
    };
}

function targetActualBlocks(scanBlocks, expected) {
    const targetPositions = new Set(expected.map((state) => posKey(state.pos)));
    return scanBlocks.filter((state) => targetPositions.has(posKey(state.pos)));
}

function createScanStateWorld(scanBlocks) {
    const byPos = new Map(scanBlocks.map((state) => [posKey(state.pos), state.block]));
    return {
        getBlock(pos) {
            return byPos.get(posKey(pos)) || 'air';
        },
    };
}

function statesToRetry(drift) {
    return [...drift.missing, ...drift.changed].map((item) => ({
        pos: item.pos,
        block: item.expected,
    }));
}

function executeCommands(world, commands) {
    if (typeof world?.executeCommands === 'function') {
        world.executeCommands(commands);
    }
}

export async function verifyDiff({ world, diff, side = 'after' }) {
    const bounds = ensureDiffBounds(diff);
    if (!bounds) {
        return createSkippedVerification('empty_diff_bounds');
    }

    if (!canObserveWorld(world)) {
        return createSkippedVerification('world_not_observable');
    }

    const scan = await scanVolume(world, bounds);
    const expected = diff[side];
    const actual = targetActualBlocks(scan.blocks, expected);
    const drift = reconcileBlockStates({ expected, actual });

    return {
        ok: drift.ok,
        skipped: false,
        reason: null,
        drift,
        scan,
    };
}

export async function executeVerifiedDiff({ world, diff, commands = diffToCommands(diff) }) {
    ensureDiffBounds(diff);

    if (typeof world?.setBlocks === 'function') {
        applyDiff(world, diff);
    }
    executeCommands(world, commands);

    let verification = await verifyDiff({ world, diff });
    const retryStates = verification.drift ? statesToRetry(verification.drift) : [];
    let retryCommands = [];

    if (!verification.ok && retryStates.length > 0) {
        const retryDiff = createDiff(createScanStateWorld(verification.scan.blocks), retryStates, {
            editId: `${diff.editId}_retry`,
            summary: `Retry ${diff.summary}`,
            targetPartIds: diff.targetPartIds || [],
        });
        retryDiff.bounds = boundsFromStates([...retryDiff.before, ...retryDiff.after]);
        retryCommands = diffToCommands(retryDiff);

        if (typeof world?.setBlocks === 'function') {
            applyDiff(world, retryDiff);
        }
        executeCommands(world, retryCommands);
        verification = await verifyDiff({ world, diff });
    }

    return {
        ok: verification.ok || verification.skipped,
        commands,
        retryCommands,
        verification,
    };
}
