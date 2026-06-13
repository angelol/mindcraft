import { normalizeBlock, parsePosKey, posKey, sortBlockStates } from '../block_state.js';

export class FakeWorld {
    constructor(initialBlocks = []) {
        this.blocks = new Map();
        this.commands = [];
        this.setBlocks(initialBlocks);
    }

    getBlock(pos) {
        return this.blocks.get(posKey(pos)) || 'air';
    }

    setBlock(pos, block) {
        const key = posKey(pos);
        const normalized = normalizeBlock(block);
        if (normalized === 'air') {
            this.blocks.delete(key);
        } else {
            this.blocks.set(key, normalized);
        }
    }

    setBlocks(blocks) {
        for (const block of blocks) {
            this.setBlock(block.pos, block.block);
        }
    }

    getAllBlocks() {
        const states = [];
        for (const [key, block] of this.blocks.entries()) {
            states.push({ pos: parsePosKey(key), block });
        }
        return sortBlockStates(states);
    }

    executeCommands(commands) {
        this.commands.push(...commands);
    }

    getExecutedCommands() {
        return this.commands.slice();
    }
}
