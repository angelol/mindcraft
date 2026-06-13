import { diffToCommands } from './command_optimizer.js';
import { applyDiff, createDiff, invertDiff } from './diff.js';
import { normalizeBlock, normalizePos } from './block_state.js';

const DEFAULT_DIMENSIONS = { width: 5, height: 4, depth: 5 };
const KNOWN_BLOCKS = [
    'gray_stained_glass_pane',
    'dark_oak_planks',
    'stone_bricks',
    'spruce_planks',
    'oak_planks',
    'quartz_block',
    'glass_pane',
    'bricks',
    'glass',
    'stone',
];

function parseDimensions(request) {
    const match = String(request).match(/\b(\d+)x(\d+)x(\d+)\b/i);
    if (!match) {
        return { ...DEFAULT_DIMENSIONS };
    }

    return {
        width: Number(match[1]),
        height: Number(match[2]),
        depth: Number(match[3]),
    };
}

function parseMaterial(request, fallback = 'stone') {
    const text = String(request).toLowerCase();
    const material = KNOWN_BLOCKS.find((block) => {
        const escaped = block.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        return new RegExp(`(^|[^a-z0-9_])${escaped}([^a-z0-9_]|$)`).test(text);
    });
    return material || fallback;
}

function createRectBlocks({ width, height, depth, material }) {
    const blocks = [];
    for (let z = 0; z < depth; z++) {
        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                blocks.push({ pos: [x, y, z], block: material });
            }
        }
    }
    return blocks;
}

function createProject({ id, name, dimensions, material, blocks }) {
    const blockPositions = blocks.map((block) => normalizePos(block.pos));

    return {
        id,
        name,
        origin: [0, 0, 0],
        bounds: {
            min: [0, 0, 0],
            max: [dimensions.width - 1, dimensions.height - 1, dimensions.depth - 1],
        },
        activeSelection: {
            targetId: 'main_structure',
            partIds: ['main_structure'],
        },
        parts: {
            main_structure: {
                id: 'main_structure',
                type: 'structure',
                name,
                material,
                blockPositions,
            },
        },
        edits: [],
        redo: [],
    };
}

function getActiveProject(registry) {
    if (!registry.activeProjectId) {
        return null;
    }
    return registry.projects[registry.activeProjectId] || null;
}

function getActivePart(project) {
    const partId = project.activeSelection?.partIds?.[0];
    if (!partId) {
        return null;
    }
    return project.parts?.[partId] || null;
}

function nextEditId(project) {
    return `edit_${String(project.edits.length + 1).padStart(3, '0')}`;
}

function executeCommands(world, commands) {
    if (typeof world.executeCommands === 'function') {
        world.executeCommands(commands);
    }
}

export class BuilderCore {
    constructor({ store, world }) {
        this.store = store;
        this.world = world;
    }

    async build(request) {
        const registry = await this.store.load();
        const dimensions = parseDimensions(request);
        const material = parseMaterial(request);
        const blocks = createRectBlocks({ ...dimensions, material });
        const projectId = 'project_001';
        const project = createProject({
            id: projectId,
            name: 'simple structure',
            dimensions,
            material,
            blocks,
        });
        const diff = createDiff(this.world, blocks, {
            editId: 'edit_001',
            summary: 'build simple structure',
            targetPartIds: ['main_structure'],
        });
        const commands = diffToCommands(diff);

        applyDiff(this.world, diff);
        executeCommands(this.world, commands);
        project.edits.push(diff);
        registry.activeProjectId = projectId;
        registry.projects[projectId] = project;
        await this.store.save(registry);

        return {
            ok: true,
            message: `Built simple structure with ${blocks.length} blocks.`,
            commands,
        };
    }

    async edit(request) {
        const registry = await this.store.load();
        const project = getActiveProject(registry);
        if (!project) {
            return { ok: false, message: 'No active build project.', commands: [] };
        }

        const part = getActivePart(project);
        if (!part) {
            return { ok: false, message: 'No active selection.', commands: [] };
        }

        const material = normalizeBlock(parseMaterial(request, part.material || 'stone'));
        const changes = part.blockPositions.map((pos) => ({ pos, block: material }));
        const diff = createDiff(this.world, changes, {
            editId: nextEditId(project),
            summary: `replace active selection with ${material}`,
            targetPartIds: project.activeSelection.partIds,
        });
        const commands = diffToCommands(diff);

        applyDiff(this.world, diff);
        executeCommands(this.world, commands);
        part.material = material;
        project.edits.push(diff);
        project.redo = [];
        await this.store.save(registry);

        return {
            ok: true,
            message: `Changed active selection to ${material}.`,
            commands,
        };
    }

    async undo() {
        const registry = await this.store.load();
        const project = getActiveProject(registry);
        if (!project || project.edits.length === 0) {
            return { ok: false, message: 'Nothing to undo.', commands: [] };
        }

        const diff = project.edits.pop();
        const undoDiff = invertDiff(diff);
        const commands = diffToCommands(undoDiff);

        applyDiff(this.world, undoDiff);
        executeCommands(this.world, commands);
        project.redo.push(diff);
        await this.store.save(registry);

        return { ok: true, message: `Undid ${diff.summary}.`, commands };
    }

    async redo() {
        const registry = await this.store.load();
        const project = getActiveProject(registry);
        if (!project || project.redo.length === 0) {
            return { ok: false, message: 'Nothing to redo.', commands: [] };
        }

        const diff = project.redo.pop();
        const commands = diffToCommands(diff);

        applyDiff(this.world, diff);
        executeCommands(this.world, commands);
        project.edits.push(diff);
        await this.store.save(registry);

        return { ok: true, message: `Redid ${diff.summary}.`, commands };
    }

    async status() {
        const registry = await this.store.load();
        const project = getActiveProject(registry);

        return {
            activeProjectId: registry.activeProjectId,
            activeSelection: project?.activeSelection || null,
            editCount: project?.edits.length || 0,
            redoCount: project?.redo.length || 0,
        };
    }
}
