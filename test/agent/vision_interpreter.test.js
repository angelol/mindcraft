import assert from 'node:assert/strict';
import test from 'node:test';

import { VisionInterpreter } from '../../src/agent/vision/vision_interpreter.js';

function createAgent() {
    return {
        name: 'andy',
        bot: {
            async lookAt() {},
            entity: {
                position: { x: 0, y: 64, z: 0 },
                yaw: 0,
                pitch: 0,
            },
            blockAtCursor() {
                return null;
            },
        },
        prompter: {
            vision_model: {
                sendVisionRequest() {},
            },
        },
        history: {
            getHistory() {
                return [];
            },
        },
    };
}

test('lookAtPosition reports unavailable vision when camera never becomes ready', async () => {
    const interpreter = new VisionInterpreter(createAgent(), true, {
        cameraReadyTimeoutMs: 10,
        skipCameraHealthCheck: true,
    });
    interpreter._initCamera = () => new Promise(() => {});

    const result = await Promise.race([
        interpreter.lookAtPosition(1, 2, 3),
        new Promise((resolve) => setTimeout(() => resolve('timed out'), 100)),
    ]);

    assert.notEqual(result, 'timed out');
    assert.match(result, /Vision is unavailable/);
});
