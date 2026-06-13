export class MinecraftCommandWorld {
    constructor(bot) {
        this.bot = bot;
        this.skipVerification = true;
    }

    getBlock() {
        return 'air';
    }

    setBlocks() {
    }

    executeCommands(commands) {
        for (const command of commands) {
            this.bot.chat(command);
        }
    }
}
