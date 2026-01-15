const deviceManager = require('./deviceManager');
const spotifyManager = require('./spotifyManager');
const logicEngine = require('./logicEngine'); // Integration with Logic Engine
const sceneManager = require('./sceneManager');

class AIManager {
    constructor() {
        this.intents = [
            {
                regex: /(turn|switch)\s+(on|off)\s+(?:the\s+)?(.+)/i,
                handler: this.handlePower.bind(this)
            },
            {
                // Usage: "Turn [device] on" or "Turn lights off"
                regex: /(turn|switch)\s+(?:the\s+)?(.+)\s+(on|off)/i,
                handler: this.handlePowerSuffix.bind(this)
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
            },
            // Logic / Context Queries
            {
                regex: /what\s+is\s+the\s+(?:status|state)\s+of\s+(?:the\s+)?(.+)/i,
                handler: this.handleStatusQuery.bind(this)
            },
            {
                regex: /activate\s+(?:scene|mode)\s+(.+)/i,
                handler: this.handleSceneActivation.bind(this)
            },
            // Fallback for LLM (Simulated)
            // { regex: /.*/, handler: this.handleLLMFallback.bind(this) }
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
            
            // If no regex matched, try "Fuzzy Logic" or "LLM"
            return await this.handleLLMFallback(text);

        } catch (e) {
            console.error('[AI] Error processing command:', e);
            return { ok: false, message: "Sorry, I encountered an error processing that command." };
        }
    }

    // ... (Existing FindDevice) ...
    findDevice(nameQuery) {
        const query = nameQuery.toLowerCase().trim();
        // Exact match
        for (const [id, device] of deviceManager.devices) {
            if (device.name && device.name.toLowerCase() === query) return device;
        }
        // Partial match
        for (const [id, device] of deviceManager.devices) {
            if (device.name && device.name.toLowerCase().includes(query)) return device;
        }
        // Type match (e.g. "lights") - returns first found
        if (query.includes('light')) {
            for (const [id, device] of deviceManager.devices) {
                if (device.type === 'light' || device.type === 'hue') return device;
            }
        }
        // Check Virtual Devices (Template Sensors)
        if (logicEngine.virtualDevices.has(query)) {
             // Logic not fully linked yet for direct control, but good for status
        }
        return null;
    }
    
    async handleStatusQuery(match) {
        const target = match[1];
        const device = this.findDevice(target);
        if (device) {
            let stateStr = "unknown";
            if (device.state.on !== undefined) stateStr = device.state.on ? "ON" : "OFF";
            if (device.state.value !== undefined) stateStr = device.state.value; // For sensors
            return { ok: true, message: `The ${device.name} is currently ${stateStr}.` };
        }
        return { ok: false, message: `I couldn't find a device named "${target}".` };
    }

    async handleSceneActivation(match) {
        const sceneName = match[1].toLowerCase();
        // Convert "cinema mode" -> "CINEMA", "night mode" -> "NIGHT"
        const mode = sceneName.replace('mode', '').trim().toUpperCase();
        
        sceneManager.setMode(mode);
        return { ok: true, message: `Activated ${sceneName} mode.` };
    }

    async handleLLMFallback(text) {
        // Prepare for Local AI Integration (e.g. Ollama)
        // For now, simple keyword extraction for unhandled cases
        if (text.includes('temperature') || text.includes('weather')) {
             // Link to ClimateManager if possible, or just say:
             return { ok: true, message: "I can't read the weather yet, but I'm learning (ClimateManager integration pending)." };
        }
        return { ok: false, message: "I didn't understand that command. Try 'Turn on lights' or 'Play music'." };
    }

    async handlePower(match) {
        const action = match[2].toLowerCase(); // on or off
        const target = match[3];
        
        return this._executePower(target, action);
    }

    async handlePowerSuffix(match) {
        const target = match[2];
        const action = match[3].toLowerCase(); // on or off
        
        return this._executePower(target, action);
    }

    async _executePower(target, action) {
        // Special case for "lights" or "all lights" -> Group Action
        if (target.toLowerCase().includes('lights') || target.toLowerCase().includes('all lights')) {
             const devices = [];
             for (const [id, device] of deviceManager.devices) {
                 if (['light', 'hue', 'dimmer'].includes(device.type)) devices.push(device);
             }
             
             if (devices.length === 0) return { ok: false, message: "No lights found." };
             
             const cmd = action === 'on' ? 'turn_on' : 'turn_off';
             for (const dev of devices) {
                 await deviceManager.controlDevice(dev.id, cmd);
             }
             return { ok: true, message: `Turned ${action} ${devices.length} lights.` };
        }

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
