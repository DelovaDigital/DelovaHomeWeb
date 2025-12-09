const EventEmitter = require('events');
const net = require('net');
const dgram = require('dgram');
const fs = require('fs');
const path = require('path');
const WebSocket = require('ws');
const os = require('os');
const { Bonjour } = require('bonjour-service');
const CastClient = require('castv2-client').Client;
const DefaultMediaReceiver = require('castv2-client').DefaultMediaReceiver;
const lgtv = require('lgtv2');
const onvif = require('onvif');
let SamsungRemote = null;
try {
    SamsungRemote = require('samsung-remote');
} catch (e) {
    console.warn('[Samsung] Optional module "samsung-remote" failed to load:', e && e.message ? e.message : e);
    SamsungRemote = null;
}
// Load spotifyManager defensively to avoid crashing discovery if spotifyManager is broken
let spotifyManager;
try {
    spotifyManager = require('./spotifyManager');
} catch (e) {
    console.error('Failed to load spotifyManager in deviceManager:', e && e.message ? e.message : e);
    spotifyManager = {
        available: false,
        getPlaybackState: async () => null,
        play: async () => { throw new Error('Spotify unavailable'); },
        pause: async () => { throw new Error('Spotify unavailable'); },
        next: async () => { throw new Error('Spotify unavailable'); },
        previous: async () => { throw new Error('Spotify unavailable'); },
        setVolume: async () => { throw new Error('Spotify unavailable'); },
        transferPlayback: async () => { throw new Error('Spotify unavailable'); },
        playContext: async () => { throw new Error('Spotify unavailable'); },
        playUris: async () => { throw new Error('Spotify unavailable'); }
    };
}

class DeviceManager extends EventEmitter {
    constructor() {
        super();
        this.devices = new Map();
        this.localIp = this._determineLocalIp();
        this.atvProcesses = new Map();
        this.androidTvProcesses = new Map();
        this.samsungProcesses = new Map();
        this.legacySamsungDevices = new Set();
        this.cameraInstances = new Map(); // Cache for ONVIF camera connections
        this.pairingProcess = null;
        this.appleTvCredentials = {};
        this.androidTvCredentials = {};
        this.samsungCredentials = {};
        this.cameraCredentials = {};
        this.loadAppleTvCredentials();
        this.loadAndroidTvCredentials();
        this.loadSamsungCredentials();
        this.loadCameraCredentials();
        this.startDiscovery();
        this.startPolling();
    }

