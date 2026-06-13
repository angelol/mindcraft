import { Vec3 } from 'vec3';
import { normalizeBlock, sortBlockStates } from '../block_state.js';
import { eachPosInBounds, normalizeBounds } from '../bounds.js';

function createDelay(ms) {
    if (ms <= 0) {
        return Promise.resolve();
    }
    return new Promise((resolve) => {
        setTimeout(resolve, ms);
    });
}

export class MinecraftCommandWorld {
    constructor(bot, options = {}) {
        const { scanDelayMs = 50 } = options || {};
        this.bot = bot;
        this.scanDelayMs = Math.max(0, Number(scanDelayMs) || 0);
        this.canVerifyBlocks = typeof bot.blockAt === 'function';
        this.pendingScanDelay = null;
    }

    getBlock(pos) {
        if (!this.canVerifyBlocks) {
            return 'air';
        }

        const block = this.bot.blockAt(new Vec3(pos[0], pos[1], pos[2]));
        return normalizeBlock(block?.name);
    }

    setBlocks() {
    }

    async scanVolume(bounds) {
        const normalizedBounds = normalizeBounds(bounds);
        const blocks = [];
        await this.waitForPendingScanDelay();

        for (const pos of eachPosInBounds(normalizedBounds)) {
            blocks.push({ pos, block: this.getBlock(pos) });
        }

        return {
            bounds: normalizedBounds,
            blocks: sortBlockStates(blocks),
        };
    }

    executeCommands(commands) {
        let sentCommand = false;
        for (const command of commands) {
            this.bot.chat(command);
            sentCommand = true;
        }

        if (sentCommand && this.canVerifyBlocks) {
            this.pendingScanDelay = createDelay(this.scanDelayMs);
        }
    }

    async waitForPendingScanDelay() {
        const pendingScanDelay = this.pendingScanDelay;
        this.pendingScanDelay = null;

        if (pendingScanDelay) {
            await pendingScanDelay;
        }
    }
}
