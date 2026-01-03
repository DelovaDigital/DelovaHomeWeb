const EventEmitter = require('events');
const deviceManager = require('./deviceManager');
const fs = require('fs');
const path = require('path');

const CONFIG_PATH = path.join(__dirname, '../data/presence_config.json');

class PresenceManager extends EventEmitter {
    constructor() {
        super();
        this.people = new Map(); // userId -> { name, deviceId, isHome, lastSeen, location: {lat, lon, timestamp} }
        this.homeState = 'unknown'; // 'home', 'away'
        this.homeLocation = {
            latitude: 0,
            longitude: 0,
            radius: 100 // meters
        };
        
        this.loadConfig();

        // Listen to device updates to track presence
        deviceManager.on('device-updated', (device) => this.checkDevicePresence(device));
        deviceManager.on('device-added', (device) => this.checkDevicePresence(device));
        
        // Periodic check for "Away" status (if device hasn't been seen in X minutes)
        setInterval(() => this.checkAwayStatus(), 60000); // Check every minute
    }

    loadConfig() {
        try {
            if (fs.existsSync(CONFIG_PATH)) {
                const config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
                if (config.homeLocation) {
                    this.homeLocation = config.homeLocation;
                }
            }
        } catch (e) {
            console.error('Error loading presence config:', e);
        }
    }

    saveConfig() {
        try {
            const config = {
                homeLocation: this.homeLocation
            };
            // Ensure data directory exists
            const dir = path.dirname(CONFIG_PATH);
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }
            fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));
        } catch (e) {
            console.error('Error saving presence config:', e);
        }
    }

    setHomeLocation(lat, lon, radius = 100) {
        this.homeLocation = { latitude: lat, longitude: lon, radius };
        this.saveConfig();
        console.log(`[Presence] Home location set: ${lat}, ${lon} (r=${radius}m)`);
        // Re-evaluate everyone's presence
        this.people.forEach(person => {
            if (person.location) {
                this.evaluateLocationPresence(person);
            }
        });
    }

    addPerson(userId, name, trackingDeviceId) {
        // Keep existing data if present
        const existing = this.people.get(userId);
        
        this.people.set(userId, {
            userId,
            name,
            deviceId: trackingDeviceId,
            isHome: existing ? existing.isHome : false,
            lastSeen: existing ? existing.lastSeen : 0,
            location: existing ? existing.location : null
        });
        console.log(`[Presence] Tracking ${name} via device ${trackingDeviceId}`);
    }

    updateUserLocation(userId, lat, lon, timestamp) {
        const person = this.people.get(userId);
        if (!person) {
            // If person doesn't exist, maybe create a temporary one or ignore?
            // Better to ignore if we don't know them, or auto-create if we have a name?
            // For now, let's assume they are registered via addPerson or we find them by ID.
            // If we don't have them, we can't really track them effectively without a name.
            // But let's try to find them or create a placeholder.
            console.warn(`[Presence] Received location for unknown user ${userId}`);
            return;
        }

        person.location = { latitude: lat, longitude: lon, timestamp };
        person.lastSeen = Date.now(); // Update last seen as we got a heartbeat
        
        this.evaluateLocationPresence(person);
    }

    evaluateLocationPresence(person) {
        if (!this.homeLocation.latitude || !this.homeLocation.longitude) return;

        const dist = this.calculateDistance(
            person.location.latitude, person.location.longitude,
            this.homeLocation.latitude, this.homeLocation.longitude
        );

        const isHome = dist <= this.homeLocation.radius;
        
        if (person.isHome !== isHome) {
            person.isHome = isHome;
            console.log(`[Presence] ${person.name} is now ${isHome ? 'HOME' : 'AWAY'} (dist: ${Math.round(dist)}m)`);
            this.emit(isHome ? 'person-arrived' : 'person-left', person);
            this.updateHomeState();
        }
    }

    calculateDistance(lat1, lon1, lat2, lon2) {
        const R = 6371e3; // metres
        const φ1 = lat1 * Math.PI/180; // φ, λ in radians
        const φ2 = lat2 * Math.PI/180;
        const Δφ = (lat2-lat1) * Math.PI/180;
        const Δλ = (lon2-lon1) * Math.PI/180;

        const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
                Math.cos(φ1) * Math.cos(φ2) *
                Math.sin(Δλ/2) * Math.sin(Δλ/2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));

        return R * c; // in metres
    }

    checkDevicePresence(device) {
        for (const [userId, person] of this.people) {
            if (person.deviceId === device.id || person.deviceId === device.mac) {
                // Device found/updated
                const wasHome = person.isHome;
                person.lastSeen = Date.now();
                
                // If device is ON/Reachable, they are home
                // But if we have location data saying they are away, which wins?
                // Usually Network presence is more reliable for "Home" than GPS (which drifts).
                // So if Network says Home, they are Home.
                
                if (device.state.on) {
                     person.isHome = true;
                }

                if (!wasHome && person.isHome) {
                    console.log(`[Presence] ${person.name} arrived home (Device).`);
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
            // Only check timeout if we rely on device presence (no recent location update saying they are home)
            // If we have recent location saying they are home, don't mark away just because device is idle.
            
            // If we have location data, use that primarily?
            // Hybrid approach:
            // If device is active -> Home
            // If location is within radius -> Home
            // Else -> Away
            
            // But checkDevicePresence sets isHome=true.
            // We need to check if we should set it to false.
            
            if (person.isHome) {
                // Check if device is stale
                const deviceStale = (now - person.lastSeen > AWAY_TIMEOUT);
                
                // Check location
                let locationHome = false;
                if (person.location && this.homeLocation.latitude) {
                     const dist = this.calculateDistance(
                        person.location.latitude, person.location.longitude,
                        this.homeLocation.latitude, this.homeLocation.longitude
                    );
                    if (dist <= this.homeLocation.radius) locationHome = true;
                }

                // If device is stale AND location is not home (or unknown), then mark away
                if (deviceStale && !locationHome) {
                     person.isHome = false;
                     console.log(`[Presence] ${person.name} left home (Timeout/Location).`);
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
