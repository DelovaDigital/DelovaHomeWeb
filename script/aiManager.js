const deviceManager = require('./deviceManager');
const spotifyManager = require('./spotifyManager');

class AIManager {
    constructor() {
        this.intents = [
            {
                regex: /(turn|switch)\s+(on|off)\s+(?:the\s+)?(.+)/i,
                handler: this.handlePower.bind(this)
            },
            {
                regex: /set\s+(?:the\s+)?(.+?)\s+(?:brightness|level)\s+to\s+(\d+)%?/i,
                handler: this.handleBrightness.bind(this)
            },
            {
                regex: /(wake|start|boot)\s+(?:up\s+)?(?:the\s+)?(.+)/i,
                handler: this.handleWake.bind(this)
            },
            {
                regex: /(play|pause|stop|next|previous|skip)\s*(?:music|song|track)?/i,
                handler: this.handleMedia.bind(this)
            }
        ];
    }

    async processCommand(text) {
        console.log(`[AI] Processing command: "${text}"`);
        
        try {
            for (const intent of this.intents) {
                const match = text.match(intent.regex);
                if (match) {
                    return await intent.handler(match);
                }
            }
        } catch (e) {
            console.error('[AI] Error processing command:', e);
            return { ok: false, message: "Sorry, I encountered an error processing that command." };
        }

        return { ok: false, message: "I didn't understand that command. Try 'Turn on lights' or 'Play music'." };
    }

    findDevice(nameQuery) {
        const query = nameQuery.toLowerCase().trim();
        // Exact match
        for (const [id, device] of deviceManager.devices) {
            if (device.name.toLowerCase() === query) return device;
        }
        // Partial match
        for (const [id, device] of deviceManager.devices) {
            if (device.name.toLowerCase().includes(query)) return device;
        }
        // Type match (e.g. "lights") - returns first found
        if (query.includes('light')) {
            for (const [id, device] of deviceManager.devices) {
                if (device.type === 'light' || device.type === 'hue') return device;
            }
        }
        return null;
    }

    async handlePower(match) {
        const action = match[2].toLowerCase(); // on or off
        const target = match[3];
        
        const device = this.findDevice(target);
        if (!device) return { ok: false, message: `Device "${target}" not found.` };

        const cmd = action === 'on' ? 'turn_on' : 'turn_off';
        await deviceManager.controlDevice(device.id, cmd);
        return { ok: true, message: `Turned ${action} ${device.name}.` };
    }

    async handleBrightness(match) {
        const target = match[1];
        const level = parseInt(match[2]);
        
        const device = this.findDevice(target);
        if (!device) return { ok: false, message: `Device "${target}" not found.` };

        await deviceManager.controlDevice(device.id, 'set_brightness', level);
        return { ok: true, message: `Set ${device.name} brightness to ${level}%.` };
    }

    async handleWake(match) {
        const target = match[2];
        const device = this.findDevice(target);
        
        if (!device) return { ok: false, message: `Device "${target}" not found.` };
        
        if (['pc', 'nas', 'rpi', 'console', 'ps5'].includes(device.type)) {
            const cmd = device.type === 'ps5' ? 'wake' : 'wake'; // Both use wake internally usually
            await deviceManager.controlDevice(device.id, cmd);
            return { ok: true, message: `Waking up ${device.name}...` };
        }
        
        return { ok: false, message: `${device.name} does not support wake-on-lan.` };
    }

    async handleMedia(match) {
        const action = match[1].toLowerCase();
        
        if (action === 'play') await spotifyManager.play();
        else if (action === 'pause' || action === 'stop') await spotifyManager.pause();
        else if (action === 'next' || action === 'skip') await spotifyManager.next();
        else if (action === 'previous') await spotifyManager.previous();
        
        return { ok: true, message: `Media: ${action}` };
    }
}

module.exports = new AIManager();
