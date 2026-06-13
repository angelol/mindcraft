import { diffToCommands } from './command_optimizer.js';
import { applyDiff, createDiff, invertDiff } from './diff.js';
import { normalizeBlock, normalizePos, posKey, sortBlockStates } from './block_state.js';

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

function isWindowRequest(request) {
    return /\bwindows?\b/i.test(String(request));
}

function isResizeRequest(request) {
    return /\b(resize|bigger|larger|smaller|shrink|wider)\b/i.test(String(request));
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
        nextEditNumber: 2,
        blockStates: applyBlockStates([], blocks),
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

function consumeNextEditId(project) {
    const editNumber = Number.isInteger(project.nextEditNumber)
        ? project.nextEditNumber
        : project.edits.length + project.redo.length + 1;
    project.nextEditNumber = editNumber + 1;
    return `edit_${String(editNumber).padStart(3, '0')}`;
}

function executeCommands(world, commands) {
    if (typeof world.executeCommands === 'function') {
        world.executeCommands(commands);
    }
}

function applyDiffToWorld(world, diff, side = 'after') {
    if (typeof world.setBlocks === 'function') {
        applyDiff(world, diff, side);
    }
}

function applyBlockStates(blockStates, states) {
    const byPos = new Map();
    for (const state of blockStates || []) {
        const pos = normalizePos(state.pos);
        const block = normalizeBlock(state.block);
        if (block !== 'air') {
            byPos.set(posKey(pos), { pos, block });
        }
    }

    for (const state of states) {
        const pos = normalizePos(state.pos);
        const block = normalizeBlock(state.block);
        const key = posKey(pos);
        if (block === 'air') {
            byPos.delete(key);
        } else {
            byPos.set(key, { pos, block });
        }
    }

    return sortBlockStates(Array.from(byPos.values()));
}

function createProjectStateWorld(project) {
    const byPos = new Map();
    for (const state of project.blockStates || []) {
        byPos.set(posKey(state.pos), normalizeBlock(state.block));
    }

    return {
        getBlock(pos) {
            return byPos.get(posKey(pos)) || 'air';
        },
    };
}

function updateProjectBlockStates(project, diff, side = 'after') {
    project.blockStates = applyBlockStates(project.blockStates || [], diff[side]);
}

function updateTargetPartMaterials(project, diff, side = 'after') {
    const material = diff[side].find((state) => normalizeBlock(state.block) !== 'air')?.block;
    if (!material) {
        return;
    }

    for (const partId of diff.targetPartIds || []) {
        if (project.parts?.[partId]) {
            project.parts[partId].material = material;
        }
    }
}

function hasPosition(positions, pos) {
    return positions.has(posKey(pos));
}

function snapshotProjectMetadata(project) {
    return structuredClone({
        bounds: project.bounds,
        activeSelection: project.activeSelection,
        parts: project.parts,
    });
}

function applyProjectMetadataSnapshot(project, snapshot) {
    if (!snapshot) {
        return;
    }

    project.bounds = structuredClone(snapshot.bounds);
    project.activeSelection = structuredClone(snapshot.activeSelection);
    project.parts = structuredClone(snapshot.parts);
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
        const diff = createDiff(createProjectStateWorld({ blockStates: [] }), blocks, {
            editId: 'edit_001',
            summary: 'build simple structure',
            targetPartIds: ['main_structure'],
        });
        const commands = diffToCommands(diff);

        applyDiffToWorld(this.world, diff);
        executeCommands(this.world, commands);
        updateProjectBlockStates(project, diff);
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

        if (isWindowRequest(request)) {
            return this.addWindowRow(registry, project);
        }

        if (isResizeRequest(request)) {
            return this.resizeStructure(registry, project, request);
        }

        const part = getActivePart(project);
        if (!part) {
            return { ok: false, message: 'No active selection.', commands: [] };
        }

        const material = normalizeBlock(parseMaterial(request, part.material || 'stone'));
        const changes = part.blockPositions.map((pos) => ({ pos, block: material }));
        const diff = createDiff(createProjectStateWorld(project), changes, {
            editId: consumeNextEditId(project),
            summary: `replace active selection with ${material}`,
            targetPartIds: project.activeSelection.partIds,
        });
        const commands = diffToCommands(diff);

        applyDiffToWorld(this.world, diff);
        executeCommands(this.world, commands);
        updateProjectBlockStates(project, diff);
        updateTargetPartMaterials(project, diff);
        project.edits.push(diff);
        project.redo = [];
        await this.store.save(registry);

        return {
            ok: true,
            message: `Changed active selection to ${material}.`,
            commands,
        };
    }

    async addWindowRow(registry, project) {
        const projectBefore = snapshotProjectMetadata(project);
        const bounds = project.bounds;
        const y = Math.min(bounds.max[1], bounds.min[1] + 2);
        const z = bounds.min[2];
        const blockPositions = [];

        for (let x = bounds.min[0] + 1; x < bounds.max[0]; x++) {
            blockPositions.push([x, y, z]);
        }

        const changes = blockPositions.map((pos) => ({ pos, block: 'glass_pane' }));
        const diff = createDiff(createProjectStateWorld(project), changes, {
            editId: consumeNextEditId(project),
            summary: 'add window row',
            targetPartIds: ['window_row_001'],
        });
        const commands = diffToCommands(diff);

        applyDiffToWorld(this.world, diff);
        executeCommands(this.world, commands);
        updateProjectBlockStates(project, diff);
        project.parts.window_row_001 = {
            id: 'window_row_001',
            type: 'window_row',
            material: 'glass_pane',
            blockPositions,
        };
        project.activeSelection = {
            targetId: 'window_row_001',
            partIds: ['window_row_001'],
        };
        diff.projectBefore = projectBefore;
        diff.projectAfter = snapshotProjectMetadata(project);
        project.edits.push(diff);
        project.redo = [];
        await this.store.save(registry);

        return {
            ok: true,
            message: `Added window row with ${blockPositions.length} blocks.`,
            commands,
        };
    }

    async resizeStructure(registry, project, request) {
        const mainStructure = project.parts?.main_structure;
        if (!mainStructure) {
            return { ok: false, message: 'No main structure to resize.', commands: [] };
        }

        const projectBefore = snapshotProjectMetadata(project);
        const dimensions = parseDimensions(request);
        const material = normalizeBlock(mainStructure.material || 'stone');
        const nextBlocks = createRectBlocks({ ...dimensions, material });
        const oldPositions = new Set((mainStructure.blockPositions || []).map((pos) => posKey(pos)));
        const nextPositions = new Set(nextBlocks.map((block) => posKey(block.pos)));
        const removals = (mainStructure.blockPositions || [])
            .filter((pos) => !hasPosition(nextPositions, pos))
            .map((pos) => ({ pos, block: 'air' }));
        const additions = nextBlocks.filter((block) => !hasPosition(oldPositions, block.pos));
        const changes = [...removals, ...additions];
        const diff = createDiff(createProjectStateWorld(project), changes, {
            editId: consumeNextEditId(project),
            summary: 'resize simple structure',
            targetPartIds: ['main_structure'],
        });
        const commands = diffToCommands(diff);

        applyDiffToWorld(this.world, diff);
        executeCommands(this.world, commands);
        updateProjectBlockStates(project, diff);
        project.bounds = {
            min: [0, 0, 0],
            max: [dimensions.width - 1, dimensions.height - 1, dimensions.depth - 1],
        };
        mainStructure.blockPositions = nextBlocks.map((block) => normalizePos(block.pos));
        project.activeSelection = {
            targetId: 'main_structure',
            partIds: ['main_structure'],
        };
        diff.projectBefore = projectBefore;
        diff.projectAfter = snapshotProjectMetadata(project);
        project.edits.push(diff);
        project.redo = [];
        await this.store.save(registry);

        return {
            ok: true,
            message: `Resized simple structure to ${dimensions.width}x${dimensions.height}x${dimensions.depth}.`,
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

        applyDiffToWorld(this.world, undoDiff);
        executeCommands(this.world, commands);
        updateProjectBlockStates(project, undoDiff);
        updateTargetPartMaterials(project, diff, 'before');
        applyProjectMetadataSnapshot(project, diff.projectBefore);
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

        applyDiffToWorld(this.world, diff);
        executeCommands(this.world, commands);
        updateProjectBlockStates(project, diff);
        updateTargetPartMaterials(project, diff);
        applyProjectMetadataSnapshot(project, diff.projectAfter);
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
