const EventEmitter = require('events');
const fs = require('fs');
const path = require('path');
const deviceManager = require('./deviceManager');

const SCENES_FILE = path.join(__dirname, '../data/scenes.json');

class SceneManager extends EventEmitter {
    constructor() {
        super();
        this.currentMode = 'HOME'; // HOME, AWAY, NIGHT, CINEMA, SLEEP, GUEST, WORK, VACATION
        this.isGuestMode = false;
        this.isVacationMode = false;

        this.scenes = [];
        this.defaultScenes = [
            {
                id: 'mode_home',
                name: 'Thuis',
                icon: 'fas fa-home',
                color: '#3b82f6',
                actions: [
                    { type: 'device', command: 'turn_on', deviceId: 'hallway_light' },
                    { type: 'system', command: 'security_disarm' }
                ]
            },
            {
                id: 'mode_away',
                name: 'Weg',
                icon: 'fas fa-sign-out-alt',
                color: '#64748b',
                actions: [
                    { type: 'device', command: 'turn_off', deviceId: 'all_lights' },
                    { type: 'device', command: 'turn_off', deviceId: 'tv_living' },
                    { type: 'system', command: 'security_arm_away' }
                ]
            },
            {
                id: 'mode_night',
                name: 'Nacht',
                icon: 'fas fa-moon',
                color: '#8b5cf6',
                actions: [
                    { type: 'device', command: 'set_brightness', deviceId: 'hallway_light', value: 10 },
                    { type: 'device', command: 'turn_off', deviceId: 'kitchen_main' },
                    { type: 'system', command: 'security_arm_home' }
                ]
            },
            {
                id: 'mode_morning',
                name: 'Ochtend',
                icon: 'fas fa-coffee',
                color: '#f59e0b',
                actions: [
                    { type: 'device', command: 'turn_on', deviceId: 'kitchen_counter' },
                    { type: 'device', command: 'set_brightness', deviceId: 'living_main', value: 50 },
                    { type: 'device', command: 'open', deviceId: 'all_blinds' }
                ]
            },
            {
                id: 'mode_work',
                name: 'Werk',
                icon: 'fas fa-laptop-code',
                color: '#10b981',
                actions: [
                    { type: 'device', command: 'turn_on', deviceId: 'office_main' },
                    { type: 'device', command: 'turn_off', deviceId: 'living_tv' }
                    // Future: Notifications mute
                ]
            },
            {
                id: 'mode_cinema',
                name: 'Cinema',
                icon: 'fas fa-film',
                color: '#ef4444',
                actions: [
                    // Use generic search terms that match likely real device names
                    { type: 'device', command: 'turn_off', deviceId: 'living_main' }, // Searches "living main" or "living"
                    { type: 'device', command: 'set_brightness', deviceId: 'living_spots', value: 20 },
                    // { type: 'device', command: 'close', deviceId: 'living_blinds' },
                    { type: 'device', command: 'turn_on', deviceId: 'tv_backlight' }
                ]
            },
            {
                id: 'mode_party',
                name: 'Party',
                icon: 'fas fa-glass-cheers',
                color: '#ec4899',
                actions: [
                    { type: 'device', command: 'turn_on', deviceId: 'living_main' },
                    { type: 'device', command: 'set_color', deviceId: 'living_spots', value: '#ff00ff' }, 
                    { type: 'device', command: 'turn_on', deviceId: 'kitchen_main' }
                ]
            },
            {
                id: 'mode_vacation',
                name: 'Vakantie',
                icon: 'fas fa-plane',
                color: '#ec4899',
                actions: [
                    { type: 'system', command: 'set_vacation_mode', value: true },
                    { type: 'system', command: 'security_arm_away' }
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

        // Lazy load modules to allow circular dependency resolution
        if (!this.securityManager) {
             try { this.securityManager = require('./securityManager'); } catch(e) {}
        }

        for (const action of scene.actions) {
            try {
                if (action.type === 'device') {
                    if (action.deviceId === 'all_lights') {
                        // Special macro
                        await this.turnOffAllLights();
                    } else if (action.deviceId === 'all_blinds') {
                        // TODO: Implement blind control loop
                    } else {
                        await deviceManager.controlDevice(action.deviceId, action.command, action.value);
                    }
                } else if (action.type === 'system') {
                    await this.handleSystemAction(action);
                } else if (action.type === 'delay') {
                    await new Promise(r => setTimeout(r, action.duration || 1000));
                }
            } catch (e) {
                console.error(`[SceneManager] Action failed for ${scene.name}:`, e.message);
            }
        }
    }

    async handleSystemAction(action) {
        if (!this.securityManager) this.securityManager = require('./securityManager');

        switch(action.command) {
            case 'security_arm_away':
                this.securityManager.setMode('armed_away');
                break;
            case 'security_arm_home':
                this.securityManager.setMode('armed_home');
                break;
            case 'security_disarm':
                this.securityManager.setMode('disarmed');
                break;
            case 'set_vacation_mode':
                this.isVacationMode = !!action.value;
                this.emit('vacation-mode-changed', this.isVacationMode);
                break;
            case 'set_guest_mode':
                this.isGuestMode = !!action.value;
                break;
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
