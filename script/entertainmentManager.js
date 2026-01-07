const EventEmitter = require('events');
const sonosManager = require('./sonosManager');
const spotifyManager = require('./spotifyManager');
const deviceManager = require('./deviceManager');
const sceneManager = require('./sceneManager');
const presenceManager = require('./presenceManager');

class EntertainmentManager extends EventEmitter {
    constructor() {
        super();
        this.enabled = true;
        this.lastMusicAutoPlay = 0; // Timestamp for cooldown
        
        // Listen to events
        this.setupListeners();
    }

    setupListeners() {
        // 1. TV / Cinema Mode Automation
        deviceManager.on('device_update', (device) => {
            this.handleDeviceUpdate(device);
        });

        // 2. Context Aware Music (Morning Routine)
        presenceManager.on('presence_update', (data) => {
            if (data.type === 'motion' && data.value === true) {
                this.handleMotion(data.deviceId, data.room);
            }
        });

        // 3. Scene Activation Hooks
        sceneManager.on('mode-changed', (mode) => {
            if (mode === 'CINEMA') {
                this.activateCinemaMode();
            }
        });
    }

    // --- Logic Handlers ---

    async handleDeviceUpdate(device) {
        if (!this.enabled) return;

        // Check if it is a TV
        const isTV = device.type === 'tv' || 
                     (device.name && device.name.toLowerCase().includes('tv')) ||
                     (device.id && device.id.toLowerCase().includes('tv'));

        if (isTV && device.state === 'on') {
            // Check if we are already in Cinema mode to avoid loops
            if (sceneManager.getMode() !== 'CINEMA') {
                const hour = new Date().getHours();
                // Auto-Cinema only in evenings (after 6 PM)
                if (hour >= 18) {
                    console.log(`[Entertainment] TV (${device.name}) turned ON in evening. Switching to Cinema Mode.`);
                    sceneManager.setMode('CINEMA'); 
                } else {
                     console.log(`[Entertainment] TV (${device.name}) turned ON (Daytime). Skipping Cinema Mode.`);
                }
            }
        }
    }

    async handleMotion(sensorId, roomName) {
        if (!this.enabled) return;

        const now = new Date();
        const hour = now.getHours();

        // Morning Routine: Kitchen Motion between 7:00 - 9:00
        if (roomName && roomName.toLowerCase() === 'kitchen') {
            if (hour >= 7 && hour < 9) {
                // Check cooldown (e.g., don't trigger if played in last 4 hours)
                if (Date.now() - this.lastMusicAutoPlay > 4 * 60 * 60 * 1000) {
                    console.log('[Entertainment] Morning Kitchen Motion detected. Triggering Morning Playlist.');
                    this.playMorningPlaylist();
                }
            }
        }
    }

    // --- Actions ---

    async activateCinemaMode() {
        console.log('[Entertainment] Activating Cinema Mode Enhancements...');
        
        // 1. Config Soundbar to TV Input (Sonos)
        const devices = sonosManager.getDiscoveredDevices();
        const livingRoomSpeaker = devices.find(d => d.name.toLowerCase().includes('living') || d.name.toLowerCase().includes('woonkamer'));
        
        if (livingRoomSpeaker) {
            try {
                // Sonos specific: Switch to TV input (spdif / arc)
                // Note: @svrooij/sonos implementation dependent. 
                // Usually it's PlayAVTransportURI with 'x-sonos-htastream:...'
                console.log(`[Entertainment] Switching Sonos (${livingRoomSpeaker.name}) to TV Input...`);
                // This is a simplified call; actual implementation depends on specific Sonos model capabilities
                // Often SetAVTransportURI with "x-sonos-htastream:DEVICE_UUID:spdif" works
                const uri = `x-sonos-htastream:${livingRoomSpeaker.uuid}:spdif`;
                await sonosManager.play(livingRoomSpeaker.uuid, uri);
            } catch (e) {
                console.error('[Entertainment] Failed to set Sonos TV input:', e.message);
            }
        }
    }

    async playMorningPlaylist() {
        this.lastMusicAutoPlay = Date.now();

        // Find Kitchen Speaker
        const devices = sonosManager.getDiscoveredDevices();
        const kitchenSpeaker = devices.find(d => d.name.toLowerCase().includes('kitchen') || d.name.toLowerCase().includes('keuken'));

        if (!kitchenSpeaker) {
            console.log('[Entertainment] No Kitchen speaker found for Morning Routine.');
            return;
        }

        // Play Spotify Morning Playlist
        // We need a specific URI. For demo, we use a generic "Morning" search or fixed URI.
        const playlistUri = 'spotify:playlist:37i9dQZF1Dx2sUQwD7tbmL'; // Spotify "Feel Good Morning"
        
        console.log(`[Entertainment] Playing Morning Playlist on ${kitchenSpeaker.name}`);
        try {
            await sonosManager.play(kitchenSpeaker.uuid, playlistUri);
            
            // Set Volume
            const device = await sonosManager._getDevice(kitchenSpeaker.uuid);
            if(device) await device.SetVolume(15);

        } catch (e) {
            console.error('[Entertainment] Failed to play morning music:', e.message);
        }
    }
}

const entertainmentManager = new EntertainmentManager();
module.exports = entertainmentManager;
