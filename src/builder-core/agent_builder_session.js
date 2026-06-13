import path from 'node:path';
import { BuilderCore } from './core.js';
import { JsonRegistryStore } from './registry_store.js';
import { MinecraftCommandWorld } from './world_adapters/minecraft_command_world.js';

const buildersByAgent = new WeakMap();

export function getBuilderForAgent(agent) {
    if (buildersByAgent.has(agent)) {
        return buildersByAgent.get(agent);
    }

    const registryPath = path.join('bots', agent.name, 'builder-registry.json');
    const builder = new BuilderCore({
        store: new JsonRegistryStore(registryPath),
        world: new MinecraftCommandWorld(agent.bot),
    });
    buildersByAgent.set(agent, builder);

    return builder;
}
