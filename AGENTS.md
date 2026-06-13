# AGENTS.md

This repository is being developed in Angelo Laub's fork:

- `origin`: `git@github.com:angelol/mindcraft.git`
- `upstream`: `git@github.com:mindcraft-bots/mindcraft.git`
- Do not push to `upstream`. It is intentionally configured with push URL `DISABLED`.

Prefer branches named with the `angelol/` prefix.

## Project Orientation

Mindcraft is a Node.js ESM project that runs LLM-powered Minecraft Java Edition agents through Mineflayer.

The runtime has an important process split:

- `main.js` starts the app, parses CLI args, loads `settings.js`, starts the MindServer, and creates agents from profile JSON.
- `src/mindcraft/mindcraft.js` owns parent-process lifecycle and starts one `AgentProcess` per bot.
- `src/process/agent_process.js` spawns child Node processes.
- `src/process/init_agent.js` runs inside each child process, connects back to MindServer, receives settings, and starts `Agent`.
- `src/agent/agent.js` is the main bot runtime: history, prompting, commands, Mineflayer events, tasks, self-prompting, actions, and memory.
- `src/mindcraft/mindserver.js` is both the web UI host and Socket.IO control plane.

That process boundary matters. If an agent crashes or restarts, the parent MindServer may remain alive. Settings are registered with MindServer, then fetched by the child agent process through `serverProxy.connect`.

## Things That Are Easy To Miss

- `allow_insecure_coding` only permits `!newAction`; it does not force the chat model to choose `!newAction`.
- The "coding agent" is not a separate agent. It is the same agent using `Coder` and the configured `code_model` prompt path.
- `!newAction` generates JavaScript, lints it, stages it under `./bots/<agent>/action-code/`, and evaluates it in a SES compartment from `src/agent/coder.js`.
- The LLM mostly "sees" the world through text query commands, not pixels. `$STATS` expands to `!stats`, `!entities`, and `!nearbyBlocks`; `$INVENTORY` expands separately.
- Vision exists but is disabled by default with `allow_vision: false`; when enabled it uses `!lookAtPlayer` and `!lookAtPosition` to capture screenshots and ask a vision model for a text summary.
- Profiles inherit heavily from `profiles/defaults/_default.json` and the `base_profile` in `settings.js`. `andy.json` is minimal, so most behavior comes from defaults.
- Model adapters are discovered dynamically by `src/models/_model_map.js`; adding a provider usually means adding a model class with a static `prefix`.
- `settings.js` at repo root and `src/agent/settings.js` are both important. The child process receives settings from MindServer and updates the agent settings singleton.
- Several dependencies are patched with `patch-package` under `patches/`; do not assume upstream package behavior exactly matches npm defaults.
- Construction task blueprints exist in `src/agent/tasks/construction_tasks.js`, but they are task/evaluation oriented. They are not yet a robust live creative building system.
- The existing NPC construction code under `src/agent/npc` has useful ideas around structured construction goals, but it is not the target architecture for high-quality iterative builder mode.

## Common Commands

- Install: `npm install`
- Run app: `npm start` or `node main.js`
- Run a task: `node main.js --task_path tasks/basic/single_agent.json --task_id gather_oak_logs`
- Lint availability is via `eslint`, but check `package.json` before assuming a complete test/lint script exists.

Minecraft defaults:

- Host: `127.0.0.1`
- Port: `55916`
- MindServer/UI: `localhost:8080`

## Builder Mode North Star

The north star is not "make `!newAction` write better block-placement code." The target is a separate Creative Builder Core for creative-mode construction using `/setblock` and `/fill`.

Builder mode should feel like a fast creative editing loop:

- User says: "build a big house"
- Then: "add windows on the north side"
- Then: "make them taller"
- Then: "change the frames to stone"
- Then: "add a pool on the roof"
- Then: "add a fire escape"
- Then: "add a wine cellar with a hidden entrance"
- Then: "undo that"

Normal edits should execute immediately. Undo is the safety mechanism for non-destructive edits. Confirmation is reserved for destructive/global operations such as clearing a large region, deleting a full project, replacing an entire structure, or editing outside a configured build area.

Creativity should live in design and geometry generation. Reliability should live in execution:

- The LLM may decide style, proportions, exact shapes, details, materials, and semantic intent.
- The builder core should own persistence, active selection, world scanning, diffs, undo/redo, validation, command optimization, and verification.
- The LLM should not emit raw Minecraft commands as the primary artifact. Raw commands should be generated from validated voxel diffs.

See the current design spec:

- `docs/superpowers/specs/2026-06-13-creative-builder-core-design.md`

Phase 1 is intentionally limited to a Builder Core MVP:

- JSON build registry
- one active project
- active structure/selection
- fake world adapter for tests
- diff model
- undo/redo
- `/setblock` command generation
- simple `/fill` optimization
- minimal Mindcraft commands such as `!build`, `!buildEdit`, `!buildUndo`, `!buildRedo`, and `!buildStatus`

Do not let Phase 1 expand into the full creative geometry system. Rich primitives, scanning/verification, operation planning, preview, and dashboard tooling are later phases in the spec.

## Development Guidance

- Keep changes scoped. This codebase has several large, stateful modules; avoid broad refactors unless directly needed.
- Commit changes at the end of each turn whenever you modify files. Keep commits focused and leave the working tree clean so work can resume safely.
- Prefer adding focused modules for builder-core work instead of embedding more responsibilities into `src/agent/agent.js` or `src/agent/commands/actions.js`.
- For new builder work, use tests around pure builder-core modules first. Use a fake world adapter before requiring a live Minecraft server.
- Preserve user and generated local state under `bots/` unless the task explicitly asks to clean it.
- When editing prompts, remember that examples strongly bias command choice but do not guarantee it.
- When working on GitHub publishing, use Angelo's fork as `origin` and keep `upstream` read-only.
