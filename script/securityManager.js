const EventEmitter = require('events');
const deviceManager = require('./deviceManager');
const presenceManager = require('./presenceManager');
// const notificationManager = require('./notificationManager'); // Future

class SecurityManager extends EventEmitter {
    constructor() {
        super();
        // Modes: 'disarmed', 'armed_home', 'armed_away'
        this.mode = 'disarmed';
        this.status = 'ok'; // 'ok', 'triggered', 'warning'
        this.pin = '1234'; 
        
        // Configuration
        this.config = {
            autoArm: true,      // Auto arm when everyone leaves
            entryDelay: 30000,  // ms to disarm after breach
            exitDelay: 60000,   // ms to leave after arming
            ignoredSensors: []  // Sensor IDs to ignore
        };

        this.activeAlarms = new Set();
        this.triggerTimer = null;

        this.init();
    }

    init() {
        // 1. LISTEN TO SENSORS (Sensor Fusion)
        deviceManager.on('device-updated', (device) => {
             // Fail-safe: Lock Monitoring
             if (device.type === 'lock' || (device.capabilities && device.capabilities.includes('lock'))) {
                 this.handleLockUpdate(device);
             }

             // Only interested in sensors
             if (!device.type.includes('sensor')) return;
             
             this.handleSensorUpdate(device);
        });

        // 2. LISTEN TO PRESENCE (Context)
        presenceManager.on('home-state-changed', (state) => {
            console.log(`[Security] Presence state changed to: ${state}`);
            if (this.config.autoArm) {
                if (state === 'away' && this.mode === 'disarmed') {
                    console.log('[Security] Everyone left. Auto-arming (Armed Away)...');
                    this.setMode('armed_away');
                } else if (state === 'home' && this.mode === 'armed_away') {
                    console.log('[Security] Someone arrived. Auto-disarming...');
                    this.setMode('disarmed');
                }
            }
        });
    }

    setMode(newMode, pin = null) {
        if (pin && pin !== this.pin) {
            console.warn('[Security] Invalid PIN attempt');
            return false;
        }

        if (this.mode === newMode) return true;

        console.log(`[Security] Changing mode: ${this.mode} -> ${newMode}`);
        this.mode = newMode;

        if (newMode === 'disarmed') {
            this.status = 'ok';
            this.activeAlarms.clear();
            if (this.triggerTimer) clearTimeout(this.triggerTimer);
            this.stopAlarmActions();
        }

        this.emit('mode-changed', { mode: this.mode, status: this.status });
        return true;
    }

    handleLockUpdate(device) {
        if (device.state && (device.state.status === 'jammed' || device.state.jammed === true)) {
             console.error(`[Security] CRITICAL: Lock ${device.name} is JAMMED!`);
             this.status = 'warning';
             this.emit('security-warning', { message: `Slot geblokkeerd: ${device.name}` });
             
             // If armed, trigger alarm? Maybe just warning locally.
             if (this.mode !== 'disarmed') {
                 // this.triggerAlarm(`Lock Jammed: ${device.name}`);
             }
        }
        
        // Failsafe: If mode is armed, and lock becomes unlocked?
        if (this.mode !== 'disarmed' && device.state.locked === false) {
             console.warn(`[Security] Lock ${device.name} unlocked while ARMED!`);
             // We consider this a breach implicitly if it wasn't authorized
             // For now, logging.
        }
    }

    handleSensorUpdate(device) {
        if (this.mode === 'disarmed') return;

        // Is this a triggering event?
        // Motion: state.presence, state.occupancy, state.motion
        // Door/Window: state.contact (false=open usually), state.open (true)
        let isTrigger = false;
        let sensorType = 'unknown';

        if (device.name && (device.name.toLowerCase().includes('motion') || device.name.toLowerCase().includes('pir'))) {
            sensorType = 'motion';
            // Motion logic
            if (device.state && (device.state.motion || device.state.occupancy || device.state.presence)) {
                isTrigger = true;
            }
        } else if (device.name && (device.name.toLowerCase().includes('door') || device.name.toLowerCase().includes('window') || device.name.toLowerCase().includes('contact'))) {
            sensorType = 'contact';
            // Contact logic: usually contact=false means open
            if (device.state) {
                 if (device.state.open === true) isTrigger = true;
                 else if (device.state.contact === false) isTrigger = true;
            }
        }

        if (!isTrigger) return;
        if (this.config.ignoredSensors.includes(device.id)) return;

        console.log(`[Security] Sensor Triggered: ${device.name} (${sensorType}) while ${this.mode}`);

        // CONTEXTUAL LOGIC
        if (this.mode === 'armed_home') {
            // In 'armed_home', we typically ignore internal motion, but respect door contacts
            if (sensorType === 'motion') {
                console.log(`[Security] Ignoring internal motion in Armed Home mode.`);
                return;
            }
        }

        // If we get here -> POTENTIAL BREACH
        this.triggerBreach(device);
    }

    triggerBreach(device) {
        if (this.status === 'triggered') return; // Already triggered

        console.log(`[Security] BREACH DETECTED by ${device.name}`);
        this.status = 'warning';
        this.emit('breach-detected', device);

        // Start Entry Delay
        console.log(`[Security] Starting entry delay (${this.config.entryDelay}ms)...`);
        
        // Notify users (Mock)
        console.log(`[Notification] ⚠️ Security Warning: ${device.name} triggered. Disarm within 30s!`);

        this.triggerTimer = setTimeout(() => {
            if (this.mode !== 'disarmed') {
                this.triggerAlarm();
            }
        }, this.config.entryDelay);
    }

    async triggerAlarm() {
        if (this.status === 'triggered') return;
        
        this.status = 'triggered';
        console.error('[Security] 🚨 ALARM TRIGGERED 🚨');
        this.emit('alarm-triggered');

        // ACTIONS
        // 1. Flash Lights
        this.flashAllLights();
        
        // 2. Play Sound (TODO: Link to Sonos/MediaManager)
        // mediaManager.playAlert('alarm_sound.mp3');
        
        // 3. Notify (Pushbullet/Telegram/etc)
        console.log('[Notification] 🚨 ALARM! INTRUDER DETECTED! 🚨');
    }

    async flashAllLights() {
        const lights = deviceManager.getAllDevices().filter(d => d.type === 'light');
        if (lights.length === 0) return;

        console.log(`[Security] Flashing ${lights.length} lights...`);
        // Flash loop
        let count = 0;
        const interval = setInterval(() => {
            if (this.status !== 'triggered' || count > 20) {
                clearInterval(interval);
                // Restore? For now just turn off
                lights.forEach(l => deviceManager.controlDevice(l.id, 'turn_off'));
                return;
            }

            const cmd = count % 2 === 0 ? 'turn_on' : 'turn_off';
            const payload = (cmd === 'turn_on') ? { color: {r:255, g:0, b:0}, brightness: 100 } : {};

            lights.forEach(l => {
                deviceManager.controlDevice(l.id, cmd, payload).catch(()=>{});
            });
            count++;
        }, 1000);
    }

    async stopAlarmActions() {
        console.log('[Security] Stopping alarm actions...');
        // Stop sound, stop flashing
        const lights = deviceManager.getAllDevices().filter(d => d.type === 'light');
        lights.forEach(l => deviceManager.controlDevice(l.id, 'turn_on', { color: {r:255, g:255, b:255}, brightness: 50 }).catch(()=>{}));
    }

    getStatus() {
        return {
            mode: this.mode,
            status: this.status,
            activeAlarms: Array.from(this.activeAlarms)
        };
    }
}

module.exports = new SecurityManager();
