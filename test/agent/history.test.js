import test from 'node:test';
import assert from 'node:assert/strict';
import { History } from '../../src/agent/history.js';

test('summarizeMemories preserves memory when summarization model fails', async () => {
    const originalError = console.error;
    console.error = () => {};
    const history = new History({
        name: 'history_test_agent',
        prompter: {
            async promptMemSaving() {
                throw new Error('quota exhausted');
            },
        },
    });
    history.memory = 'existing memory';

    try {
        await history.summarizeMemories([
            { role: 'user', content: 'new request' },
        ]);

        assert.equal(history.memory, 'existing memory');
    } finally {
        console.error = originalError;
    }
});
