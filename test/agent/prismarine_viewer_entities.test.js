import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';

const require = createRequire(import.meta.url);
const THREE = require('three');
const { Entities } = require('prismarine-viewer/viewer/lib/entities.js');

test('prismarine-viewer ignores unsupported entity models without logging', () => {
    const scene = new THREE.Scene();
    const entities = new Entities(scene);
    const logs = [];
    const originalLog = console.log;
    console.log = (...args) => logs.push(args);

    try {
        entities.update({
            id: 1,
            name: 'glow_squid',
            width: 1,
            height: 1,
            pos: { x: 0, y: 0, z: 0 },
        });
    } finally {
        console.log = originalLog;
    }

    assert.equal(logs.length, 0);
    assert.equal(scene.children.length, 0);
});
