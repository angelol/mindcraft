import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import test from 'node:test';

test('camera module exposes THREE globally for prismarine entity renderer', async () => {
    const originalThree = globalThis.THREE;
    delete globalThis.THREE;

    try {
        const cameraUrl = pathToFileURL(new URL('../../src/agent/vision/camera.js', import.meta.url).pathname);
        cameraUrl.search = `?t=${Date.now()}`;
        await import(cameraUrl.href);

        assert.equal(typeof globalThis.THREE?.Object3D, 'function');
    } finally {
        if (originalThree) {
            globalThis.THREE = originalThree;
        } else {
            delete globalThis.THREE;
        }
    }
});
