import path from 'node:path';
import { BuilderCore } from './core.js';
import { JsonRegistryStore } from './registry_store.js';
import { MinecraftCommandWorld } from './world_adapters/minecraft_command_world.js';

const buildersByAgent = new WeakMap();

function getBotBlockPosition(bot) {
    const position = bot?.entity?.position;
    if (!position) {
        return [0, 0, 0];
    }

    return [
        Math.floor(Number(position.x) || 0),
        Math.floor(Number(position.y) || 0),
        Math.floor(Number(position.z) || 0),
    ];
}

export function getBuilderForAgent(agent) {
    if (buildersByAgent.has(agent)) {
        return buildersByAgent.get(agent);
    }

    const registryPath = path.join('bots', agent.name, 'builder-registry.json');
    const builder = new BuilderCore({
        store: new JsonRegistryStore(registryPath),
        world: new MinecraftCommandWorld(agent.bot),
        originProvider: () => getBotBlockPosition(agent.bot),
    });
    buildersByAgent.set(agent, builder);

    return builder;
}
