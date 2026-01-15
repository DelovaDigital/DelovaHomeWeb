const EventEmitter = require('events');
const fs = require('fs');
const path = require('path');
const cron = require('node-cron');
const deviceManager = require('./deviceManager');

const SCENES_FILE = path.join(__dirname, '../data/scenes.json');
const MAPPINGS_FILE = path.join(__dirname, '../data/scene_mappings.json');

class SceneManager extends EventEmitter {
    constructor() {
        super();
        this.currentMode = 'HOME'; // HOME, AWAY, NIGHT, CINEMA, SLEEP, GUEST, WORK, VACATION
        this.isGuestMode = false;
        this.isVacationMode = false;
        
        this.cronJobs = new Map(); // sceneId -> cronTask
        this.scenes = [];
        this.mappings = {};
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
        this.loadMappings();
        if (this.scenes.length === 0) {
            this.scenes = this.defaultScenes;
            this.save();
        }
        this.initScheduler();
        console.log('[SceneManager] Initialized with mode:', this.currentMode);
    }
    
    initScheduler() {
        this.cronJobs.forEach(job => job.stop());
        this.cronJobs.clear();

        for (const scene of this.scenes) {
            if (scene.schedule && scene.schedule.enabled && scene.schedule.cron) {
                this.scheduleScene(scene.id, scene.schedule.cron);
            }
        }
        console.log(`[SceneManager] Scheduler initialized with ${this.cronJobs.size} active jobs.`);
    }

    scheduleScene(sceneId, cronExpression) {
        // Remove existing job if any
        if (this.cronJobs.has(sceneId)) {
            this.cronJobs.get(sceneId).stop();
            this.cronJobs.delete(sceneId);
        }

        if (cron.validate(cronExpression)) {
            // Check if we should skip due to vacation mode? 
            // Maybe add a property 'skipOnVacation' to the schedule config?
            const job = cron.schedule(cronExpression, () => {
                console.log(`[SceneManager] Executing scheduled scene: ${sceneId}`);
                this.activateScene(sceneId);
            });
            this.cronJobs.set(sceneId, job);
            console.log(`[SceneManager] Scheduled ${sceneId} at '${cronExpression}'`);
        } else {
            console.warn(`[SceneManager] Invalid cron '${cronExpression}' for scene ${sceneId}`);
        }
    }

    removeSchedule(sceneId) {
        if (this.cronJobs.has(sceneId)) {
            this.cronJobs.get(sceneId).stop();
            this.cronJobs.delete(sceneId);
            
            // Update Scene data model
            const scene = this.scenes.find(s => s.id === sceneId);
            if (scene && scene.schedule) {
                scene.schedule.enabled = false;
                this.save();
            }
        }
    }

    updateSceneSchedule(sceneId, scheduleConfig) {
        const scene = this.scenes.find(s => s.id === sceneId);
        if (!scene) return false;

        scene.schedule = { ...scheduleConfig };
        this.save();
        
        if (scene.schedule.enabled && scene.schedule.cron) {
            this.scheduleScene(sceneId, scene.schedule.cron);
        } else {
            this.removeSchedule(sceneId);
        }
        return true;
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

    loadMappings() {
        try {
            if (fs.existsSync(MAPPINGS_FILE)) {
                this.mappings = JSON.parse(fs.readFileSync(MAPPINGS_FILE, 'utf8'));
            } else {
                 // Initialize defaults if missing
                 this.mappings = {
                    "living_main": null,
                    "living_spots": null,
                    "tv_backlight": null,
                    "hallway_light": null,
                    "kitchen_main": null,
                    "kitchen_counter": null,
                    "office_main": null,
                    "tv_living": null,
                    "living_tv": null
                };
                this.saveMappings();
            }
        } catch (e) {
            console.error('[SceneManager] Failed to load mappings:', e);
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

    saveMappings() {
        try {
            const dir = path.dirname(MAPPINGS_FILE);
            if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
            fs.writeFileSync(MAPPINGS_FILE, JSON.stringify(this.mappings, null, 2));
        } catch (e) {
            console.error('[SceneManager] Failed to save mappings:', e);
        }
    }

    getMappings() {
        return this.mappings;
    }

    updateMappings(newMappings) {
        this.mappings = { ...this.mappings, ...newMappings };
        this.saveMappings();
        console.log('[SceneManager] Mappings updated via API');
    }

    resolveDeviceId(abstractId) {
        if (this.mappings && this.mappings[abstractId]) {
            return this.mappings[abstractId];
        }
        return abstractId;
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
                    const targetId = this.resolveDeviceId(action.deviceId);

                    if (targetId === 'all_lights') {
                        // Special macro
                        await this.turnOffAllLights();
                    } else if (targetId === 'all_blinds') {
                        // TODO: Implement blind control loop
                    } else if (targetId) {
                        if (targetId !== action.deviceId) {
                             console.log(`[SceneManager] Mapped ${action.deviceId} -> ${targetId}`);
                        }
                        await deviceManager.controlDevice(targetId, action.command, action.value);
                    } else {
                        console.warn(`[SceneManager] Check mappings: Device ID '${action.deviceId}' is unmapped or null.`);
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
