import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import test from 'node:test';

function isNativeCameraDependencyMismatch(error) {
    return error.code === 'ERR_DLOPEN_FAILED'
        || (error.code === 'ERR_INTERNAL_ASSERTION' && process.versions.modules !== '127');
}

test('camera module exposes THREE globally for prismarine entity renderer', async (context) => {
    const originalThree = globalThis.THREE;
    delete globalThis.THREE;

    try {
        const cameraUrl = pathToFileURL(new URL('../../src/agent/vision/camera.js', import.meta.url).pathname);
        cameraUrl.search = `?t=${Date.now()}`;
        try {
            await import(cameraUrl.href);
        } catch (error) {
            if (isNativeCameraDependencyMismatch(error)) {
                context.skip(`camera native dependencies are unavailable for Node ABI ${process.versions.modules}; use Node 22.22.2 for vision tests`);
                return;
            }
            throw error;
        }

        assert.equal(typeof globalThis.THREE?.Object3D, 'function');
    } finally {
        if (originalThree) {
            globalThis.THREE = originalThree;
        } else {
            delete globalThis.THREE;
        }
    }
});
