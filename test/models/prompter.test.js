import test from 'node:test';
import assert from 'node:assert/strict';
import { Prompter } from '../../src/models/prompter.js';

test('promptCoding resets awaiting flag when code model throws', async () => {
    const prompter = Object.create(Prompter.prototype);
    prompter.awaiting_coding = false;
    prompter.profile = { coding: 'write code' };
    prompter.coding_examples = null;
    prompter.checkCooldown = async () => {};
    prompter.replaceStrings = async (prompt) => prompt;
    prompter.code_model = {
        async sendRequest() {
            throw new Error('model unavailable');
        },
    };

    await assert.rejects(
        () => prompter.promptCoding([{ role: 'user', content: 'build' }]),
        /model unavailable/,
    );
    assert.equal(prompter.awaiting_coding, false);
});
