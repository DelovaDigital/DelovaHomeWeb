const EventEmitter = require('events');
const fetch = require('node-fetch');
const fs = require('fs');
const path = require('path');

class HueManager extends EventEmitter {
    constructor() {
        super();
        this.bridges = [];
        this.lights = new Map();
        this.configPath = path.join(__dirname, '../data/hue_config.json');
        this.config = this.loadConfig();
        this.pollingInterval = null;
    }

    loadConfig() {
        try {
            if (fs.existsSync(this.configPath)) {
                return JSON.parse(fs.readFileSync(this.configPath, 'utf8'));
            }
        } catch (e) {
            console.error('[Hue] Error loading config:', e);
        }
        return { bridges: {} }; // { ip: username }
    }

    saveConfig() {
        try {
            const dir = path.dirname(this.configPath);
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }
            fs.writeFileSync(this.configPath, JSON.stringify(this.config, null, 2));
        } catch (e) {
            console.error('[Hue] Error saving config:', e);
        }
    }

    async start() {
        console.log('[Hue] Starting Hue Manager...');
        await this.discoverBridges();
        this.startPolling();
    }

    async discoverBridges() {
        try {
            // N-UPnP discovery
            const res = await fetch('https://discovery.meethue.com/');
            const bridges = await res.json();
            
            for (const b of bridges) {
                const ip = b.internalipaddress;
                if (!this.bridges.find(br => br.ip === ip)) {
                    console.log(`[Hue] Discovered bridge at ${ip}`);
                    this.bridges.push({ id: b.id, ip: ip });
                    
                    // If we have a username for this IP, verify it
                    if (this.config.bridges[ip]) {
                        this.verifyConnection(ip, this.config.bridges[ip]);
                    }
                }
            }
        } catch (e) {
            console.error('[Hue] Discovery failed:', e.message);
        }
    }

    async verifyConnection(ip, username) {
        try {
            const res = await fetch(`http://${ip}/api/${username}/config`);
            const data = await res.json();
            if (data.name) {
                console.log(`[Hue] Connected to bridge at ${ip}`);
                this.fetchLights(ip, username);
            } else {
                console.warn(`[Hue] Connection failed for ${ip}, invalid username?`);
            }
        } catch (e) {
            console.error(`[Hue] Connection check error for ${ip}:`, e.message);
        }
    }

    async pairBridge(ip) {
        try {
            const res = await fetch(`http://${ip}/api`, {
                method: 'POST',
                body: JSON.stringify({ devicetype: 'delovahome#server' })
            });
            const data = await res.json();
            
            if (data[0] && data[0].success) {
                const username = data[0].success.username;
                console.log(`[Hue] Paired with bridge ${ip}, username: ${username}`);
                this.config.bridges[ip] = username;
                this.saveConfig();
                this.fetchLights(ip, username);
                return { success: true, username };
            } else if (data[0] && data[0].error) {
                return { success: false, error: data[0].error.description }; // "link button not pressed"
            }
        } catch (e) {
            return { success: false, error: e.message };
        }
    }

    async fetchLights(ip, username) {
        try {
            const res = await fetch(`http://${ip}/api/${username}/lights`);
            const lights = await res.json();
            
            for (const [id, light] of Object.entries(lights)) {
                const lightObj = {
                    id: `hue_${light.uniqueid}`,
                    nativeId: id,
                    bridgeIp: ip,
                    name: light.name,
                    type: 'light',
                    model: light.modelid,
                    manufacturer: light.manufacturername,
                    reachable: light.state.reachable,
                    on: light.state.on,
                    brightness: light.state.bri ? Math.round(light.state.bri / 2.54) : 0, // 0-100
                    color: light.state.xy ? light.state.xy : null,
                    ct: light.state.ct
                };
                
                this.lights.set(lightObj.id, lightObj);
                this.emit('light_update', lightObj);
            }
        } catch (e) {
            console.error(`[Hue] Error fetching lights from ${ip}:`, e.message);
        }
    }

    async setLightState(id, state) {
        const light = this.lights.get(id);
        if (!light) throw new Error('Light not found');
        
        const username = this.config.bridges[light.bridgeIp];
        if (!username) throw new Error('Bridge not configured');

        const hueState = {};
        if (state.on !== undefined) hueState.on = state.on;
        if (state.brightness !== undefined) hueState.bri = Math.round(state.brightness * 2.54);
        if (state.xy) hueState.xy = state.xy;
        if (state.ct) hueState.ct = state.ct;

        try {
            await fetch(`http://${light.bridgeIp}/api/${username}/lights/${light.nativeId}/state`, {
                method: 'PUT',
                body: JSON.stringify(hueState)
            });
            
            // Optimistic update
            Object.assign(light, state);
            this.emit('light_update', light);
        } catch (e) {
            console.error(`[Hue] Error setting state for ${id}:`, e.message);
            throw e;
        }
    }

    startPolling() {
        if (this.pollingInterval) clearInterval(this.pollingInterval);
        this.pollingInterval = setInterval(() => {
            for (const ip of Object.keys(this.config.bridges)) {
                this.fetchLights(ip, this.config.bridges[ip]);
            }
        }, 5000); // Poll every 5 seconds
    }
}

module.exports = new HueManager();
