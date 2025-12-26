const EventEmitter = require('events');
const deviceManager = require('./deviceManager');

class PresenceManager extends EventEmitter {
    constructor() {
        super();
        this.people = new Map(); // userId -> { name, deviceId, isHome, lastSeen }
        this.homeState = 'unknown'; // 'home', 'away'
        
        // Listen to device updates to track presence
        deviceManager.on('device-updated', (device) => this.checkDevicePresence(device));
        deviceManager.on('device-added', (device) => this.checkDevicePresence(device));
        
        // Periodic check for "Away" status (if device hasn't been seen in X minutes)
        setInterval(() => this.checkAwayStatus(), 60000); // Check every minute
    }

    addPerson(userId, name, trackingDeviceId) {
        this.people.set(userId, {
            name,
            deviceId: trackingDeviceId,
            isHome: false,
            lastSeen: 0
        });
        console.log(`[Presence] Tracking ${name} via device ${trackingDeviceId}`);
    }

    checkDevicePresence(device) {
        for (const [userId, person] of this.people) {
            if (person.deviceId === device.id || person.deviceId === device.mac) {
                // Device found/updated
                const wasHome = person.isHome;
                person.lastSeen = Date.now();
                person.isHome = true;

                if (!wasHome) {
                    console.log(`[Presence] ${person.name} arrived home.`);
                    this.emit('person-arrived', person);
                    this.updateHomeState();
                }
            }
        }
    }

    checkAwayStatus() {
        const AWAY_TIMEOUT = 5 * 60 * 1000; // 5 minutes
        const now = Date.now();
        let changed = false;

        for (const [userId, person] of this.people) {
            if (person.isHome && (now - person.lastSeen > AWAY_TIMEOUT)) {
                // Check if device is actually reachable via ping/arp before marking away?
                // For now, rely on lastSeen update from deviceManager polling
                
                // If deviceManager hasn't updated it in 5 mins, it might be gone
                // But deviceManager polls every 10s. If it fails, it marks on=false.
                // Let's check device state directly
                const device = deviceManager.devices.get(person.deviceId);
                if (device && !device.state.on) {
                     person.isHome = false;
                     console.log(`[Presence] ${person.name} left home.`);
                     this.emit('person-left', person);
                     changed = true;
                }
            }
        }

        if (changed) this.updateHomeState();
    }

    updateHomeState() {
        const anyoneHome = Array.from(this.people.values()).some(p => p.isHome);
        const newState = anyoneHome ? 'home' : 'away';

        if (this.homeState !== newState) {
            this.homeState = newState;
            console.log(`[Presence] Home State changed to: ${newState.toUpperCase()}`);
            this.emit('home-state-changed', newState);
        }
    }

    getPresenceStatus() {
        return {
            state: this.homeState,
            people: Array.from(this.people.values())
        };
    }
}

module.exports = new PresenceManager();
