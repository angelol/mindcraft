import { Vec3 } from 'vec3';
import { spawn } from 'node:child_process';
import fs from 'fs';

export class VisionInterpreter {
    constructor(agent, allow_vision, options = {}) {
        this.agent = agent;
        this.allow_vision = allow_vision;
        this.fp = './bots/'+agent.name+'/screenshots/';
        this.cameraPromise = null;
        this.cameraHealthCheckPromise = null;
        this.cameraReadyTimeoutMs = options.cameraReadyTimeoutMs ?? 5000;
        this.cameraHealthCheckTimeoutMs = options.cameraHealthCheckTimeoutMs ?? 3000;
        this.skipCameraHealthCheck = options.skipCameraHealthCheck ?? false;
    }

    async _initCamera() {
        const { Camera } = await import('./camera.js');
        const camera = new Camera(this.agent.bot, this.fp);
        await withTimeout(
            new Promise((resolve) => camera.once('ready', resolve)),
            this.cameraReadyTimeoutMs,
            'camera did not become ready'
        );
        return camera;
    }

    async _getCamera() {
        await this._checkCameraRuntime();
        if (!this.cameraPromise) {
            this.cameraPromise = withTimeout(
                this._initCamera(),
                this.cameraReadyTimeoutMs,
                'camera did not become ready'
            );
        }
        return await this.cameraPromise;
    }

    async _checkCameraRuntime() {
        if (this.skipCameraHealthCheck) {
            return;
        }
        if (!this.cameraHealthCheckPromise) {
            this.cameraHealthCheckPromise = checkCameraRuntime(this.cameraHealthCheckTimeoutMs);
        }
        return await this.cameraHealthCheckPromise;
    }

    _visionUnavailable(error) {
        return `Vision is unavailable: ${error.message}. Use text world queries instead.`;
    }

    async lookAtPlayer(player_name, direction) {
        if (!this.allow_vision || !this.agent.prompter.vision_model.sendVisionRequest) {
            return "Vision is disabled. Use other methods to describe the environment.";
        }
        let result = "";
        const bot = this.agent.bot;
        const player = bot.players[player_name]?.entity;
        if (!player) {
            return `Could not find player ${player_name}`;
        }

        let filename;
        if (direction === 'with') {
            await bot.look(player.yaw, player.pitch);
            result = `Looking in the same direction as ${player_name}\n`;
            try {
                filename = await (await this._getCamera()).capture();
            } catch (error) {
                return this._visionUnavailable(error);
            }
        } else {
            await bot.lookAt(new Vec3(player.position.x, player.position.y + player.height, player.position.z));
            result = `Looking at player ${player_name}\n`;
            try {
                filename = await (await this._getCamera()).capture();
            } catch (error) {
                return this._visionUnavailable(error);
            }

        }

        return result + `Image analysis: "${await this.analyzeImage(filename)}"`;
    }

    async lookAtPosition(x, y, z) {
        if (!this.allow_vision || !this.agent.prompter.vision_model.sendVisionRequest) {
            return "Vision is disabled. Use other methods to describe the environment.";
        }
        let result = "";
        const bot = this.agent.bot;
        await bot.lookAt(new Vec3(x, y + 2, z));
        result = `Looking at coordinate ${x}, ${y}, ${z}\n`;

        let filename;
        try {
            filename = await (await this._getCamera()).capture();
        } catch (error) {
            return this._visionUnavailable(error);
        }

        return result + `Image analysis: "${await this.analyzeImage(filename)}"`;
    }

    getCenterBlockInfo() {
        const bot = this.agent.bot;
        const maxDistance = 128; // Maximum distance to check for blocks
        const targetBlock = bot.blockAtCursor(maxDistance);
        
        if (targetBlock) {
            return `Block at center view: ${targetBlock.name} at (${targetBlock.position.x}, ${targetBlock.position.y}, ${targetBlock.position.z})`;
        } else {
            return "No block in center view";
        }
    }

    async analyzeImage(filename) {
        try {
            const imageBuffer = fs.readFileSync(`${this.fp}/${filename}.jpg`);
            const messages = this.agent.history.getHistory();

            const blockInfo = this.getCenterBlockInfo();
            const result = await this.agent.prompter.promptVision(messages, imageBuffer);
            return result + `\n${blockInfo}`;

        } catch (error) {
            console.warn('Error reading image:', error);
            return `Error reading image: ${error.message}`;
        }
    }
}

function withTimeout(promise, timeoutMs, message) {
    let timeout;
    const timeoutPromise = new Promise((_, reject) => {
        timeout = setTimeout(() => reject(new Error(message)), timeoutMs);
    });
    return Promise.race([promise, timeoutPromise]).finally(() => clearTimeout(timeout));
}

function checkCameraRuntime(timeoutMs) {
    return new Promise((resolve, reject) => {
        const child = spawn(
            process.execPath,
            ['--input-type=module', '-e', "await import('./src/agent/vision/camera.js');"],
            {
                cwd: process.cwd(),
                stdio: ['ignore', 'ignore', 'pipe'],
            }
        );
        let stderr = '';
        const timeout = setTimeout(() => {
            child.kill('SIGKILL');
            reject(new Error('camera native dependencies did not load'));
        }, timeoutMs);
        child.stderr.on('data', (chunk) => {
            stderr += chunk;
        });
        child.on('error', (error) => {
            clearTimeout(timeout);
            reject(error);
        });
        child.on('exit', (code) => {
            clearTimeout(timeout);
            if (code === 0) {
                resolve();
            } else {
                reject(new Error(`camera native dependencies failed to load${stderr ? `: ${stderr.trim()}` : ''}`));
            }
        });
    });
}
