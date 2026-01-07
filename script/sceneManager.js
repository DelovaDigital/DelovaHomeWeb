const EventEmitter = require('events');
const fs = require('fs');
const path = require('path');
const deviceManager = require('./deviceManager');

const SCENES_FILE = path.join(__dirname, '../data/scenes.json');

class SceneManager extends EventEmitter {
    constructor() {
        super();
        this.currentMode = 'HOME'; // HOME, AWAY, NIGHT, CINEMA, SLEEP, GUEST
        this.scenes = [];
        this.defaultScenes = [
            {
                id: 'mode_home',
                name: 'Home',
                icon: 'fas fa-home',
                color: '#3b82f6',
                actions: [
                    { type: 'device', command: 'turn_on', deviceId: 'hallway_light' }
                ]
            },
            {
                id: 'mode_away',
                name: 'Away',
                icon: 'fas fa-sign-out-alt',
                color: '#64748b',
                actions: [
                    { type: 'device', command: 'turn_off', deviceId: 'all_lights' },
                    { type: 'device', command: 'turn_off', deviceId: 'tv_living' }
                ]
            },
            {
                id: 'mode_night',
                name: 'Night',
                icon: 'fas fa-moon',
                color: '#8b5cf6',
                actions: [
                    { type: 'device', command: 'set_brightness', deviceId: 'hallway_light', value: 10 },
                    { type: 'device', command: 'turn_off', deviceId: 'kitchen_main' }
                ]
            },
            {
                id: 'mode_cinema',
                name: 'Cinema',
                icon: 'fas fa-film',
                color: '#ef4444',
                actions: [
                    { type: 'device', command: 'set_brightness', deviceId: 'living_spots', value: 20 },
                    { type: 'device', command: 'turn_off', deviceId: 'living_main' },
                    { type: 'device', command: 'turn_on', deviceId: 'tv_backlight' }
                ]
            }
        ];
    }

    init() {
        this.load();
        if (this.scenes.length === 0) {
            this.scenes = this.defaultScenes;
            this.save();
        }
        console.log('[SceneManager] Initialized with mode:', this.currentMode);
    }

    load() {
        try {
            if (fs.existsSync(SCENES_FILE)) {
                this.scenes = JSON.parse(fs.readFileSync(SCENES_FILE, 'utf8'));
            }
        } catch (e) {
            console.error('[SceneManager] Failed to load scenes:', e);
        }
    }

    save() {
        try {
            // Ensure data directory exists
            const dir = path.dirname(SCENES_FILE);
            if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
            
            fs.writeFileSync(SCENES_FILE, JSON.stringify(this.scenes, null, 2));
        } catch (e) {
            console.error('[SceneManager] Failed to save scenes:', e);
        }
    }

    getMode() {
        return this.currentMode;
    }

    setMode(mode) {
        if (this.currentMode === mode) return;
        
        console.log(`[SceneManager] Switching mode: ${this.currentMode} -> ${mode}`);
        this.currentMode = mode;
        this.emit('mode-changed', mode);

        // Find associated scene for this mode (convention: id = "mode_" + lowercase)
        const sceneId = `mode_${mode.toLowerCase()}`;
        this.activateScene(sceneId);
    }

    async activateScene(sceneId) {
        const scene = this.scenes.find(s => s.id === sceneId);
        
        // Also check if sceneId matches a name "Cinema" -> "mode_cinema"
        if (!scene) {
             const byName = this.scenes.find(s => s.name.toLowerCase() === sceneId.toLowerCase());
             if (byName) {
                 return this.activateScene(byName.id);
             }
             // Or maybe it's a dynamic mode set manually?
             if (sceneId.startsWith('mode_')) {
                 this.currentMode = sceneId.replace('mode_', '').toUpperCase();
                 this.emit('mode-changed', this.currentMode);
             }
             console.warn(`[SceneManager] Scene '${sceneId}' not found.`);
             return;
        }

        console.log(`[SceneManager] Activating Scene: ${scene.name}`);
        
        // If this scene corresponds to a known mode, update currentMode
        if (scene.id.startsWith('mode_')) {
            const newMode = scene.id.replace('mode_', '').toUpperCase();
            if (this.currentMode !== newMode) {
                this.currentMode = newMode;
                this.emit('mode-changed', this.currentMode);
            }
        }

        for (const action of scene.actions) {
            try {
                if (action.type === 'device') {
                    if (action.deviceId === 'all_lights') {
                        // Special macro
                        await this.turnOffAllLights();
                    } else {
                        await deviceManager.controlDevice(action.deviceId, action.command, action.value);
                    }
                } else if (action.type === 'delay') {
                    await new Promise(r => setTimeout(r, action.duration || 1000));
                }
            } catch (e) {
                console.error(`[SceneManager] Action failed for ${scene.name}:`, e.message);
            }
        }
    }

    async turnOffAllLights() {
        const devices = deviceManager.getAllDevices();
        const lights = devices.filter(d => 
            (d.type.includes('light') || d.type.includes('hue') || d.type.includes('lamp')) && 
            d.state && d.state.on
        );
        console.log(`[SceneManager] Turning off ${lights.length} lights.`);
        for (const l of lights) {
            deviceManager.controlDevice(l.id, 'turn_off').catch(() => {});
        }
    }

    getScenes() {
        return this.scenes;
    }
}

module.exports = new SceneManager();
