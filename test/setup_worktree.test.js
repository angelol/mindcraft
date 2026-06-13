import test from 'node:test';
import assert from 'node:assert/strict';
import { chmod, cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const repoRoot = new URL('..', import.meta.url).pathname;
const setupScript = join(repoRoot, 'scripts', 'setup-worktree.sh');

async function run(command, args, options = {}) {
    return execFileAsync(command, args, {
        maxBuffer: 1024 * 1024,
        ...options,
    });
}

async function createFixtureRepo() {
    const tempDir = await mkdtemp(join(tmpdir(), 'mindcraft-setup-test-'));
    const main = join(tempDir, 'main');
    const linked = join(tempDir, 'linked');

    await run('git', ['init', main]);
    await run('git', ['-C', main, 'config', 'user.email', 'setup-test@example.com']);
    await run('git', ['-C', main, 'config', 'user.name', 'Setup Test']);
    await writeFile(join(main, 'package.json'), JSON.stringify({
        name: 'setup-fixture',
        scripts: { test: 'node --test' },
    }, null, 2));
    await writeFile(join(main, 'keys.json'), '{"GEMINI_API_KEY":"AQ.Ab8RN6.fixture"}\n');
    await writeFile(join(main, 'settings.js'), 'export default { port: 55916 };\n');
    await writeFile(join(main, 'andy.json'), '{"name":"andy","model":"google/gemini-3.5-flash"}\n');
    await run('git', ['-C', main, 'add', 'package.json']);
    await run('git', ['-C', main, 'commit', '-m', 'fixture']);
    await run('git', ['-C', main, 'worktree', 'add', linked, '-b', 'linked-test']);

    return { tempDir, main, linked };
}

test('setup-worktree copies local config from dynamic main worktree source', async () => {
    const { tempDir, linked } = await createFixtureRepo();
    try {
        const result = await run(setupScript, [], {
            cwd: linked,
            env: { ...process.env, SETUP_SKIP_INSTALL: '1' },
        });

        assert.match(result.stdout, /Main workspace:/);
        assert.equal(await readFile(join(linked, 'keys.json'), 'utf8'), '{"GEMINI_API_KEY":"AQ.Ab8RN6.fixture"}\n');
        assert.equal(await readFile(join(linked, 'settings.js'), 'utf8'), 'export default { port: 55916 };\n');
        assert.equal(await readFile(join(linked, 'andy.json'), 'utf8'), '{"name":"andy","model":"google/gemini-3.5-flash"}\n');
        assert.equal(await readFile(join(linked, '.nvmrc'), 'utf8'), '22.22.2\n');
    } finally {
        await rm(tempDir, { recursive: true, force: true });
    }
});

test('setup-worktree is idempotent and does not overwrite local config without force', async () => {
    const { tempDir, linked } = await createFixtureRepo();
    try {
        const env = { ...process.env, SETUP_SKIP_INSTALL: '1' };
        await run(setupScript, [], { cwd: linked, env });
        await writeFile(join(linked, 'settings.js'), 'local settings\n');

        await run(setupScript, [], { cwd: linked, env });
        assert.equal(await readFile(join(linked, 'settings.js'), 'utf8'), 'local settings\n');

        await run(setupScript, [], { cwd: linked, env: { ...env, FORCE: '1' } });
        assert.equal(await readFile(join(linked, 'settings.js'), 'utf8'), 'export default { port: 55916 };\n');
    } finally {
        await rm(tempDir, { recursive: true, force: true });
    }
});

test('setup-worktree is safe to run from the main workspace', async () => {
    const { tempDir, main } = await createFixtureRepo();
    try {
        const beforeKeys = await readFile(join(main, 'keys.json'), 'utf8');
        const beforeSettings = await readFile(join(main, 'settings.js'), 'utf8');
        const beforeAndy = await readFile(join(main, 'andy.json'), 'utf8');

        await run(setupScript, [], {
            cwd: main,
            env: { ...process.env, SETUP_SKIP_INSTALL: '1' },
        });

        assert.equal(await readFile(join(main, 'keys.json'), 'utf8'), beforeKeys);
        assert.equal(await readFile(join(main, 'settings.js'), 'utf8'), beforeSettings);
        assert.equal(await readFile(join(main, 'andy.json'), 'utf8'), beforeAndy);
        assert.equal(await readFile(join(main, '.nvmrc'), 'utf8'), '22.22.2\n');
    } finally {
        await rm(tempDir, { recursive: true, force: true });
    }
});

test('Makefile exposes setup target', async () => {
    const { tempDir, linked } = await createFixtureRepo();
    try {
        await cp(join(repoRoot, 'Makefile'), join(linked, 'Makefile'));
        await chmod(setupScript, 0o755);

        await run('make', ['setup'], {
            cwd: linked,
            env: {
                ...process.env,
                SETUP_SKIP_INSTALL: '1',
                SETUP_SCRIPT: setupScript,
            },
        });

        assert.equal(existsSync(join(linked, 'keys.json')), true);
    } finally {
        await rm(tempDir, { recursive: true, force: true });
    }
});
