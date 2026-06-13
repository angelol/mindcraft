import { getBuilderForAgent } from '../../builder-core/agent_builder_session.js';

function formatStatus(status) {
    if (!status.activeProjectId) {
        return 'No active builder project.';
    }

    const selection = status.activeSelection?.partIds?.join(', ') || 'none';
    const lines = [
        `Active builder project: ${status.activeProjectId}`,
        `Active selection: ${selection}`,
        `Undo edits: ${status.editCount}`,
        `Redo edits: ${status.redoCount}`,
    ];

    if (status.lastScan?.drift?.summary) {
        const summary = status.lastScan.drift.summary;
        lines.push(`World drift: ${summary.missing} missing, ${summary.changed} changed, ${summary.unexpected} unexpected.`);
    }

    return lines.join('\n');
}

export const builderActionsList = [
    {
        name: '!build',
        description: 'Build a simple creative-mode structure from a natural language request.',
        params: {
            request: { type: 'string', description: 'The structure to build.' },
        },
        perform: async function(agent, request) {
            const result = await getBuilderForAgent(agent).build(request);
            return result.message;
        },
    },
    {
        name: '!buildEdit',
        description: 'Edit the active builder project from a natural language request.',
        params: {
            request: { type: 'string', description: 'The edit to apply to the active builder project.' },
        },
        perform: async function(agent, request) {
            const result = await getBuilderForAgent(agent).edit(request);
            return result.message;
        },
    },
    {
        name: '!buildUndo',
        description: 'Undo the most recent builder edit.',
        perform: async function(agent) {
            const result = await getBuilderForAgent(agent).undo();
            return result.message;
        },
    },
    {
        name: '!buildRedo',
        description: 'Redo the most recently undone builder edit.',
        perform: async function(agent) {
            const result = await getBuilderForAgent(agent).redo();
            return result.message;
        },
    },
    {
        name: '!buildScan',
        description: 'Scan the active builder project and report registry/world drift.',
        perform: async function(agent) {
            const result = await getBuilderForAgent(agent).scan();
            return result.message;
        },
    },
    {
        name: '!buildRepair',
        description: 'Repair damaged registered blocks in the active builder project or active selection.',
        perform: async function(agent, request = 'repair this') {
            const result = await getBuilderForAgent(agent).repair(request);
            return result.message;
        },
    },
    {
        name: '!buildStatus',
        description: 'Get the active builder project status.',
        perform: async function(agent) {
            const status = await getBuilderForAgent(agent).status();
            return formatStatus(status);
        },
    },
];