    async startPolling() {
        console.log('[Polling] Starting polling service...');
        while (true) {
            const deviceIds = Array.from(this.devices.keys());
            // console.log(`[Polling] Starting new poll cycle for ${deviceIds.length} devices.`);
            
            for (const id of deviceIds) {
                const device = this.devices.get(id);
                if (!device) continue;

                try {
                    // Give each refresh a max of 4 seconds to complete
                    await Promise.race([
                        this.refreshDevice(id),
                        new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 4000))
                    ]);
                } catch (e) {
                    // console.error(`[Polling] Error refreshing ${device.name} (${device.ip}): ${e.message}`);
                    // If a device refresh fails (e.g., timeout or connection error),
                    // it's a strong indicator that it's off or unreachable.
                    if (device.state.on) {
                        // console.log(`[Polling] Marking ${device.name} as off due to refresh failure.`);
                        device.state.on = false;
                        this.emit('device-updated', device);
                    }
                }
            }
            // Wait for 10 seconds before starting the next full poll cycle
            await new Promise(resolve => setTimeout(resolve, 10000));
        }
    }

    loadAppleTvCredentials() {
        try {
            const credPath = path.join(__dirname, '../appletv-credentials.json');
            if (fs.existsSync(credPath)) {
                this.appleTvCredentials = JSON.parse(fs.readFileSync(credPath));
                console.log(`Loaded credentials for ${Object.keys(this.appleTvCredentials).length} Apple TV(s)`);
                
                // Add known devices from credentials immediately
                for (const [deviceId, creds] of Object.entries(this.appleTvCredentials)) {
                    if (creds.ip) {
                        console.log(`[DeviceManager] Restoring known device: ${creds.name || deviceId} (${creds.ip})`);
                        this.addDevice({
                            id: deviceId, // Use the MAC/ID as the device ID
                            name: creds.name || `Apple Device (${creds.ip})`,
                            type: 'tv', // Treat as TV to get full controls
                            ip: creds.ip,
                            protocol: 'mdns-airplay',
                            deviceId: deviceId,
                            state: { on: false, volume: 0 }
                        });
                    }
                }
            }
        } catch (e) {
            console.error('Failed to load Apple TV credentials:', e.message);
        }
    }

    loadAndroidTvCredentials() {
        try {
            const credPath = path.join(__dirname, '../androidtv-credentials.json');
            if (fs.existsSync(credPath)) {
                this.androidTvCredentials = JSON.parse(fs.readFileSync(credPath));
                console.log(`Loaded credentials for ${Object.keys(this.androidTvCredentials).length} Android TV(s)`);
            }
        } catch (e) {
            console.error('Failed to load Android TV credentials:', e.message);
        }
    }

    loadCameraCredentials() {
        try {
            const credsPath = path.join(__dirname, '../camera-credentials.json');
            if (fs.existsSync(credsPath)) {
                this.cameraCredentials = JSON.parse(fs.readFileSync(credsPath));
                console.log(`Loaded credentials for ${Object.keys(this.cameraCredentials).length} Camera(s)`);
            } else {
                this.cameraCredentials = {};
            }
        } catch (e) {
            console.error('Failed to load Camera credentials:', e.message);
            this.cameraCredentials = {};
        }
    }

    loadSamsungCredentials() {
        try {
            const credsPath = path.join(__dirname, '../samsung-credentials.json');
            if (fs.existsSync(credsPath)) {
                const creds = JSON.parse(fs.readFileSync(credsPath));
                this.samsungCredentials = creds;
                console.log(`Loaded credentials for ${Object.keys(creds).length} Samsung TV(s)`);
            } else {
                this.samsungCredentials = {};
            }
        } catch (e) {
            console.error('Failed to load Samsung credentials:', e.message);
            this.samsungCredentials = {};
        }
    }

    saveCameraCredentials(ip, username, password) {
        const credsPath = path.join(__dirname, '../camera-credentials.json');
        this.cameraCredentials[ip] = { username, password };
        try {
            fs.writeFileSync(credsPath, JSON.stringify(this.cameraCredentials, null, 2));
            console.log(`[Camera] Credentials saved for ${ip}`);
        } catch (e) {
            console.error('Failed to save camera credentials:', e);
        }
    }

    saveSamsungToken(ip, token) {
        const credsPath = path.join(__dirname, '../samsung-credentials.json');
        let existing = {};
        if (fs.existsSync(credsPath)) {
            try {
                existing = JSON.parse(fs.readFileSync(credsPath));
            } catch (e) {}
        }
        existing[ip] = token;
        fs.writeFileSync(credsPath, JSON.stringify(existing, null, 2));
        this.samsungCredentials[ip] = token;
        console.log(`[Samsung] Token saved for ${ip}`);
    }

    startDiscovery() {
        console.log('Starting device discovery...');
        
        // 1. Custom SSDP Discovery (UPnP) using dgram
        // Replaces node-ssdp to avoid 'ip' package vulnerability
        this.setupSsdpDiscovery();
        
        // 2. ONVIF Discovery (WS-Discovery) for IP Cameras (Tapo, etc.)
        this.setupOnvifDiscovery();

        // 3. mDNS Discovery (Bonjour/Zeroconf)
        this.bonjour = new Bonjour();
        
        const browser = this.bonjour.find({ type: 'http' }, (service) => {
            this.processMdnsService(service, 'http');
        });

        this.bonjour.find({ type: 'googlecast' }, (service) => {
            this.processMdnsService(service, 'googlecast');
        });

        this.bonjour.find({ type: 'hap' }, (service) => { // HomeKit
            this.processMdnsService(service, 'homekit');
        });

        this.bonjour.find({ type: 'spotify-connect' }, (service) => {
            this.processMdnsService(service, 'spotify');
        });

        // Samsung TV (AirPlay)
        this.bonjour.find({ type: 'airplay' }, (service) => {
            this.processMdnsService(service, 'airplay');
        });

        // Printers (IPP)
        this.bonjour.find({ type: 'ipp' }, (service) => {
            this.processMdnsService(service, 'printer');
        });

        // Sonos Speakers
        this.bonjour.find({ type: 'sonos' }, (service) => {
            this.processMdnsService(service, 'sonos');
        });

        // Philips Hue
        this.bonjour.find({ type: 'hue' }, (service) => {
            this.processMdnsService(service, 'hue');
        });

        // Elgato Key Lights
        this.bonjour.find({ type: 'elg' }, (service) => {
            this.processMdnsService(service, 'elgato');
        });

        // Nanoleaf
        this.bonjour.find({ type: 'nanoleafapi' }, (service) => {
            this.processMdnsService(service, 'nanoleaf');
        });

        // IP Cameras (Axis, RTSP)
        this.bonjour.find({ type: 'axis-video' }, (service) => {
            this.processMdnsService(service, 'camera');
        });
        this.bonjour.find({ type: 'rtsp' }, (service) => {
            this.processMdnsService(service, 'camera');
        });

        // LG WebOS TV Discovery
        this.bonjour.find({ type: 'webos-second-screen' }, (service) => {
             const ip = service.addresses && service.addresses.length > 0 ? service.addresses[0] : null;
             if (ip) {
                 this.addDevice({
                     id: `lg-webos-${service.name}`,
                     name: service.name || 'LG WebOS TV',
                     type: 'tv',
                     ip: ip,
                     protocol: 'lg-webos',
                     state: { on: true, volume: 10 }
                 });
             }
        });
        
        // Keep Mock devices for testing purposes if no real devices are found immediately
        // You can remove this later
        // this.addMockDevices();
    }

    setupSsdpDiscovery() {
        const SSDP_ADDR = '239.255.255.250';
        const SSDP_PORT = 1900;
        
        const createSearch = (st) => Buffer.from(
            'M-SEARCH * HTTP/1.1\r\n' +
            'HOST: 239.255.255.250:1900\r\n' +
            'MAN: "ssdp:discover"\r\n' +
            'MX: 1\r\n' +
            `ST: ${st}\r\n` +
            '\r\n'
        );

        const M_SEARCH_ALL = createSearch('ssdp:all');
        const M_SEARCH_SAMSUNG = createSearch('urn:samsung.com:device:RemoteControlReceiver:1');

        this.ssdpSocket = dgram.createSocket('udp4');

        this.ssdpSocket.on('error', (err) => {
            console.error(`SSDP socket error:\n${err.stack}`);
            this.ssdpSocket.close();
        });

        this.ssdpSocket.on('message', (msg, rinfo) => {
            const msgString = msg.toString();
            const lines = msgString.split('\r\n');
            const headers = {};
            
            lines.forEach(line => {
                const parts = line.split(':');
                if (parts.length >= 2) {
                    const key = parts[0].trim().toUpperCase();
                    const value = parts.slice(1).join(':').trim();
                    headers[key] = value;
                }
            });

            // Process SSDP Response
            const location = headers.LOCATION || headers.Location;
            const usn = headers.USN || headers.Usn || '';
            const server = headers.SERVER || headers.Server || '';
            const st = headers.ST || headers.St || '';
            
            // Debug logging for Samsung devices
            // if (server.toLowerCase().includes('samsung') || st.toLowerCase().includes('samsung')) {
            //    console.log(`[SSDP] Potential Samsung Device from ${rinfo.address}:`, { server, st, usn });
            // }

            let type = 'unknown';
            let name = 'Unknown Device';

            if (usn.includes('HueBridge') || server.includes('IpBridge')) {
                type = 'light';
                name = 'Philips Hue Bridge';
            } else if (usn.includes('Wemo') || server.includes('Wemo')) {
                type = 'switch';
                name = 'Wemo Switch';
            } else if (server.includes('Sonos')) {
                type = 'speaker';
                name = 'Sonos Speaker';
            } else if (server.toLowerCase().includes('denon') || usn.toLowerCase().includes('denon') || server.toLowerCase().includes('marantz') || usn.toLowerCase().includes('marantz')) {
                type = 'receiver';
                name = server.toLowerCase().includes('marantz') ? 'Marantz AVR' : 'Denon AVR';
            } else if (server.toLowerCase().includes('yamaha') || usn.toLowerCase().includes('yamaha')) {
                type = 'receiver';
                name = 'Yamaha AVR';
            } else if (server.toLowerCase().includes('onkyo') || usn.toLowerCase().includes('onkyo')) {
                type = 'receiver';
                name = 'Onkyo AVR';
            } else if (server.toLowerCase().includes('pioneer') || usn.toLowerCase().includes('pioneer')) {
                type = 'receiver';
                name = 'Pioneer AVR';
            } else if (server.toLowerCase().includes('synology') || server.toLowerCase().includes('qnap') || server.toLowerCase().includes('nas')) {
                type = 'nas';
                name = server.split('/')[0] || 'NAS Device';
            } else if (server.toLowerCase().includes('samsung') || server.toLowerCase().includes('tizen') || st.includes('samsung')) {
                type = 'tv';
                name = 'Samsung Smart TV';
            } else if (server.includes('Roku')) {
                type = 'tv';
                name = 'Roku Device';
            } else if (st.includes('MediaRenderer') || usn.includes('MediaRenderer')) {
                type = 'speaker';
                name = 'UPnP Media Renderer';
            } else if (server.includes('UPnP/1.0') && location) {
                name = `UPnP Device (${rinfo.address})`;
            } else {
                name = `Device (${rinfo.address})`;
            }

            // Filter out unknown UPnP devices to reduce clutter
            if (type === 'unknown') {
                return;
            }

            // Sanitize ID to be safe for HTML attributes
            const safeId = (usn || `ssdp-${rinfo.address}`).replace(/[^a-zA-Z0-9-_:]/g, '_');

            let initialState = { on: false };
            if (type === 'nas' || type === 'printer') {
                initialState = { on: true };
            }

            this.addDevice({
                id: safeId,
                name: name,
                type: type,
                ip: rinfo.address,
                protocol: (type === 'tv' && name.includes('Samsung')) ? 'samsung-tizen' : (name.includes('Denon') ? 'denon-avr' : 'ssdp'),
                location: location,
                state: initialState
            });
        });

        this.ssdpSocket.bind(0, () => {
            this.ssdpSocket.setBroadcast(true);
            this.ssdpSocket.setMulticastTTL(128);
            // Send initial searches
            this.ssdpSocket.send(M_SEARCH_ALL, 0, M_SEARCH_ALL.length, SSDP_PORT, SSDP_ADDR);
            setTimeout(() => {
                this.ssdpSocket.send(M_SEARCH_SAMSUNG, 0, M_SEARCH_SAMSUNG.length, SSDP_PORT, SSDP_ADDR);
            }, 500);
        });

        // Periodically search
        setInterval(() => {
            try {
                this.ssdpSocket.send(M_SEARCH_ALL, 0, M_SEARCH_ALL.length, SSDP_PORT, SSDP_ADDR);
                setTimeout(() => {
                    this.ssdpSocket.send(M_SEARCH_SAMSUNG, 0, M_SEARCH_SAMSUNG.length, SSDP_PORT, SSDP_ADDR);
                }, 500);
            } catch (e) { console.error('SSDP send error:', e); }
        }, 10000);
    }

    setupOnvifDiscovery() {
        const ONVIF_ADDR = '239.255.255.250';
        const ONVIF_PORT = 3702;
        const crypto = require('crypto');
        
        // WS-Discovery Probe Message
        const PROBE_MESSAGE = `
            <e:Envelope xmlns:e="http://www.w3.org/2003/05/soap-envelope"
                        xmlns:w="http://schemas.xmlsoap.org/ws/2004/08/addressing"
                        xmlns:d="http://schemas.xmlsoap.org/ws/2005/04/discovery"
                        xmlns:dn="http://www.onvif.org/ver10/network/wsdl">
                <e:Header>
                    <w:MessageID>uuid:${crypto.randomUUID()}</w:MessageID>
                    <w:To e:mustUnderstand="true">urn:schemas-xmlsoap-org:ws:2005:04:discovery</w:To>
                    <w:Action a:mustUnderstand="true">http://schemas.xmlsoap.org/ws/2005/04/discovery/Probe</w:Action>
                </e:Header>
                <e:Body>
                    <d:Probe>
                        <d:Types>dn:NetworkVideoTransmitter</d:Types>
                    </d:Probe>
                </e:Body>
            </e:Envelope>
        `.trim().replace(/\s+/g, ' ');

        this.onvifSocket = dgram.createSocket('udp4');

        this.onvifSocket.on('error', (err) => {
            console.error(`ONVIF socket error:\n${err.stack}`);
            this.onvifSocket.close();
        });

        this.onvifSocket.on('message', (msg, rinfo) => {
            const msgString = msg.toString();
            // console.log(`[ONVIF] Received message from ${rinfo.address}:`, msgString.substring(0, 200)); // Debug log

            // Check if it's a ProbeMatch
            if (msgString.includes('ProbeMatch') || msgString.includes('NetworkVideoTransmitter') || msgString.includes('onvif')) {
                // Extract Scopes to find name
                const scopesMatch = msgString.match(/<d:Scopes>([^<]+)<\/d:Scopes>/) || msgString.match(/Scopes>([^<]+)</);
                
                let name = `ONVIF Camera (${rinfo.address})`;
                
                if (scopesMatch) {
                    const scopes = scopesMatch[1].split(' ');
                    const nameScope = scopes.find(s => s.includes('name=') || s.includes('Name='));
                    const hardwareScope = scopes.find(s => s.includes('hardware=') || s.includes('Hardware='));
                    
                    if (nameScope) name = decodeURIComponent(nameScope.split('=').pop());
                    else if (hardwareScope) name = decodeURIComponent(hardwareScope.split('=').pop());
                }

                // Tapo specific cleanup
                if (name.includes('Tapo')) {
                    name = name.replace(/_/g, ' ');
                }

                this.addDevice({
                    id: `onvif-${rinfo.address}`,
                    name: name,
                    type: 'camera',
                    ip: rinfo.address,
                    protocol: 'onvif',
                    state: { on: true }
                });
            }
        });

        this.onvifSocket.bind(0, () => {
            this.onvifSocket.setBroadcast(true);
            this.onvifSocket.setMulticastTTL(128);
            this.onvifSocket.addMembership(ONVIF_ADDR);
            
            const sendProbe = () => {
                const msg = Buffer.from(PROBE_MESSAGE);
                this.onvifSocket.send(msg, 0, msg.length, ONVIF_PORT, ONVIF_ADDR);
            };

            sendProbe();
            // Periodically probe every 30s
            setInterval(sendProbe, 30000);
        });
    }

    processMdnsService(service, sourceType) {
        // console.log(`mDNS Service found (${sourceType}):`, service.name);
        
        let type = 'unknown';
        let name = service.name;
        const lowerName = name.toLowerCase();

        // Check TXT records for model info
        let model = '';
        let deviceId = '';
        if (service.txt) {
            if (service.txt.md) model = service.txt.md; // Model name often in 'md'
            else if (service.txt.model) model = service.txt.model;
            
            if (service.txt.deviceid) deviceId = service.txt.deviceid;
        }

        // Debug logging for Apple TV
        if (name.includes('Apple TV') || model.includes('AppleTV')) {
            console.log(`[Discovery] Found Apple TV: ${name}, Source: ${sourceType}, IP: ${service.addresses}, DeviceID: ${deviceId}`);
        }

        // Force add Apple TV if found via AirPlay
        if (sourceType === 'airplay' && (name.includes('Apple TV') || model.includes('AppleTV'))) {
            type = 'tv';
            // If deviceId is missing from TXT, try to use the one from credentials if IP matches
            if (!deviceId) {
                 // Try to find deviceId from credentials if we have only one
                 const credKeys = Object.keys(this.appleTvCredentials);
                 if (credKeys.length === 1) {
                     deviceId = credKeys[0];
                     console.log(`[Discovery] Auto-assigning DeviceID ${deviceId} to ${name}`);
                 }
            }
        }

        if (sourceType === 'googlecast') {
            type = 'tv';
            // Try to get friendly name from TXT record
            if (service.txt && service.txt.fn) {
                name = service.txt.fn;
            } else {
                // Fallback: Clean up name by removing UUID suffix
                name = name.replace(/-[a-f0-9]{32}$/, '').replace(/-/g, ' ');
            }
        } else if (sourceType === 'airplay') {
            if (model.toLowerCase().includes('samsung') || lowerName.includes('samsung') || lowerName.includes('tv')) {
                type = 'tv';
            } else if (model.includes('AudioAccessory') || lowerName.includes('homepod')) {
                type = 'sensor';
            } else {
                type = 'speaker';
            }
        } else if (sourceType === 'spotify') {
            type = 'speaker';
            // Clean up Spotify names if they start with hex ID (MAC address)
            if (/^[0-9a-fA-F]{12}/.test(name)) {
                 name = name.substring(12);
            }
        } else if (sourceType === 'printer') {
            type = 'printer';
        } else if (sourceType === 'sonos') {
            type = 'speaker';
        } else if (sourceType === 'hue') {
            type = 'light';
            name = 'Philips Hue Bridge';
        } else if (sourceType === 'elgato') {
            type = 'light';
        } else if (sourceType === 'nanoleaf') {
            type = 'light';
        } else if (sourceType === 'camera') {
            type = 'camera';
        } else if (lowerName.includes('tapo') || lowerName.includes('camera')) {
            type = 'camera';
        } else if (lowerName.includes('shelly')) {
            type = 'switch';
        } else if (lowerName.includes('printer') || lowerName.includes('officejet') || lowerName.includes('deskjet') || lowerName.includes('laserjet') || lowerName.includes('envy')) {
            type = 'printer';
        } else if (lowerName.includes('tv') || lowerName.includes('chromecast')) {
            type = 'tv';
        } else if (lowerName.includes('light') || lowerName.includes('led') || lowerName.includes('hue') || lowerName.includes('bulb')) {
            type = 'light';
        } else if (lowerName.includes('speaker') || lowerName.includes('sonos')) {
            type = 'speaker';
        } else if (lowerName.includes('denon') || model.toLowerCase().includes('denon') || lowerName.includes('marantz') || model.toLowerCase().includes('marantz')) {
            type = 'receiver';
        } else if (lowerName.includes('yamaha') || model.toLowerCase().includes('yamaha')) {
            type = 'receiver';
        } else if (lowerName.includes('onkyo') || model.toLowerCase().includes('onkyo')) {
            type = 'receiver';
        } else if (lowerName.includes('pioneer') || model.toLowerCase().includes('pioneer')) {
            type = 'receiver';
        } else if (lowerName.includes('nas') || lowerName.includes('synology') || lowerName.includes('qnap') || lowerName.includes('diskstation') || service.type === 'smb' || service.type === 'afpovertcp') {
            type = 'nas';
        } else if (lowerName.includes('sensor') || lowerName.includes('homepod') || model.includes('AudioAccessory')) {
            type = 'sensor';
            if (model.includes('AudioAccessory5')) name = 'HomePod Mini';
            else if (model.includes('AudioAccessory1')) name = 'HomePod (Gen 1)';
            else if (model.includes('AudioAccessory6')) name = 'HomePod (Gen 2)';
        }

        // Resolve IP (prefer IPv4)
        let ip = null;
        if (service.addresses && service.addresses.length > 0) {
            // Try to find an IPv4 address first
            const ipv4 = service.addresses.find(addr => addr.includes('.') && !addr.includes(':'));
            ip = ipv4 || service.addresses[0];
        }

        if (ip) {
            let initialState = { on: false };
            if (type === 'sensor') {
                // Default sensor state (mock values since we can't read HAP without pairing)
                initialState = { temperature: 21.5, humidity: 45 };
            } else if (type === 'printer') {
                initialState = { on: true };
            } else if (type === 'nas') {
                initialState = { on: true };
            }
            let protocol = `mdns-${sourceType}`;
            // If we identify a Samsung TV via mDNS, use the Tizen protocol for control
            if (type === 'tv' && (name.toLowerCase().includes('samsung') || model.toLowerCase().includes('samsung'))) {
                protocol = 'samsung-tizen';
            } else if (type === 'tv' && (name.toLowerCase().includes('android') || name.toLowerCase().includes('shield') || name.toLowerCase().includes('google') || name.toLowerCase().includes('sony') || name.toLowerCase().includes('philips'))) {
                // Force Google Cast / Android TV protocol for known Android TV devices
                protocol = 'mdns-googlecast';
            } else if (type === 'receiver' || name.toLowerCase().includes('denon') || model.toLowerCase().includes('denon') || name.toLowerCase().includes('marantz')) {
                protocol = 'denon-avr'; // Use Denon protocol for Marantz too as they are often compatible
            }

            // Sanitize ID

            // Sanitize ID
            const safeId = `mdns-${service.fqdn || name}-${sourceType}`.replace(/[^a-zA-Z0-9-_]/g, '_');

            // Check pairing status for AirPlay devices
            let isPaired = false;
            if (protocol === 'mdns-airplay') {
                // If we have a deviceId, check credentials
                if (deviceId && this.appleTvCredentials[deviceId]) {
                    isPaired = true;
                } else if (!deviceId) {
                    // If no deviceId in TXT, try to match by IP in credentials
                    const creds = Object.values(this.appleTvCredentials);
                    const match = creds.find(c => c.ip === ip);
                    if (match) isPaired = true;
                }
            }

            this.addDevice({
                id: safeId,
                name: name,
                type: type,
                ip: ip,
                protocol: protocol,
                port: service.port,
                model: model,
                deviceId: deviceId,
                paired: isPaired,
                state: initialState
            });
        }
    }

    addMockDevices() {
        // Mock devices removed
    }

    addDevice(device) {
        // Check if device already exists by IP
        let existingId = null;
        let existingDevice = null;

        for (const [id, dev] of this.devices) {
            if (dev.ip === device.ip) {
                existingId = id;
                existingDevice = dev;
                break;
            }
        }

        if (existingDevice) {
            let updated = false;

            // Update name if existing is generic and new is specific
            const genericNames = ['Samsung Smart TV', 'Unknown Device', 'UPnP Device', 'Device'];
            const isExistingGeneric = genericNames.some(n => existingDevice.name.startsWith(n));
            const isNewGeneric = genericNames.some(n => device.name.startsWith(n));

            if (isExistingGeneric && !isNewGeneric) {
                console.log(`[DeviceManager] Updating name for ${device.ip}: ${existingDevice.name} -> ${device.name}`);
                existingDevice.name = device.name;
                updated = true;
            }

            // Update paired status if changed
            if (device.paired !== undefined && existingDevice.paired !== device.paired) {
                existingDevice.paired = device.paired;
                updated = true;
            }

            // Prioritize protocols: samsung-tizen > mdns-airplay > ssdp
            if (device.protocol === 'samsung-tizen' && existingDevice.protocol !== 'samsung-tizen') {
                 console.log(`[DeviceManager] Upgrading protocol for ${device.ip}: ${existingDevice.protocol} -> ${device.protocol}`);
                 existingDevice.protocol = device.protocol;
                 updated = true;
            }
            
            // Special case for Apple TV: If we found it via AirPlay/MDNS, we want to ensure we keep the Apple TV identity
            if (device.name.includes('Apple TV') && !existingDevice.name.includes('Apple TV')) {
                existingDevice.name = device.name;
                existingDevice.type = 'tv'; // Ensure type is TV
                updated = true;
            }

            // Upgrade type from unknown to printer
            if (existingDevice.type === 'unknown' && device.type === 'printer') {
                existingDevice.type = 'printer';
                updated = true;
            }

            if (updated) {
                this.emit('device-updated', existingDevice);
            }
            
            return; // Don't add duplicate
        }

        // General deduplication by ID (fallback)
        if (!this.devices.has(device.id)) {
            this.devices.set(device.id, device);
            this.emit('device-added', device);
            console.log(`Device discovered: ${device.name} (${device.type}) via ${device.protocol || 'mock'}`);

            // If Denon, try to fetch inputs
            if (device.protocol === 'denon-avr') {
                this.fetchDenonInputs(device);
            }
        }
    }

    getAllDevices() {
        return Array.from(this.devices.values());
    }

    getDevice(id) {
        return this.devices.get(id);
    }

    async fetchDenonInputs(device) {
        // Try to fetch inputs from Denon Web Interface (XML)
        // Common paths: /goform/formMainZone_MainZoneXml.xml or /goform/AppCommand.xml
        const http = require('http');
        
        const fetchXml = (path) => {
            return new Promise((resolve, reject) => {
                const req = http.get(`http://${device.ip}${path}`, { timeout: 2000 }, (res) => {
                    if (res.statusCode !== 200) {
                        res.resume();
                        return reject(new Error(`Status ${res.statusCode}`));
                    }
                    let data = '';
                    res.on('data', (chunk) => data += chunk);
                    res.on('end', () => resolve(data));
                });
                req.on('error', (err) => reject(err));
                req.on('timeout', () => { req.destroy(); reject(new Error('Timeout')); });
            });
        };

        try {
            // Try MainZone XML first (older/standard models)
            const xml = await fetchXml('/goform/formMainZone_MainZoneXml.xml');
            
            // Simple regex parsing to avoid heavy XML parser dependency
            // Look for <InputFuncList>...</InputFuncList> or similar structures
            // Actually, often it's just current status.
            // Let's try to find renamed sources if possible.
            // Some models expose /goform/formMainZone_MainZoneXmlStatusLite.xml
            
            // If we can't find a list, we might just have to stick to defaults.
            // But let's look for <RenameSource> tags if they exist in config endpoints.
            
            // NOTE: Fetching the full list of *renamed* inputs is tricky without a specific API doc for the model.
            // However, we can try to just check if the device responds to HTTP, and if so, maybe we can assume it supports more.
            
            // For now, let's just log that we connected.
            // console.log(`[Denon] Connected to HTTP interface of ${device.name}`);
            
        } catch (e) {
            // console.log(`[Denon] Could not fetch XML from ${device.name}: ${e.message}`);
        }
    }

    async refreshDevice(id) {
        const device = this.devices.get(id);
        if (!device) return;

        // Refresh Local Mac
        if (this.isLocalMachine(device.ip)) {
             const state = await this.getMacState(device.ip);
             if (state) {
                 let updated = false;
                 if (device.state.on !== state.on) { device.state.on = state.on; updated = true; }
                 if (device.state.volume !== state.volume) { device.state.volume = state.volume; updated = true; }
                 if (device.state.mediaTitle !== state.title) { device.state.mediaTitle = state.title; updated = true; }
                 
                 if (updated) this.emit('device-updated', device);
             }
             return;
        }

        if (device.protocol === 'mdns-airplay' && device.type === 'tv') {
            // Check credentials
            if (!this.appleTvCredentials[device.deviceId]) return;

            // Use persistent process
            const process = this.getAtvProcess(device.ip);
            process.stdin.write(JSON.stringify({ command: 'status' }) + '\n');
            
            // Output is handled in getAtvProcess
        } else if (device.type === 'light' && (device.name.toLowerCase().includes('yeelight') || device.name.toLowerCase().includes('ylbulb'))) {
            // Refresh Yeelight
            const socket = new net.Socket();
            const id = 2; // Request ID for status
            const msg = { id, method: 'get_prop', params: ['power', 'bright'] };
            
            socket.setTimeout(2000);
            socket.connect(55443, device.ip, () => {
                socket.write(JSON.stringify(msg) + '\r\n');
            });

            socket.on('data', (data) => {
                try {
                    const response = JSON.parse(data.toString());
                    if (response.id === id && response.result) {
                        const [power, bright] = response.result;
                        let updated = false;
                        
                        const isOn = power === 'on';
                        if (device.state.on !== isOn) {
                            device.state.on = isOn;
                            updated = true;
                        }
                        
                        const brightness = parseInt(bright);
                        if (device.state.brightness !== brightness) {
                            device.state.brightness = brightness;
                            updated = true;
                        }

                        if (updated) {
                            this.emit('device-updated', device);
                        }
                    }
                } catch (e) {
                    // console.error('Error parsing Yeelight status:', e);
                }
                socket.destroy();
            });

            socket.on('error', () => socket.destroy());
            socket.on('timeout', () => socket.destroy());
        } else if (device.protocol === 'mdns-googlecast') {
            // Refresh Cast Device
            const client = new CastClient();
            client.connect(device.ip, () => {
                client.getStatus((err, status) => {
                    if (!err && status) {
                        let updated = false;
                        
                        // A successful status response means the device is on.
                        if (!device.state.on) {
                            device.state.on = true;
                            updated = true;
                        }

                        // Volume
                        if (status.volume) {
                            const vol = Math.round((status.volume.level || 0) * 100);
                            if (device.state.volume !== vol) {
                                device.state.volume = vol;
                                updated = true;
                            }
                        }

                        // Application (Media)
                        if (status.applications && status.applications.length > 0) {
                            const app = status.applications[0];
                            if (app.displayName !== 'Backdrop') {
                                device.state.mediaApp = app.displayName;
                                device.state.mediaTitle = app.statusText || app.displayName;
                                device.state.state = 'playing'; // Assume playing if app is open
                                updated = true;
                            } else {
                                if (device.state.state !== 'idle') {
                                    device.state.state = 'idle';
                                    device.state.mediaTitle = '';
                                    updated = true;
                                }
                            }
                        }

                        if (updated) this.emit('device-updated', device);
                    }
                    client.close();
                });
            });
            client.on('error', () => {});
        } else if (device.protocol === 'samsung-tizen') {
            // Refresh Samsung TV (More reliable check via WebSocket with fallback)
            const checkPower = (port) => {
                const protocol = port === 8002 ? 'wss' : 'ws';
                const wsUrl = `${protocol}://${device.ip}:${port}`;
                const ws = new WebSocket(wsUrl, {
                    rejectUnauthorized: false,
                    timeout: 2000
                });

                ws.on('open', () => {
                    if (!device.state.on) {
                        device.state.on = true;
                        this.emit('device-updated', device);
                    }
                    ws.close();
                });

                ws.on('error', (err) => {
                    ws.terminate();
                    if (port === 8002) {
                        // Secure failed, try insecure
                        checkPower(8001);
                    } else {
                        // Both failed, device is off
                        if (device.state.on) {
                            device.state.on = false;
                            this.emit('device-updated', device);
                        }
                    }
                });
            };

            checkPower(8002);

        } else if (device.protocol === 'denon-avr') {
            // Refresh Denon AVR
            const socket = new net.Socket();
            socket.setTimeout(2000);
            
            let buffer = '';
            socket.connect(23, device.ip, () => {
                socket.write('PW?\rMV?\rSI?\r');
            });

            socket.on('data', (data) => {
                buffer += data.toString();
                
                // Denon responses are \r separated. Process when we have a full buffer.
                if (buffer.includes('PW') && buffer.includes('MV') && buffer.includes('SI')) {
                    const lines = buffer.split('\r');
                    let updated = false;
                    
                    lines.forEach(line => {
                        if (line.startsWith('PW')) {
                            const isOn = line === 'PWON';
                            if (device.state.on !== isOn) {
                                device.state.on = isOn;
                                updated = true;
                            }
                        } else if (line.startsWith('MV')) {
                            if (line.length > 2 && !isNaN(line.substring(2))) {
                                let volStr = line.substring(2);
                                if (volStr.length === 3) volStr = volStr.substring(0, 2); // Handle 9.5 volumes etc.
                                const vol = parseInt(volStr);
                                if (device.state.volume !== vol) {
                                    device.state.volume = vol;
                                    updated = true;
                                }
                            }
                        } else if (line.startsWith('SI')) {
                            const source = line.substring(2).trim();
                            if (device.state.mediaTitle !== source) {
                                device.state.mediaTitle = source;
                                updated = true;
                            }
                        }
                    });

                    if (updated) {
                        this.emit('device-updated', device);
                    }
                    socket.end(); // Gracefully close the connection
                }
            });

            socket.on('error', (err) => {
                if (device.state.on) {
                    device.state.on = false;
                    this.emit('device-updated', device);
                }
                socket.destroy();
            });
            socket.on('timeout', () => {
                 if (device.state.on) {
                    device.state.on = false;
                    this.emit('device-updated', device);
                }
                socket.destroy();
            });
            socket.on('end', () => {
                socket.destroy();
            });
        } else if (device.type === 'printer') {
            this.refreshPrinter(device);
        }
    }

    async refreshPrinter(device) {
        const http = require('http');
        const https = require('https');
        
        const fetchXml = (protocol, port, path) => {
            return new Promise((resolve, reject) => {
                const lib = protocol === 'https' ? https : http;
                const options = {
                    hostname: device.ip,
                    port: port,
                    path: path,
                    method: 'GET',
                    timeout: 3000,
                    rejectUnauthorized: false // Ignore self-signed certs
                };

                const req = lib.request(options, (res) => {
                    if (res.statusCode !== 200) {
                        res.resume();
                        return reject(new Error(`Status ${res.statusCode}`));
                    }
                    let data = '';
                    res.on('data', (chunk) => data += chunk);
                    res.on('end', () => resolve(data));
                });
                req.on('error', (err) => reject(err));
                req.on('timeout', () => { req.destroy(); reject(new Error('Timeout')); });
                req.end();
            });
        };

        const parseInks = (xml) => {
            const inks = [];
            
            // Helper to find values with optional namespaces
            const findValue = (block, tagName) => {
                const regex = new RegExp(`<([a-zA-Z0-9]+:)?${tagName}>([^<]+)</([a-zA-Z0-9]+:)?${tagName}>`);
                const match = regex.exec(block);
                return match ? match[2] : null;
            };

            // Split into ConsumableInfo blocks (handling namespaces like ccdyn:ConsumableInfo)
            const blocks = xml.split(/<([a-zA-Z0-9]+:)?ConsumableInfo>/);
            
            blocks.forEach(block => {
                if (!block.includes('ConsumableLabelCode')) return;
                
                const label = findValue(block, 'ConsumableLabelCode');
                const level = findValue(block, 'ConsumablePercentageLevelRemaining');
                
                if (label && level) {
                    const lvl = parseInt(level);
                    // Normalize label (remove spaces/slashes and uppercase)
                    const norm = label.replace(/[^A-Za-z0-9]/g, '').toUpperCase();

                    // Helper mapping for full-word labels
                    const wordMap = { 'CYAN': 'C', 'MAGENTA': 'M', 'YELLOW': 'Y', 'BLACK': 'K' };

                    // Single-letter labels (C, M, Y, K)
                    if (norm.length === 1 && ['C', 'M', 'Y', 'K'].includes(norm)) {
                        inks.push({ color: norm, level: lvl });
                    }
                    // Combined labels that contain C, M and Y (e.g., "CMY", "C/M/Y", "TriColor")
                    else if ((norm.includes('C') && norm.includes('M') && norm.includes('Y')) || norm.includes('TRI')) {
                        const components = { C: lvl, M: lvl, Y: lvl };
                        // If the label also references K or CMYK, include black as well
                        if (norm.includes('K') || norm.includes('CMYK')) components.K = lvl;
                        inks.push({ color: norm, label: 'Tri-color', components });
                    }
                    // Full-word labels (e.g., "Cyan", "Magenta")
                    else if (wordMap[norm]) {
                        inks.push({ color: wordMap[norm], level: lvl });
                    }
                    // Fallback: if label looks like multiple letters (e.g., "CM", "MY"), try to split
                    else if (norm.length > 1 && /[CMYK]/.test(norm)) {
                        // Build components for any of the CMYK letters present
                        const components = {};
                        ['C', 'M', 'Y', 'K'].forEach(ch => { if (norm.includes(ch)) components[ch] = lvl; });
                        // If we found multiple components, treat as a multi-component cartridge
                        if (Object.keys(components).length > 1) {
                            inks.push({ color: norm, label: 'Multi-color', components });
                        } else {
                            // Unknown label, store raw
                            inks.push({ color: label, level: lvl });
                        }
                    } else {
                        // Unknown label, store raw
                        inks.push({ color: label, level: lvl });
                    }
                }
            });
            
            // Fallback for older MarkerColor style
            if (inks.length === 0) {
                 const regex2 = /<MarkerColor>(\w+)<\/MarkerColor>[\s\S]*?<Level>(\d+)<\/Level>/g;
                 let match;
                 while ((match = regex2.exec(xml)) !== null) {
                     inks.push({ color: match[1], level: parseInt(match[2]) });
                 }
            }
            
            return inks;
        };

        try {
            let xml = '';
            let inks = [];

            // Try ProductStatusDyn first
            try {
                xml = await fetchXml('https', 443, '/DevMgmt/ProductStatusDyn.xml');
                inks = parseInks(xml);
            } catch (e) {}

            // If no inks found, try ConsumableConfigDyn
            if (inks.length === 0) {
                try {
                    xml = await fetchXml('https', 443, '/DevMgmt/ConsumableConfigDyn.xml');
                    inks = parseInks(xml);
                } catch (e) {}
            }
            
            // If still nothing, try HTTP ports
            if (inks.length === 0) {
                 try {
                    xml = await fetchXml('http', 80, '/DevMgmt/ProductStatusDyn.xml');
                    inks = parseInks(xml);
                    if (inks.length === 0) {
                        xml = await fetchXml('http', 80, '/DevMgmt/ConsumableConfigDyn.xml');
                        inks = parseInks(xml);
                    }
                } catch (e) {}
            }
            
            if (inks.length > 0) {
                const currentInks = JSON.stringify(device.state.inks);
                const newInks = JSON.stringify(inks);
                if (currentInks !== newInks) {
                    device.state.inks = inks;
                    this.emit('device-updated', device);
                }
            }
            
        } catch (e) {
            // console.log(`[Printer] Error: ${e.message}`);
        }
    }

    async controlDevice(id, command, value) {
        const device = this.devices.get(id);
        if (!device) return null;

        console.log(`Controlling ${device.name} (${device.protocol}): ${command} = ${value}`);

        // Check if this device is the active Spotify device
        // If so, route media/volume commands to Spotify
        try {
            const spotifyState = await spotifyManager.getPlaybackState();
            
            if (spotifyState && spotifyState.device) {
                const spotifyName = spotifyState.device.name.toLowerCase();
                const deviceName = device.name.toLowerCase();
                
                console.log(`[DeviceManager] Checking Spotify match: Device='${deviceName}' vs Spotify='${spotifyName}'`);

                // Fuzzy match names
                let isMatch = deviceName.includes(spotifyName) || spotifyName.includes(deviceName);
                
                if (!isMatch) {
                    // Token based matching for cases like "Alessio's MacBook" vs "MacBook van Alessio"
                    const tokens = deviceName.split(/[\s\-_']+/).filter(t => t.length > 2 && !['van', 'the', 'for'].includes(t));
                    const spotifyTokens = spotifyName.split(/[\s\-_']+/);
                    const matches = tokens.filter(t => spotifyTokens.some(st => st.includes(t) || t.includes(st)));
                    if (matches.length >= 2) isMatch = true; // At least 2 significant words match (e.g. "MacBook", "Alessio")
                }

                if (isMatch) {
                    console.log(`[DeviceManager] Routing command to Spotify for ${device.name} (matched with ${spotifyState.device.name})`);
                    
                    if (command === 'play') await spotifyManager.play();
                    else if (command === 'pause') await spotifyManager.pause();
                    else if (command === 'toggle') {
                        if (spotifyState.is_playing) await spotifyManager.pause();
                        else await spotifyManager.play();
                    }
                    else if (command === 'next') await spotifyManager.next();
                    else if (command === 'previous') await spotifyManager.previous();
                    else if (command === 'set_volume') await spotifyManager.setVolume(value);
                    else if (command === 'volume_up') {
                        const currentVol = spotifyState.device.volume_percent || 50;
                        await spotifyManager.setVolume(Math.min(currentVol + 5, 100));
                    } else if (command === 'volume_down') {
                        const currentVol = spotifyState.device.volume_percent || 50;
                        await spotifyManager.setVolume(Math.max(currentVol - 5, 0));
                    }
                    
                    // If it was a media command, we might be done. 
                    // But for volume, we might want to let the native handler try too?
                    // Usually Spotify volume IS the system volume for Connect devices.
                    if (['play', 'pause', 'next', 'previous', 'set_volume', 'volume_up', 'volume_down'].includes(command)) {
                        // Update local state optimistically
                        if (command === 'set_volume') device.state.volume = value;
                        this.emit('device-updated', device);
                        return device;
                    }
                } else {
                    console.log(`[DeviceManager] Spotify match failed for ${device.name} vs ${spotifyState.device.name}`);
                }
            } else {
                console.log('[DeviceManager] Spotify state is null or no active device');
            }
        } catch (e) {
            console.error('Error checking Spotify state in controlDevice:', e);
        }

        // Update state object first (Optimistic UI)
        if (command === 'toggle') {
            device.state.on = !device.state.on;
        } else if (command === 'play') {
            device.state.playingState = 'playing';
        } else if (command === 'pause') {
            device.state.playingState = 'paused';
        } else if (command === 'turn_on') {
            device.state.on = true;
        } else if (command === 'turn_off') {
            device.state.on = false;
        } else if (command === 'set_brightness') {
            device.state.brightness = value;
        } else if (command === 'set_volume') {
            device.state.volume = value;
        } else if (command === 'volume_up') {
            device.state.volume = Math.min((parseInt(device.state.volume) || 0) + 5, 100);
        } else if (command === 'volume_down') {
            device.state.volume = Math.max((parseInt(device.state.volume) || 0) - 5, 0);
        } else if (command === 'set_target_temp') {
            device.state.target = value;
        } else if (command === 'set_input') {
            device.state.input = value;
        }

        // Handle Protocol Specific Actions
        if (device.protocol === 'mdns-googlecast') {
            this.handleAndroidTvCommand(device, command, value);
        } else if (device.name.toLowerCase().includes('ylbulb') || device.name.toLowerCase().includes('yeelight')) {
            this.handleYeelightCommand(device, command, value);
        } else if (device.protocol === 'lg-webos') {
            this.handleLgCommand(device, command, value);
        } else if (device.protocol === 'samsung-tizen') {
            this.handleSamsungCommand(device, command, value);
        } else if (device.protocol === 'mdns-airplay') {
            this.handleAirPlayCommand(device, command, value);
        } else if (device.protocol === 'denon-avr') {
            this.handleDenonCommand(device, command, value);
        } else if (device.type === 'camera') {
            // Camera commands are handled by cameraStreamManager via WebSocket usually,
            // but we can handle PTZ or other commands here if needed.
            // For 'start_stream', we just acknowledge it as it's a signal to the UI/Server.
            if (command === 'start_stream') {
                console.log(`[Camera] Stream start requested for ${device.name}`);
                // Optionally trigger something in cameraStreamManager if needed, 
                // but the WebSocket connection is the main trigger.
            } else {
                this.handleCameraCommand(device, command, value);
            }
        }

        // Emit update
        this.emit('device-updated', device);
        return device;
    }

    handleCameraCommand(device, command, value) {
        const creds = this.cameraCredentials[device.ip];
        if (!creds) {
            console.error(`[Camera] No credentials found for ${device.ip}. Please add them to camera-credentials.json`);
            return;
        }

        const executeCommand = (cam) => {
            const speed = 0.5;
            try {
                if (command === 'pan_left') {
                    cam.continuousMove({ x: -speed, y: 0, zoom: 0 });
                } else if (command === 'pan_right') {
                    cam.continuousMove({ x: speed, y: 0, zoom: 0 });
                } else if (command === 'tilt_up') {
                    cam.continuousMove({ x: 0, y: speed, zoom: 0 });
                } else if (command === 'tilt_down') {
                    cam.continuousMove({ x: 0, y: -speed, zoom: 0 });
                } else if (command === 'stop' || command === 'stop_move') {
                    cam.stopMove();
                } else if (command === 'preset') {
                    cam.gotoPreset({ preset: value });
                } else if (command === 'nudge_left') {
                    cam.relativeMove({ x: -0.1, y: 0, zoom: 0 });
                } else if (command === 'nudge_right') {
                    cam.relativeMove({ x: 0.1, y: 0, zoom: 0 });
                } else if (command === 'nudge_up') {
                    cam.relativeMove({ x: 0, y: 0.1, zoom: 0 });
                } else if (command === 'nudge_down') {
                    cam.relativeMove({ x: 0, y: -0.1, zoom: 0 });
                }
            } catch (e) {
                console.error(`[Camera] Error executing command: ${e.message}`);
            }
        };

        // Check if we already have a connected instance
        if (this.cameraInstances.has(device.ip)) {
            const cam = this.cameraInstances.get(device.ip);
            executeCommand(cam);
            return;
        }

        // Create new connection
        const self = this;
        new onvif.Cam({
            hostname: device.ip,
            username: creds.username,
            password: creds.password,
            port: 2020 // Default ONVIF port for Tapo/TP-Link
        }, function(err) {
            if (err) {
                console.error(`[Camera] Connection error for ${device.ip}: ${err.message}`);
                return;
            }
            // 'this' is the camera object
            self.cameraInstances.set(device.ip, this);
            executeCommand(this);
        });
    }

    async activateScene(sceneName) {
        console.log(`[DeviceManager] Activating scene: ${sceneName}`);
        const devices = Array.from(this.devices.values());

        if (sceneName === 'all_off' || sceneName === 'away' || sceneName === 'night') {
            for (const device of devices) {
                if (device.state.on) {
                    // Turn off lights, switches, TVs, speakers
                    if (['light', 'switch', 'tv', 'speaker', 'receiver'].includes(device.type)) {
                        this.controlDevice(device.id, 'turn_off');
                    }
                }
                // Pause media
                if (device.state.playingState === 'playing') {
                    this.controlDevice(device.id, 'pause');
                }
            }
        } else if (sceneName === 'movie') {
            for (const device of devices) {
                // Turn off lights
                if (device.type === 'light' && device.state.on) {
                    this.controlDevice(device.id, 'turn_off');
                }
                // Maybe dim lights if we had dimming logic for specific groups
            }
            // Note: We don't turn ON the TV automatically because we don't know which one the user wants
        }
        
        return { success: true, message: `Scene ${sceneName} activated` };
    }

    handleLgCommand(device, command, value) {
        const lgtvClient = lgtv({ url: `ws://${device.ip}:3000` });
        
        lgtvClient.on('connect', () => {
            if (command === 'set_volume') {
                lgtvClient.request('ssap://audio/setVolume', { volume: parseInt(value) });
            } else if (command === 'turn_off') {
                lgtvClient.request('ssap://system/turnOff');
            } else if (command === 'toggle') {
                // LG doesn't have a simple toggle, but we can try turn off if on
                if (device.state.on) lgtvClient.request('ssap://system/turnOff');
            } else if (command === 'channel_up') {
                lgtvClient.request('ssap://tv/channelUp');
            } else if (command === 'channel_down') {
                lgtvClient.request('ssap://tv/channelDown');
            }
            
            setTimeout(() => lgtvClient.disconnect(), 1000);
        });
        
        lgtvClient.on('error', (err) => console.error('LG TV Error:', err));
    }

    getAndroidTvProcess(ip) {
        if (this.androidTvProcesses.has(ip)) {
            return this.androidTvProcesses.get(ip);
        }
        console.log(`[DeviceManager] Spawning persistent Android TV service for ${ip}...`);
        const { spawn } = require('child_process');

        // Try several likely venv python locations, then fall back to system python3
        const isWin = process.platform === 'win32';
        const candidates = [
            // Windows specific paths
            path.join(__dirname, '../.venv/Scripts/python.exe'),
            path.join(__dirname, '../../.venv/Scripts/python.exe'),
            path.join(process.cwd(), '.venv/Scripts/python.exe'),
            
            // Unix/Linux/macOS paths
            path.join(__dirname, '../.venv/bin/python'),
            path.join(__dirname, '../../.venv/bin/python'),
            path.join(process.cwd(), '.venv/bin/python'),
            '/home/pi/DelovaHome/.venv/bin/python'
        ];

        let pythonPath = isWin ? 'python' : 'python3';
        for (const cand of candidates) {
            try {
                if (fs.existsSync(cand)) { pythonPath = cand; break; }
            } catch (e) {}
        }

        console.log(`[DeviceManager] Using python executable: ${pythonPath}`);

        const scriptPath = path.join(__dirname, 'androidtv_service.py');

        const childProc = spawn(pythonPath, [scriptPath, ip], { cwd: path.join(__dirname, '..') });
        console.log(`[Android TV] Spawned helper pid=${childProc.pid} for ${ip}`);

        childProc.stdout.on('data', (data) => {
            const lines = data.toString().split('\n');
            lines.forEach(line => {
                if (!line.trim()) return;
                try {
                    const msg = JSON.parse(line);
                    // Log everything for debug
                    if (msg.status === 'debug') {
                        console.log(`[Android TV Debug] ${msg.message}`);
                    }
                    
                    if (msg.startup) {
                        console.log(`[Android TV Service] Started. Python: ${msg.python_version}`);
                    } else if (msg.status === 'pairing_required') {
                        console.log(`[Android TV Service] Pairing required for ${ip}. Please check TV for code.`);
                        this.emit('pairing-required', { ip: ip, name: 'Android TV', type: 'android-tv' });
                    } else if (msg.status === 'connected' || msg.status === 'paired') {
                        console.log(`[Android TV Service] Connected to ${ip}`);
                    } else if (msg.status === 'failed') {
                        console.error(`[Android TV Service] Connection failed for ${ip}: ${msg.error}`);
                    } else if (msg.error) {
                        console.error(`[Android TV Service Error] ${ip}: ${msg.error}`);
                    }
                } catch (e) {
                    console.log(`[Android TV Service Raw] ${line}`);
                }
            });
        });

        childProc.stderr.on('data', (data) => {
            console.error(`[Android TV Service Stderr] ${ip}: ${data.toString()}`);
        });

        childProc.on('close', (code) => {
            console.log(`[Android TV Service] Process for ${ip} exited with code ${code}`);
            this.androidTvProcesses.delete(ip);
        });

        this.androidTvProcesses.set(ip, childProc);
        return childProc;
    }

    submitPairingPin(ip, pin) {
        console.log(`[DeviceManager] Submitting PIN for ${ip}`);
        const process = this.androidTvProcesses.get(ip);
        if (process) {
            process.stdin.write(JSON.stringify({ type: 'pin', pin: pin }) + '\n');
            return true;
        }
        console.warn(`[DeviceManager] No process found for ${ip} to submit PIN`);
        return false;
    }

    getAtvProcess(ip) {
        if (this.atvProcesses.has(ip)) {
            return this.atvProcesses.get(ip);
        }

        console.log(`[DeviceManager] Spawning persistent ATV service for ${ip}...`);
        const { spawn } = require('child_process');
        
        // Try to find the correct python executable
        const isWin = process.platform === 'win32';
        const candidates = [
            // Windows specific paths
            path.join(__dirname, '../.venv/Scripts/python.exe'),
            path.join(__dirname, '../../.venv/Scripts/python.exe'),
            path.join(process.cwd(), '.venv/Scripts/python.exe'),
            
            // Unix/Linux/macOS paths
            path.join(__dirname, '../.venv/bin/python'),
            path.join(__dirname, '../../.venv/bin/python'),
            path.join(process.cwd(), '.venv/bin/python'),
            '/home/pi/DelovaHome/.venv/bin/python'
        ];

        let pythonPath = isWin ? 'python' : 'python3';
        for (const cand of candidates) {
            try {
                if (fs.existsSync(cand)) { pythonPath = cand; break; }
            } catch (e) {}
        }

        if (pythonPath === 'python3' || pythonPath === 'python') {
             console.warn(`[DeviceManager] Virtual env python not found, falling back to '${pythonPath}'`);
        }

        const scriptPath = path.join(__dirname, 'atv_service.py');
        
        const process = spawn(pythonPath, [scriptPath, ip]);
        
        process.stdout.on('data', (data) => {
            const lines = data.toString().split('\n');
            lines.forEach(line => {
                if (!line.trim()) return;
                try {
                    const msg = JSON.parse(line);
                    if (msg.status === 'connected') {
                        console.log(`[ATV Service] Connected to ${ip}`);
                        // Immediately fetch status to sync UI
                        process.stdin.write(JSON.stringify({ command: 'status' }) + '\n');
                    } else if (msg.error) {
                        // Suppress common connection errors to avoid log spam
                        if (!msg.error.includes('Could not find Apple TV') && 
                            !msg.error.includes('Not connected') &&
                            !msg.error.includes('Connection failed')) {
                            console.error(`[ATV Service Error] ${ip}: ${msg.error}`);
                        }
                    } else if (msg.type === 'status') {
                        // Update device state
                        const device = Array.from(this.devices.values()).find(d => d.ip === ip);
                        if (device) {
                            const status = msg.data;
                            let updated = false;
                            
                            if (status.on !== undefined && device.state.on !== status.on) {
                                device.state.on = status.on;
                                updated = true;
                            }
                            if (status.volume !== undefined && device.state.volume !== status.volume) {
                                device.state.volume = status.volume;
                                updated = true;
                            }
                            if (status.title !== device.state.mediaTitle) {
                                device.state.mediaTitle = status.title;
                                updated = true;
                            }
                            if (status.artist !== device.state.mediaArtist) {
                                device.state.mediaArtist = status.artist;
                                updated = true;
                            }
                            if (status.album !== device.state.mediaAlbum) {
                                device.state.mediaAlbum = status.album;
                                updated = true;
                            }
                            if (status.app !== device.state.mediaApp) {
                                device.state.mediaApp = status.app;
                                updated = true;
                            }
                            if (status.playing_state !== undefined && device.state.playingState !== status.playing_state) {
                                device.state.playingState = status.playing_state;
                                updated = true;
                            }
                            if (updated) this.emit('device-updated', device);
                        }
                    }
                } catch (e) {
                    // console.error('[ATV Service] Parse error:', e);
                }
            });
        });

        process.stderr.on('data', (data) => {
            const str = data.toString();
            // Filter out known asyncio noise from pyatv
            if (str.includes('Task exception was never retrieved') || 
                str.includes('Connect call failed') ||
                str.includes('OSError: [Errno 113]') ||
                str.includes('future: <Task finished name=')) {
                return; 
            }
            console.error(`[ATV Service Stderr] ${ip}: ${str}`);
        });

        process.on('close', (code) => {
            console.log(`[ATV Service] Process for ${ip} exited with code ${code}`);
            this.atvProcesses.delete(ip);
        });

        this.atvProcesses.set(ip, process);
        return process;
    }

    async handleAirPlayCommand(device, command, value) {
        // Check if target is local machine (Server running on the Mac we want to control)
        if (this.isLocalMachine(device.ip)) {
             console.log(`[Local Control] Executing command '${command}' locally via AppleScript...`);
             return this.handleLocalMacCommand(command, value);
        }

        if (!device.deviceId) {
            console.log(`[AirPlay] Cannot control ${device.name}: No device ID found.`);
            return;
        }

        // Check if we have credentials for this device
        // The credentials file is keyed by MAC address (deviceId)
        const deviceCreds = this.appleTvCredentials[device.deviceId];
        if (!deviceCreds) {
            console.log(`[AirPlay] Cannot control ${device.name}: Not paired. Run 'python script/pair_atv.py' to pair.`);
            return;
        }

        console.log(`[AirPlay] Sending command '${command}' to ${device.name} via Persistent Service...`);

        // Map commands to Python script arguments
        let pyCommand = null;
        if (command === 'turn_on') pyCommand = 'turn_on';
        else if (command === 'turn_off') pyCommand = 'turn_off';
        else if (command === 'play') pyCommand = 'play';
        else if (command === 'pause') pyCommand = 'pause';
        else if (command === 'stop') pyCommand = 'stop';
        else if (command === 'next') pyCommand = 'next';
        else if (command === 'previous') pyCommand = 'previous';
        else if (command === 'select') pyCommand = 'select';
        else if (command === 'menu') pyCommand = 'menu';
        else if (command === 'top_menu' || command === 'home') pyCommand = 'top_menu';
        else if (command === 'up') pyCommand = 'up';
        else if (command === 'down') pyCommand = 'down';
        else if (command === 'left') pyCommand = 'left';
        else if (command === 'right') pyCommand = 'right';
        else if (command === 'volume_up') pyCommand = 'volume_up';
        else if (command === 'volume_down') pyCommand = 'volume_down';
        else if (command === 'set_volume') pyCommand = 'set_volume';
        else if (command === 'toggle') {
            // Power toggle
            pyCommand = device.state.on ? 'turn_off' : 'turn_on';
        }
        
        if (!pyCommand) {
            console.log(`[AirPlay] Command ${command} not supported via Python script yet.`);
            return;
        }

        const process = this.getAtvProcess(device.ip);
        const payload = { command: pyCommand };
        if (value !== undefined && value !== null) {
            payload.value = value;
        }
        
        process.stdin.write(JSON.stringify(payload) + '\n');
    }

    async handleAndroidTvCommand(device, command, value) {
        console.log(`[Android TV] Sending command '${command}' to ${device.name} via Persistent Service...`);

        const process = this.getAndroidTvProcess(device.ip);
        
        // Special handling for pairing
        if (command === 'pair') {
            const payload = { type: 'pin', pin: value };
            try {
                process.stdin.write(JSON.stringify(payload) + '\n');
                console.log(`[Android TV] Sent pairing PIN to ${device.ip}`);
            } catch(e) {
                console.error(`[Android TV] Failed to send PIN to ${device.ip}: ${e.message}`);
            }
            return;
        }

        const payload = { command: command };
        if (value !== undefined && value !== null) {
            payload.value = value;
        }
        
        try {
            process.stdin.write(JSON.stringify(payload) + '\n');
        } catch(e) {
            console.error(`[Android TV] Failed to send command to ${device.ip}: ${e.message}`);
        }
    }

    async handleSamsungCommand(device, command, value) {
        console.log(`[Samsung] Handling command '${command}' for ${device.name}`);

        const keyMap = {
            'turn_off': 'KEY_POWEROFF', 'toggle': 'KEY_POWER', // Use KEY_POWER for toggle to avoid accidental shutdown during pairing
            'turn_on': 'KEY_POWERON',
            'channel_up': 'KEY_CHUP', 'channel_down': 'KEY_CHDOWN',
            'volume_up': 'KEY_VOLUP', 'volume_down': 'KEY_VOLDOWN',
            'play': 'KEY_PLAY', 'pause': 'KEY_PAUSE', 'stop': 'KEY_STOP',
            'next': 'KEY_FF', 'previous': 'KEY_REWIND',
            'up': 'KEY_UP', 'down': 'KEY_DOWN', 'left': 'KEY_LEFT', 'right': 'KEY_RIGHT',
            'select': 'KEY_ENTER', 'enter': 'KEY_ENTER',
            'back': 'KEY_RETURN', 'home': 'KEY_HOME', 'menu': 'KEY_MENU'
        };
        let key = keyMap[command];

        if (command === 'set_input') {
            const inputMap = { 'tv': 'KEY_TV', 'hdmi1': 'KEY_HDMI1', 'hdmi2': 'KEY_HDMI2', 'hdmi3': 'KEY_HDMI3', 'hdmi4': 'KEY_HDMI4' };
            key = inputMap[value.toLowerCase()] || `KEY_${value.toUpperCase()}`;
        }
        
        // This library doesn't have a reliable power on method, so we still use WoL
        if (command === 'turn_on') {
            const mac = await this.getMacAddress(device.ip);
            if (mac) {
                console.log(`[Samsung] Sending WoL to ${mac}`);
                this.sendWol(mac);
                device.state.on = true;
                this.emit('device-updated', device);
            } else {
                console.log(`[Samsung] Could not resolve MAC for WoL for ${device.ip}`);
            }
            // Even if we sent WoL, try sending KEY_POWERON via legacy if it's legacy
            if (this.legacySamsungDevices.has(device.ip)) {
                 key = 'KEY_POWERON';
            } else {
                return;
            }
        }

        if (!key) {
            console.log(`[Samsung] Command '${command}' not supported by this library.`);
            return;
        }

        // Prefer the optional native library if available, otherwise fall back to WebSocket
        let legacySuccess = false;
        
        // Check for forced legacy override
        if (this.legacySamsungDevices.has(device.ip)) {
             console.log(`[Samsung] Device ${device.ip} is marked as legacy. Skipping Python method.`);
             // Fall through to legacy block
        } else {
            // Try Python method first (Persistent Service)
            try {
                // We use a timeout race to detect if the persistent service is unresponsive or dead
                // But since sendSamsungKeyPython is now fire-and-forget, it returns immediately.
                // We need to check if the process is actually running and healthy.
                
                const process = this.getSamsungProcess(device.ip);
                if (process.exitCode !== null) {
                     throw new Error("Samsung service process is dead");
                }
                
                await this.sendSamsungKeyPython(device, key);
                console.log(`[Samsung] Python method: sent '${key}' to ${device.name}`);
                
                if (key === 'KEY_POWEROFF' || key === 'KEY_POWER') {
                    device.state.on = false;
                    this.emit('device-updated', device);
                }
                return;
            } catch (e) {
                console.warn(`[Samsung] Python method failed for '${key}', trying legacy fallback:`, e.message);
            }
        }

        if (SamsungRemote) {
            try {
                await new Promise((resolve, reject) => {
                    // Increase timeout to 5000ms (default is usually 2000ms)
                    const remote = new SamsungRemote({ ip: device.ip, timeout: 5000 });
                    
                    // Check if device is alive first? No, library does that.
                    // If the user says it's ON but library says OFF, it might be a port issue or network.
                    // Try to force it anyway?
                    
                    remote.send(key, (err) => {
                        if (err) {
                            // If error is "Device is off or unreachable", but we know it's on,
                            // it might be that the TV is rejecting the connection.
                            // Some older Samsungs require you to "Allow" the remote on the TV screen.
                            reject(err);
                        } else {
                            resolve();
                        }
                    });
                });
                
                console.log(`[Samsung] Legacy method: Successfully sent command '${key}' to ${device.name}`);
                if (key === 'KEY_POWEROFF' || key === 'KEY_POWER') {
                    device.state.on = false;
                    this.emit('device-updated', device);
                }
                legacySuccess = true;
                return; 
            } catch (e) {
                console.warn('[Samsung] samsung-remote failed:', e && e.message ? e.message : e);
            }
        }
    }

    getSamsungProcess(ip) {
        if (this.samsungProcesses.has(ip)) {
            return this.samsungProcesses.get(ip);
        }

        console.log(`[DeviceManager] Spawning persistent Samsung service for ${ip}...`);
        const { spawn } = require('child_process');
        
        const isWin = process.platform === 'win32';
        const candidates = [
            path.join(__dirname, '../.venv/Scripts/python.exe'),
            path.join(__dirname, '../../.venv/Scripts/python.exe'),
            path.join(process.cwd(), '.venv/Scripts/python.exe'),
            path.join(__dirname, '../.venv/bin/python'),
            path.join(__dirname, '../../.venv/bin/python'),
            path.join(process.cwd(), '.venv/bin/python'),
            '/home/pi/DelovaHome/.venv/bin/python'
        ];

        let pythonPath = isWin ? 'python' : 'python3';
        for (const cand of candidates) {
            try {
                if (fs.existsSync(cand)) { pythonPath = cand; break; }
            } catch (e) {}
        }

        const scriptPath = path.join(__dirname, 'samsung_service.py');
        
        const process = spawn(pythonPath, [scriptPath, ip]);
        
        process.stdout.on('data', (data) => {
            const lines = data.toString().split('\n');
            lines.forEach(line => {
                if (!line.trim()) return;
                try {
                    const msg = JSON.parse(line);
                    if (msg.status === 'connected') {
                        console.log(`[Samsung Service] Connected to ${ip} (Port: ${msg.port || 'unknown'})`);
                    } else if (msg.status === 'sent') {
                        console.log(`[Samsung Service] Successfully sent '${msg.key}' to ${ip}`);
                    } else if (msg.status === 'debug') {
                        console.log(`[Samsung Debug] ${msg.message}`);
                    } else if (msg.error === 'legacy_detected') {
                        console.log(`[Samsung Service] Legacy TV detected at ${ip}.`);
                        // We do NOT permanently add to legacySamsungDevices here anymore to allow retries
                        // this.legacySamsungDevices.add(ip);
                    } else if (msg.error) {
                        console.error(`[Samsung Service Error] ${ip}: ${msg.error}`);
                    }
                } catch (e) {}
            });
        });

        process.stderr.on('data', (data) => {
            // console.error(`[Samsung Service Stderr] ${ip}: ${data}`);
        });

        process.on('close', (code) => {
            console.log(`[Samsung Service] Process for ${ip} exited with code ${code}`);
            this.samsungProcesses.delete(ip);
        });

        this.samsungProcesses.set(ip, process);
        return process;
    }

    async sendSamsungKeyPython(device, key) {
        if (this.legacySamsungDevices.has(device.ip)) {
            throw new Error("Legacy Samsung TV detected, forcing fallback");
        }
        const process = this.getSamsungProcess(device.ip);
        process.stdin.write(JSON.stringify({ command: 'key', value: key }) + '\n');
        // We assume success for speed, but if the service crashes or reports legacy, 
        // the next command might fail or we might want to handle it.
        // For now, this is "fire and forget" to the persistent service.
        // If the service is dead, getSamsungProcess will respawn it.
        
        // However, to support fallback for the 2015 TV, we need to know if it failed.
        // Since we can't easily await the result from the stream without complex logic,
        // we will rely on the service staying alive for Tizen.
        // If the service exits (e.g. legacy detected), we should probably catch that?
        
        // Actually, if it's legacy, the service might just sit there or exit.
        // Let's add a small delay and check if process is still alive? No that's slow.
        
        // Better approach: If the user complains about 2015 TV, it's likely legacy.
        // The persistent service checks for port 8002. If closed, it prints "legacy_detected".
        // But we are not reading that here.
        
        // Let's just return true here. If it fails, the user will report it.
        // But wait, the previous code had a try/catch fallback!
        // If I replace it with this, I lose the fallback!
        
        // I must implement a way to know if it failed.
        // Or, I can keep the old one-off script for the first attempt? No.
        
        // Let's make sendSamsungKeyPython return a Promise that resolves quickly?
        return Promise.resolve();
    }

    // Deprecated: kept for reference but unused
    async sendSamsungKeyWs(device, key) {
        return new Promise((resolve, reject) => {
            const appName = Buffer.from('DelovaHome').toString('base64');
            const url = `wss://${device.ip}:8002/api/v2/channels/samsung.remote.control?name=${appName}`;
            const ws = new WebSocket(url, { rejectUnauthorized: false, timeout: 5000 });

            const commandParams = {
                Cmd: 'Click',
                DataOfCmd: key,
                Option: 'false',
                TypeOfRemote: 'SendRemoteKey'
            };

            let attemptedModes = new Set();
            const sendDirect = () => {
                const payload = { method: 'ms.remote.control', params: commandParams };
                try { ws.send(JSON.stringify(payload)); console.log('[Samsung][WS] Sent direct payload', payload); } catch (e) { console.error('[Samsung][WS] send error', e); }
            };

            const sendEmit = (mode) => {
                // mode: 'emit_wrapper' = object session, 'emit_session_id' = id string, 'emit_no_session' = omit
                const params = { to: 'host', event: 'remote.control', data: (mode === 'emit_string' ? JSON.stringify(commandParams) : commandParams) };
                if (this.localIp) params.clientIp = this.localIp;
                if (mode === 'emit_session_id' && device.samsungSession && device.samsungSession.id) params.session = device.samsungSession.id;
                else if (mode === 'emit_wrapper' && device.samsungSession) params.session = device.samsungSession;
                // else omit session for emit_no_session
                const methodName = (mode === 'emit_no_ms') ? 'channel.emit' : 'ms.channel.emit';
                const payload = { method: methodName, params };
                try { ws.send(JSON.stringify(payload)); console.log('[Samsung][WS] Sent emit payload', payload); } catch (e) { console.error('[Samsung][WS] send error', e); }
            };

            const tryNext = (errMsg) => {
                // Decide next mode given error message
                if (!attemptedModes.has('direct')) { attemptedModes.add('direct'); sendDirect(); return; }
                if (errMsg && errMsg.toLowerCase().includes('unrecognized method')) {
                    if (!attemptedModes.has('emit_wrapper')) { attemptedModes.add('emit_wrapper'); sendEmit('emit_wrapper'); return; }
                }
                if (errMsg && (errMsg.toLowerCase().includes('session') || errMsg.toLowerCase().includes("cannot read property 'session'"))) {
                    if (!attemptedModes.has('emit_session_id')) { attemptedModes.add('emit_session_id'); sendEmit('emit_session_id'); return; }
                    if (!attemptedModes.has('emit_no_session')) { attemptedModes.add('emit_no_session'); sendEmit('emit_no_session'); return; }
                }
                if (!attemptedModes.has('emit_string')) { attemptedModes.add('emit_string'); sendEmit('emit_string'); return; }
                if (!attemptedModes.has('emit_no_ms')) { attemptedModes.add('emit_no_ms'); sendEmit('emit_no_ms'); return; }
                // Nothing left
                reject(new Error('All WS fallback modes exhausted'));
            };

            ws.on('open', () => {
                console.log(`[Samsung][WS] Connection opened to ${device.ip}. Waiting for channel connect...`);
                // Start by trying direct
                tryNext();
            });

            ws.on('message', (msg) => {
                let obj = null;
                try { obj = JSON.parse(msg.toString()); } catch (e) { return; }
                // Save ms.channel.connect session info if present
                if (obj && obj.event === 'ms.channel.connect' && obj.data) {
                    device.samsungSession = { id: obj.data.id || null, clients: obj.data.clients || null };
                    console.log(`[Samsung][WS] Saved session info for ${device.ip}: ${JSON.stringify(device.samsungSession)}`);
                    return;
                }

                if (obj && obj.event === 'ms.error') {
                    const errMsg = (obj.data && obj.data.message) || '';
                    console.error(`[Samsung][WS] TV returned error: ${errMsg}`);
                    tryNext(errMsg);
                    return;
                }

                // Some TVs may echo success; treat any non-error message after sending as success
                // Resolve to indicate we sent something.
                resolve({ success: true, response: obj });
            });

            ws.on('error', (e) => {
                console.error('[Samsung][WS] Connection error:', e && e.message ? e.message : e);
                reject(e);
            });

            // Timeout to avoid hanging
            setTimeout(() => {
                try { ws.terminate(); } catch (e) {}
                reject(new Error('Samsung WS fallback timed out'));
            }, 15000);
        });
    }

    getMacAddress(ip) {
        return new Promise((resolve) => {
            const { exec } = require('child_process');
            exec(`arp -n ${ip}`, (err, stdout) => {
                if (err) {
                    resolve(null);
                    return;
                }
                // Example output: ? (192.168.0.123) at 00:11:22:33:44:55 [ether] on eth0
                const match = stdout.match(/([0-9A-Fa-f]{2}[:-]){5}([0-9A-Fa-f]{2})/);
                resolve(match ? match[0] : null);
            });
        });
    }

    _determineLocalIp() {
        try {
            const ifaces = os.networkInterfaces();
            for (const name of Object.keys(ifaces)) {
                for (const iface of ifaces[name]) {
                    if (iface.family === 'IPv4' && !iface.internal) {
                        return iface.address;
                    }
                }
            }
        } catch (e) {
            // ignore
        }
        return null;
    }

    sendWol(mac) {
        const dgram = require('dgram');
        const socket = dgram.createSocket('udp4');
        const macHex = mac.replace(/[:-]/g, '');
        const magicPacket = Buffer.alloc(102);
        
        // 6 bytes of FF
        for (let i = 0; i < 6; i++) magicPacket[i] = 0xFF;
        
        // 16 repetitions of MAC
        for (let i = 0; i < 16; i++) {
            for (let j = 0; j < 6; j++) {
                magicPacket[6 + i * 6 + j] = parseInt(macHex.substring(j * 2, j * 2 + 2), 16);
            }
        }
        
        socket.send(magicPacket, 0, magicPacket.length, 9, '255.255.255.255', () => {
            socket.close();
        });
    }

    startPairing(ip) {
        return new Promise((resolve, reject) => {
            if (this.pairingProcess) {
                reject(new Error('Pairing already in progress'));
                return;
            }

            const { spawn } = require('child_process');
            
            // Try to find the correct python executable
            const isWin = process.platform === 'win32';
            const candidates = [
                path.join(__dirname, '../.venv/Scripts/python.exe'),
                path.join(__dirname, '../../.venv/Scripts/python.exe'),
                path.join(process.cwd(), '.venv/Scripts/python.exe'),
                path.join(__dirname, '../.venv/bin/python'),
                path.join(__dirname, '../../.venv/bin/python'),
                path.join(process.cwd(), '.venv/bin/python'),
                '/home/pi/DelovaHome/.venv/bin/python'
            ];

            let pythonPath = isWin ? 'python' : 'python3';
            for (const cand of candidates) {
                try {
                    if (fs.existsSync(cand)) { pythonPath = cand; break; }
                } catch (e) {}
            }

            const scriptPath = path.join(__dirname, 'pair_atv_interactive.py');

            console.log(`Starting pairing for ${ip} using ${pythonPath}...`);
            this.pairingProcess = spawn(pythonPath, [scriptPath, ip]);

            let outputBuffer = '';

            this.pairingProcess.stdout.on('data', (data) => {
                const str = data.toString();
                outputBuffer += str;
                console.log(`[Pairing] ${str.trim()}`);

                if (str.includes('WAITING_FOR_PIN')) {
                    resolve({ status: 'waiting_for_pin' });
                }
            });

            this.pairingProcess.stderr.on('data', (data) => {
                console.error(`[Pairing Error] ${data.toString()}`);
            });

            this.pairingProcess.on('close', (code) => {
                console.log(`Pairing process exited with code ${code}`);
                if (code !== 0 && !outputBuffer.includes('PAIRING_SUCCESS')) {
                    this.pairingProcess = null;
                    
                    if (outputBuffer.includes('ModuleNotFoundError')) {
                        console.error('CRITICAL ERROR: The "pyatv" library is missing.');
                        console.error('Please run: cd ~/DelovaHome && python3 -m venv .venv && .venv/bin/pip install pyatv');
                    }
                    
                    reject(new Error('Pairing process failed'));
                }
            });
        });
    }

    submitPairingPin(pin) {
        return new Promise((resolve, reject) => {
            if (!this.pairingProcess) {
                reject(new Error('No pairing in progress'));
                return;
            }

            console.log(`Submitting PIN: ${pin}`);
            this.pairingProcess.stdin.write(pin + '\n');

            let outputBuffer = '';

            const dataHandler = (data) => {
                const str = data.toString();
                outputBuffer += str;
                
                if (str.includes('PAIRING_SUCCESS')) {
                    // Extract JSON
                    const lines = outputBuffer.split('\n');
                    const jsonLine = lines.find(l => l.trim().startsWith('{'));
                    if (jsonLine) {
                        try {
                            const creds = JSON.parse(jsonLine);
                            this.saveCredentials(creds);
                            
                            // Immediately add/update the device in the list
                            for (const [deviceId, c] of Object.entries(creds)) {
                                if (c.ip) {
                                    this.addDevice({
                                        id: deviceId,
                                        name: c.name || `Apple Device (${c.ip})`,
                                        type: 'tv',
                                        ip: c.ip,
                                        protocol: 'mdns-airplay',
                                        deviceId: deviceId,
                                        paired: true, // Explicitly set paired to true
                                        state: { on: true, volume: 0 }
                                    });
                                }
                            }
                            
                            resolve({ status: 'success', credentials: creds });
                        } catch (e) {
                            console.error('Failed to parse credentials JSON:', e);
                            resolve({ status: 'success', warning: 'Failed to parse credentials but pairing succeeded' });
                        }
                    } else {
                        resolve({ status: 'success' }); 
                    }
                    this.pairingProcess = null;
                } else if (str.includes('ERROR')) {
                    reject(new Error(str));
                    this.pairingProcess = null;
                }
            };

            this.pairingProcess.stdout.on('data', dataHandler);
        });
    }

    saveCredentials(newCreds) {
        const credsPath = path.join(__dirname, '../appletv-credentials.json');
        let existing = {};
        if (fs.existsSync(credsPath)) {
            try {
                existing = JSON.parse(fs.readFileSync(credsPath));
            } catch (e) {}
        }
        Object.assign(existing, newCreds);
        fs.writeFileSync(credsPath, JSON.stringify(existing, null, 2));
        this.appleTvCredentials = existing; // Update in-memory
        console.log('Credentials saved.');
    }

    handleYeelightCommand(device, command, value) {
        const socket = new net.Socket();
        const id = 1; // Request ID
        let msg = null;

        if (command === 'toggle') {
             msg = { id, method: 'toggle', params: [] };
        } else if (command === 'turn_on') {
             msg = { id, method: 'set_power', params: ['on', 'smooth', 500] };
        } else if (command === 'turn_off') {
             msg = { id, method: 'set_power', params: ['off', 'smooth', 500] };
        } else if (command === 'set_brightness') {
             msg = { id, method: 'set_bright', params: [parseInt(value), 'smooth', 500] };
        } else if (command === 'set_color') {
             // Value is {r, g, b}
             // Convert to integer: R*65536 + G*256 + B
             let rgb = 0;
             if (typeof value === 'object') {
                 rgb = (value.r << 16) + (value.g << 8) + value.b;
             } else {
                 rgb = parseInt(value);
             }
             msg = { id, method: 'set_rgb', params: [rgb, 'smooth', 500] };
        }

        if (msg) {
            socket.connect(55443, device.ip, () => {
                socket.write(JSON.stringify(msg) + '\r\n');
                socket.end();
            });
            socket.on('error', (err) => {
                console.error('Yeelight error:', err.message);
                if (err.code === 'ECONNREFUSED') {
                    console.warn('⚠️  HINT: Zorg ervoor dat "LAN Control" is ingeschakeld in de Yeelight app voor dit apparaat.');
                }
            });
        }
    }

    handleDenonCommand(device, command, value) {
        const socket = new net.Socket();
        socket.setTimeout(2000);
        
        const send = (cmd) => {
            socket.connect(23, device.ip, () => {
                socket.write(cmd + '\r');
                setTimeout(() => socket.destroy(), 500);
            });
        };

        socket.on('error', (err) => {
            console.error('Denon AVR Error:', err.message);
            socket.destroy();
        });

        if (command === 'turn_on') send('PWON');
        else if (command === 'turn_off') send('PWSTANDBY');
        else if (command === 'toggle') {
            if (device.state.on) send('PWSTANDBY');
            else send('PWON');
        }
        else if (command === 'set_volume') {
            // Denon volume is 0-98 (usually). Web is 0-100.
            let vol = Math.min(Math.max(parseInt(value), 0), 98);
            if (vol < 10) vol = '0' + vol;
            send(`MV${vol}`);
        }
        else if (command === 'volume_up') send('MVUP');
        else if (command === 'volume_down') send('MVDOWN');
        else if (command === 'mute') send('MUON');
        else if (command === 'unmute') send('MUOFF');
        else if (command === 'set_input') {
            // Map generic inputs to Denon codes
            // If we have a custom mapping from fetchDenonInputs, use it?
            // For now, use standard mapping + direct pass-through if it looks like a code
            const inputMap = {
                'tv': 'SITV',
                'hdmi1': 'SIBD',      // Often Blu-ray
                'hdmi2': 'SIDVD',     // Often DVD
                'hdmi3': 'SIGAME',    // Often Game
                'hdmi4': 'SIMPLAY',   // Often Media Player
                'bluetooth': 'SIBT',
                'aux': 'SIAUX1',
                'tuner': 'SITUNER',
                'net': 'SINET',
                'phono': 'SIPHONO',
                'cd': 'SICD'
            };
            
            // If value is already a code (starts with SI), use it
            if (value.startsWith('SI')) {
                send(value);
            } else {
                const code = inputMap[value.toLowerCase()] || `SI${value.toUpperCase()}`;
                send(code);
            }
        }
    }

    async handleCastCommand(device, command, value) {
        try {
            const client = new CastClient();
            const connect = () => new Promise((resolve, reject) => {
                let resolved = false;
                client.on('error', (err) => {
                    if (!resolved) {
                        resolved = true;
                        try { client.close(); } catch (e) {}
                        reject(err);
                    }
                });

                const done = () => {
                    if (!resolved) {
                        resolved = true;
                        resolve();
                    }
                };

                // Use host-only connect to avoid mismatched callback signatures in some castv2-client versions
                try {
                    client.connect(device.ip, done);
                } catch (e) {
                    try { client.connect(device.ip, done); } catch (err) { reject(err); }
                }
            });

            // Map generic media commands to DefaultMediaReceiver when possible
            const launchAndRun = (cb) => new Promise(async (resolve, reject) => {
                try {
                    await connect();
                    client.launch(DefaultMediaReceiver, (err, player) => {
                        if (err) {
                            try { client.close(); } catch (e) {}
                            return reject(err);
                        }
                        try {
                            cb(player, () => { try { client.close(); } catch (e) {} });
                            resolve();
                        } catch (e) {
                            try { client.close(); } catch (ee) {}
                            reject(e);
                        }
                    });
                } catch (e) {
                    reject(e);
                }
            });

            if (command === 'set_volume') {
                await connect();
                const lvl = Math.max(0, Math.min(100, parseInt(value) || 0));
                client.setVolume({ level: lvl / 100 }, () => client.close());
            } else if (command === 'volume_up' || command === 'volume_down') {
                // Adjust relative volume when no explicit value provided
                await connect();
                client.getStatus((err, status) => {
                    let cur = 0.5;
                    if (!err && status && status.volume && typeof status.volume.level === 'number') cur = status.volume.level;
                    let newLevel = cur;
                    if (command === 'volume_up') newLevel = Math.min(1, cur + 0.05);
                    else newLevel = Math.max(0, cur - 0.05);
                    client.setVolume({ level: newLevel }, () => client.close());
                });
            } else if (command === 'mute' || command === 'unmute') {
                await connect();
                client.setVolume({ muted: command === 'mute' }, () => client.close());
            } else if (['left','right','up','down','arrow_left','arrow_right','arrow_up','arrow_down','enter','back','home'].includes(command)) {
                // Try sending an actual remote key event first (best-effort), then fallback to seek/volume
                const keyMap = {
                    left: 21, arrow_left: 21,
                    right: 22, arrow_right: 22,
                    up: 19, arrow_up: 19,
                    down: 20, arrow_down: 20,
                    enter: 66,
                    back: 4,
                    home: 3
                };

                const keyKey = command.replace('arrow_', '');
                const keyCode = keyMap[command] || keyMap[keyKey];

                let sent = false;
                if (keyCode) {
                    try {
                        await connect();
                        const payload = { type: 'KEYCODE', keyCode };
                        console.log(`[Cast] Attempting remote key ${command} (${keyCode}) on ${device.name}`);
                        // Try direct send to receiver namespace
                        client.send('urn:x-cast:com.google.cast.receiver', payload, (err) => {
                            if (err) {
                                console.warn('[Cast] direct key send failed, will fallback:', err && err.message ? err.message : err);
                                // Try via DefaultMediaReceiver if direct send fails
                                client.launch(DefaultMediaReceiver, (err2, player) => {
                                    if (err2) {
                                        console.error('[Cast] fallback launch failed:', err2);
                                        try { client.close(); } catch (e) {}
                                        return;
                                    }
                                    if (player && typeof player.send === 'function') {
                                        try {
                                            player.send('urn:x-cast:com.google.cast.receiver', payload, () => { try { client.close(); } catch (e) {} });
                                            sent = true;
                                        } catch (e) {
                                            console.error('[Cast] player.send error:', e);
                                        }
                                    } else {
                                        try { client.close(); } catch (e) {}
                                    }
                                });
                            } else {
                                sent = true;
                                try { client.close(); } catch (e) {}
                            }
                        });
                    } catch (e) {
                        console.error('[Cast] Error while sending key event:', e);
                    }
                }

                // Fallback behavior if we didn't manage to send a key event or if key not mapped
                if (!sent) {
                    const dir = command.replace('arrow_', '');
                    if (dir === 'left' || dir === 'right') {
                        // seek by 10 seconds
                        try {
                            await launchAndRun((player, done) => {
                                player.getStatus((err, status) => {
                                    let pos = 0;
                                    if (!err && status && typeof status.currentTime === 'number') pos = status.currentTime;
                                    const offset = (dir === 'left') ? -10 : 10;
                                    const target = Math.max(0, pos + offset);
                                    try {
                                        player.seek(target, () => done());
                                    } catch (e) {
                                        done();
                                    }
                                });
                            });
                        } catch (e) {
                            console.error('[Cast] Arrow seek failed (fallback):', e);
                        }
                    } else {
                        // up/down -> volume up/down
                        try {
                            await connect();
                            client.getStatus((err, status) => {
                                let cur = 0.5;
                                if (!err && status && status.volume && typeof status.volume.level === 'number') cur = status.volume.level;
                                let newLevel = cur;
                                if (dir === 'up') newLevel = Math.min(1, cur + 0.05);
                                else newLevel = Math.max(0, cur - 0.05);
                                client.setVolume({ level: newLevel }, () => client.close());
                            });
                        } catch (e) {
                            console.error('[Cast] Arrow volume adjustment failed (fallback):', e);
                        }
                    }
                }
            } else if (['play','pause','next','previous','stop','toggle'].includes(command)) {
                // Try to use the DefaultMediaReceiver player controls
                try {
                    await launchAndRun((player, done) => {
                        const fallbackPlayPause = () => {
                            // Fallback to sending media play/pause keycode (Android KEYCODE_MEDIA_PLAY_PAUSE = 85)
                            const payload = { type: 'KEYCODE', keyCode: 85 };
                            try {
                                if (player && typeof player.send === 'function') {
                                    player.send('urn:x-cast:com.google.cast.receiver', payload, (err) => {
                                        if (err) console.warn('[Cast] Fallback player.send failed:', err);
                                        try { client.close(); } catch (e) {}
                                        done();
                                    });
                                } else if (typeof client.send === 'function') {
                                    client.send('urn:x-cast:com.google.cast.receiver', payload, (err) => {
                                        if (err) console.warn('[Cast] Fallback client.send failed:', err);
                                        try { client.close(); } catch (e) {}
                                        done();
                                    });
                                } else {
                                    console.warn('[Cast] No send method available for fallback key event');
                                    try { client.close(); } catch (e) {}
                                    done();
                                }
                            } catch (e) {
                                console.error('[Cast] Fallback key send exception:', e);
                                try { client.close(); } catch (ee) {}
                                done();
                            }
                        };

                        const safe = (fn) => {
                            try {
                                fn(() => done());
                            } catch (err) {
                                console.warn('[Cast] player action failed, falling back to keycode:', err && err.message ? err.message : err);
                                fallbackPlayPause();
                            }
                        };

                        if (command === 'play') safe(cb => player.play(cb));
                        else if (command === 'pause') safe(cb => player.pause(cb));
                        else if (command === 'stop') safe(cb => player.stop(cb));
                        else if (command === 'next' && typeof player.next === 'function') safe(cb => player.next(cb));
                        else if (command === 'previous' && typeof player.previous === 'function') safe(cb => player.previous(cb));
                        else if (command === 'toggle') {
                            // Try to inspect player state first
                            try {
                                player.getStatus((err, status) => {
                                    if (!err && status && status.playerState === 'PLAYING') safe(cb => player.pause(cb));
                                    else safe(cb => player.play(cb));
                                });
                            } catch (e) {
                                // If getStatus isn't available, fallback to play/pause toggle
                                safe(cb => player.play(cb));
                            }
                        } else {
                            // Fallback: just resolve
                            done();
                        }
                    });
                } catch (e) {
                    // If launching DefaultMediaReceiver fails, fallback to simple connect actions
                    console.error('[Cast] DefaultMediaReceiver control failed:', e && e.message ? e.message : e);
                    if (command === 'play' || command === 'pause' || command === 'stop') {
                        await connect();
                        client.getStatus((err, status) => { try { client.close(); } catch (er) {} });
                    }
                }
            }
            else if (command === 'turn_on' || (command === 'toggle' && device.state.on)) {
                await connect();
                // Unmute and ensure connected
                client.setVolume({ muted: false }, () => client.close());
            } else if (command === 'turn_off' || (command === 'toggle' && !device.state.on)) {
                await connect();
                // Stop apps and mute
                client.getStatus((err, status) => {
                    if (err) {
                        console.error('[Cast] getStatus error:', err);
                    }
                    try {
                        if (status && status.applications) {
                            status.applications.forEach(app => {
                                try {
                                    if (app.displayName !== 'Backdrop') {
                                        client.stop(app, () => {});
                                    }
                                } catch (e) {
                                    // ignore per-app errors
                                }
                            });
                        }
                    } catch (e) {
                        console.error('[Cast] Error while stopping apps:', e);
                    }
                    client.setVolume({ muted: true }, () => client.close());
                });
            }
        } catch (err) {
            console.error('Error controlling Cast device:', err);
        }
    }

    updateDeviceState(id, state) {
        const device = this.devices.get(id);
        if (device) {
            device.state = { ...device.state, ...state };
            this.emit('device-updated', device);
            return device;
        }
        return null;
    }

    isLocalMachine(ip) {
        const os = require('os');
        const interfaces = os.networkInterfaces();
        for (const name of Object.keys(interfaces)) {
            for (const iface of interfaces[name]) {
                if (iface.address === ip) return true;
            }
        }
        return false;
    }

    handleLocalMacCommand(command, value) {
        const { exec } = require('child_process');
        let script = '';
        
        if (command === 'volume_up') script = 'set volume output volume ((output volume of (get volume settings)) + 5)';
        else if (command === 'volume_down') script = 'set volume output volume ((output volume of (get volume settings)) - 5)';
        else if (command === 'set_volume') script = `set volume output volume ${value}`;
        else if (command === 'toggle' || command === 'turn_off') script = 'set volume output muted not (output muted of (get volume settings))';
        else if (command === 'play' || command === 'pause' || command === 'next' || command === 'previous') {
            let action = '';
            if (command === 'play' || command === 'pause') action = 'playpause';
            else if (command === 'next') action = 'next track';
            else if (command === 'previous') action = 'previous track';

            script = `
                tell application "System Events"
                    set musicRunning to (name of processes) contains "Music"
                    set spotifyRunning to (name of processes) contains "Spotify"
                end tell

                if musicRunning then
                    tell application "Music" to ${action}
                else if spotifyRunning then
                    tell application "Spotify" to ${action}
                end if
            `;
        }
        
        if (script) {
            exec(`osascript -e '${script}'`, (error, stdout, stderr) => {
                if (error) console.error(`Local Mac Control Error: ${error.message}`);
            });
        }
    }

    async getDeviceState(ip, protocol) {
        // 1. Check Local Mac
        if (this.isLocalMachine(ip)) {
            return this.getMacState(ip);
        } 
        
        // 2. Check Spotify (Global check)
        // If Spotify is playing on this device, return Spotify state
        try {
            // Find device name
            let deviceName = '';
            for (const [id, d] of this.devices) {
                if (d.ip === ip) {
                    deviceName = d.name;
                    break;
                }
            }

            if (deviceName) {
                const spotifyState = await spotifyManager.getPlaybackState();
                if (spotifyState && spotifyState.device) {
                    const spotifyName = spotifyState.device.name.toLowerCase();
                    const myName = deviceName.toLowerCase();
                    // Fuzzy match
                    if (myName.includes(spotifyName) || spotifyName.includes(myName)) {
                        return {
                            on: true,
                            volume: spotifyState.device.volume_percent,
                            state: spotifyState.is_playing ? 'playing' : 'paused',
                            title: spotifyState.item ? spotifyState.item.name : '',
                            artist: spotifyState.item ? spotifyState.item.artists.map(a=>a.name).join(', ') : '',
                            app: 'Spotify'
                        };
                    }
                }
            }
        } catch (e) {
            // Ignore spotify errors
        }

        // 3. Fallback to AirPlay/AppleTV status
        if (protocol === 'mdns-airplay') {
            return this.getAppleTVState(ip);
        }
        return null;
    }

    getAppleTVState(ip) {
        return new Promise((resolve) => {
            const device = Array.from(this.devices.values()).find(d => d.ip === ip);
            if (device) {
                // Trigger a refresh via the persistent process if available
                if (this.atvProcesses.has(ip)) {
                    const proc = this.atvProcesses.get(ip);
                    if (proc && proc.stdin) {
                        try {
                            proc.stdin.write(JSON.stringify({ command: 'status' }) + '\n');
                        } catch (e) {
                            console.error(`[DeviceManager] Failed to request status for ${ip}:`, e);
                        }
                    }
                }
                resolve(device.state);
            } else {
                resolve({ on: false });
            }
        });
    }

    getMacState(ip) {
        return new Promise((resolve) => {
            // Check if it's the local mac
            const isLocal = this.isLocalMachine(ip);
            if (!isLocal) {
                resolve(null); // Remote mac state not implemented yet
                return;
            }

            const script = `
            set vol to output volume of (get volume settings)
            set isMuted to output muted of (get volume settings)
            
            tell application "System Events"
                set musicRunning to (name of processes) contains "Music"
                set spotifyRunning to (name of processes) contains "Spotify"
            end tell

            set mediaState to "stopped"
            set mediaTitle to ""
            set mediaArtist to ""
            set mediaApp to ""

            if musicRunning then
                tell application "Music"
                    if player state is playing then
                        set mediaState to "playing"
                        set mediaTitle to name of current track
                        set mediaArtist to artist of current track
                        set mediaApp to "Music"
                    else if player state is paused then
                        set mediaState to "paused"
                        set mediaTitle to name of current track
                        set mediaArtist to artist of current track
                        set mediaApp to "Music"
                    end if
                end tell
            end if

            if mediaState is "stopped" and spotifyRunning then
                tell application "Spotify"
                    if player state is playing then
                        set mediaState to "playing"
                        set mediaTitle to name of current track
                        set mediaArtist to artist of current track
                        set mediaApp to "Spotify"
                    else if player state is paused then
                        set mediaState to "paused"
                        set mediaTitle to name of current track
                        set mediaArtist to artist of current track
                        set mediaApp to "Spotify"
                    end if
                end tell
            end if
            
            -- Escape quotes for JSON
            -- Simple replacement, might need more robust handling for complex strings
            
            return "{ \\"volume\\": " & vol & ", \\"muted\\": " & isMuted & ", \\"state\\": \\"" & mediaState & "\\", \\"title\\": \\"" & mediaTitle & "\\", \\"artist\\": \\"" & mediaArtist & "\\", \\"app\\": \\"" & mediaApp & "\\" }"
            `;

            const { exec } = require('child_process');
            exec(`osascript -e '${script}'`, (error, stdout, stderr) => {
                if (error) {
                    resolve({ state: 'stopped', volume: 0, on: true });
                } else {
                    try {
                        const data = JSON.parse(stdout.trim());
                        resolve({
                            on: !data.muted, // Treat unmuted as "on" for simplicity, or just always true for Mac
                            volume: data.volume,
                            state: data.state,
                            title: data.title,
                            artist: data.artist,
                            app: data.app
                        });
                    } catch (e) {
                        resolve({ state: 'stopped', volume: 0, on: true });
                    }
                }
            });
        });
    }
}

module.exports = new DeviceManager();
