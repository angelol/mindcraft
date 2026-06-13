import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
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

test('JsonRegistryStore rejects malformed top-level registry data', async () => {
    const tempDir = await mkdtemp(join(tmpdir(), 'mindcraft-registry-store-'));

    try {
        const cases = [
            { name: 'null', content: 'null', error: /Registry data must be a plain object\./ },
            { name: 'array', content: '[]', error: /Registry data must be a plain object\./ },
            { name: 'string', content: '"bad"', error: /Registry data must be a plain object\./ },
            {
                name: 'number activeProjectId',
                content: '{"activeProjectId":123,"projects":{}}',
                error: /Registry activeProjectId must be a string, null, or undefined\./,
            },
            {
                name: 'null projects',
                content: '{"activeProjectId":"project_001","projects":null}',
                error: /Registry projects must be a plain object or undefined\./,
            },
            {
                name: 'array projects',
                content: '{"activeProjectId":"project_001","projects":[]}',
                error: /Registry projects must be a plain object or undefined\./,
            },
            {
                name: 'scalar projects',
                content: '{"activeProjectId":"project_001","projects":42}',
                error: /Registry projects must be a plain object or undefined\./,
            },
        ];

        for (const testCase of cases) {
            const filePath = join(tempDir, `${testCase.name}.json`);
            await writeFile(filePath, testCase.content, 'utf8');

            await assert.rejects(
                () => new JsonRegistryStore(filePath).load(),
                testCase.error,
            );
        }
    } finally {
        await rm(tempDir, { recursive: true, force: true });
    }
});

test('JsonRegistryStore save atomically overwrites existing registry without leftover temp files', async () => {
    const tempDir = await mkdtemp(join(tmpdir(), 'mindcraft-registry-store-'));

    try {
        const filePath = join(tempDir, 'registry.json');
        const store = new JsonRegistryStore(filePath);
        const firstRegistry = {
            activeProjectId: 'project_001',
            projects: {
                project_001: { id: 'project_001' },
            },
        };
        const secondRegistry = {
            activeProjectId: 'project_002',
            projects: {
                project_002: { id: 'project_002' },
            },
        };

        await store.save(firstRegistry);
        await store.save(secondRegistry);

        assert.deepEqual(await store.load(), secondRegistry);
        assert.equal(await readFile(filePath, 'utf8'), `${JSON.stringify(secondRegistry, null, 4)}\n`);
        assert.deepEqual((await readdir(tempDir)).sort(), ['registry.json']);
    } finally {
        await rm(tempDir, { recursive: true, force: true });
    }
});
