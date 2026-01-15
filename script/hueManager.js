const EventEmitter = require('events');
const fetch = require('node-fetch');
const fs = require('fs');
const path = require('path');
const { Bonjour } = require('bonjour-service');

class HueManager extends EventEmitter {
    constructor() {
        super();
        this.bridges = [];
        this.lights = new Map();
        this.configPath = path.join(__dirname, '../data/hue_config.json');
        this.config = this.loadConfig();
        this.pollingInterval = null;
        this.bonjour = new Bonjour();
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
        console.log('[Hue] Starting discovery via mDNS and N-UPnP...');
        
        // Method 1: mDNS Discovery (Local, Reliable)
        try {
            this.bonjour.find({ type: 'hue' }, (service) => {
                // service.referer.address might be IPv4 or ipv6
                const ip = service.addresses && service.addresses.find(a => a.match(/^\d+\.\d+\.\d+\.\d+$/)) || service.referer.address;
                if (ip) {
                    this.addBridge(ip, service.name);
                }
            });
            // Also search for general _http._tcp as some older bridges might use that, but 'hue' is standard now.
        } catch (e) {
            console.error('[Hue] mDNS error:', e.message);
        }

        // Method 2: N-UPnP (Cloud, fallback)
        try {
            const res = await fetch('https://discovery.meethue.com/');
            if (res.ok) {
                const text = await res.text();
                // Check if empty or not json
                if (text && text.length > 0) {
                   try {
                       const bridges = JSON.parse(text);
                       for (const b of bridges) {
                           this.addBridge(b.internalipaddress, b.id);
                       }
                   } catch(parseErr) {
                       console.warn('[Hue] N-UPnP response was not valid JSON:', text.substring(0, 50));
                   }
                }
            }
        } catch (e) {
            console.error('[Hue] Cloud discovery failed (this is expected if internet is down or API is deprecated):', e.message);
        }
    }

    addBridge(ip, id) {
        if (!ip) return;
        if (!this.bridges.find(br => br.ip === ip)) {
            console.log(`[Hue] Discovered bridge at ${ip} (ID: ${id || 'unknown'})`);
            this.bridges.push({ id: id, ip: ip });
            
            // If we have a username for this IP, verify it
            if (this.config.bridges[ip]) {
                this.verifyConnection(ip, this.config.bridges[ip]);
            }
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
