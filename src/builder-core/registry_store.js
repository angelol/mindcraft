import { mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';
import { randomUUID } from 'node:crypto';

export function createEmptyRegistry() {
    return {
        activeProjectId: null,
        projects: {},
    };
}

function isPlainObject(value) {
    if (value === null || typeof value !== 'object' || Array.isArray(value)) {
        return false;
    }
    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
}

function normalizeRegistry(parsed) {
    if (!isPlainObject(parsed)) {
        throw new Error('Registry data must be a plain object.');
    }
    if (parsed.activeProjectId !== undefined
        && parsed.activeProjectId !== null
        && typeof parsed.activeProjectId !== 'string') {
        throw new Error('Registry activeProjectId must be a string, null, or undefined.');
    }
    if (parsed.projects !== undefined && !isPlainObject(parsed.projects)) {
        throw new Error('Registry projects must be a plain object or undefined.');
    }

    return {
        activeProjectId: parsed.activeProjectId || null,
        projects: parsed.projects || {},
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

        return normalizeRegistry(parsed);
    }

    async save(registry) {
        const parentDir = dirname(this.filePath);
        const tempPath = join(parentDir, `.${basename(this.filePath)}.${process.pid}.${randomUUID()}.tmp`);
        await mkdir(parentDir, { recursive: true });

        try {
            await writeFile(tempPath, `${JSON.stringify(registry, null, 4)}\n`, 'utf8');
            await rename(tempPath, this.filePath);
        } catch (error) {
            await unlink(tempPath).catch((unlinkError) => {
                if (unlinkError.code !== 'ENOENT') {
                    throw unlinkError;
                }
            });
            throw error;
        }
    }
}
