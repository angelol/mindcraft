import { Vec3 } from 'vec3';
import { normalizeBlock, sortBlockStates } from '../block_state.js';
import { eachPosInBounds, normalizeBounds } from '../bounds.js';

export class MinecraftCommandWorld {
    constructor(bot) {
        this.bot = bot;
    }

    getBlock(pos) {
        if (typeof this.bot.blockAt !== 'function') {
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

        for (const pos of eachPosInBounds(normalizedBounds)) {
            blocks.push({ pos, block: this.getBlock(pos) });
        }

        return {
            bounds: normalizedBounds,
            blocks: sortBlockStates(blocks),
        };
    }

    executeCommands(commands) {
        for (const command of commands) {
            this.bot.chat(command);
        }
    }
}
