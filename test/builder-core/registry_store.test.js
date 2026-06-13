import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createEmptyRegistry, JsonRegistryStore } from '../../src/builder-core/registry_store.js';

test('createEmptyRegistry returns the empty registry shape', () => {
    assert.deepEqual(createEmptyRegistry(), {
        activeProjectId: null,
        projects: {},
    });
});

test('JsonRegistryStore loads empty when missing and persists updates', async () => {
    const tempDir = await mkdtemp(join(tmpdir(), 'mindcraft-registry-store-'));

    try {
        const filePath = join(tempDir, 'nested', 'registry.json');
        const store = new JsonRegistryStore(filePath);

        assert.deepEqual(await store.load(), {
            activeProjectId: null,
            projects: {},
        });

        const registry = {
            activeProjectId: 'project_001',
            projects: {
                project_001: {
                    id: 'project_001',
                    name: 'Test build',
                },
            },
        };

        await store.save(registry);

        assert.equal(await readFile(filePath, 'utf8'), `${JSON.stringify(registry, null, 4)}\n`);
        assert.deepEqual(await store.load(), registry);
    } finally {
        await rm(tempDir, { recursive: true, force: true });
    }
});
