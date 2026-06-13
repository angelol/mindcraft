import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

export function createEmptyRegistry() {
    return {
        activeProjectId: null,
        projects: {},
    };
}

export class JsonRegistryStore {
    constructor(filePath) {
        this.filePath = filePath;
    }

    async load() {
        let parsed;
        try {
            parsed = JSON.parse(await readFile(this.filePath, 'utf8'));
        } catch (error) {
            if (error.code === 'ENOENT') {
                return createEmptyRegistry();
            }
            throw error;
        }

        return {
            activeProjectId: parsed.activeProjectId || null,
            projects: parsed.projects || {},
        };
    }

    async save(registry) {
        await mkdir(dirname(this.filePath), { recursive: true });
        await writeFile(this.filePath, `${JSON.stringify(registry, null, 4)}\n`, 'utf8');
    }
}
