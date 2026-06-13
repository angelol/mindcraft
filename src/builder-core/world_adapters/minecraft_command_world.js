import { Vec3 } from 'vec3';
import { normalizeBlock, sortBlockStates } from '../block_state.js';
import { eachPosInBounds, normalizeBounds } from '../bounds.js';

export class MinecraftCommandWorld {
    constructor(bot) {
        this.bot = bot;
        this.commandBlocks = new Map();
    }

    getBlock(pos) {
        if (typeof this.bot.blockAt !== 'function') {
            return this.commandBlocks.get(pos.join(',')) || 'air';
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
            this.recordCommandBlockChanges(command);
        }
    }

    recordCommandBlockChanges(command) {
        const parts = String(command).trim().split(/\s+/);
        const type = parts[0];

        if (type === '/setblock' && parts.length >= 5) {
            const pos = parts.slice(1, 4).map(Number);
            if (pos.every(Number.isFinite)) {
                this.commandBlocks.set(pos.map(Math.floor).join(','), normalizeBlock(parts[4]));
            }
            return;
        }

        if (type !== '/fill' || parts.length < 8) {
            return;
        }

        const coords = parts.slice(1, 7).map(Number);
        if (!coords.every(Number.isFinite)) {
            return;
        }

        const bounds = normalizeBounds({
            min: coords.slice(0, 3),
            max: coords.slice(3, 6),
        });
        const block = normalizeBlock(parts[7]);

        for (const pos of eachPosInBounds(bounds)) {
            this.commandBlocks.set(pos.join(','), block);
        }
    }
}
