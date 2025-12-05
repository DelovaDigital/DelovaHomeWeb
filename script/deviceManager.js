const EventEmitter = require('events');
const net = require('net');
const dgram = require('dgram');
const fs = require('fs');
const path = require('path');
const WebSocket = require('ws');
const { Bonjour } = require('bonjour-service');
const CastClient = require('castv2-client').Client;
const lgtv = require('lgtv2');
const spotifyManager = require('./spotifyManager');
// const { scan, parseCredentials, AppleTV } = require('node-appletv-x');

class DeviceManager extends EventEmitter {
    constructor() {
        super();
        this.devices = new Map(); // id -> device
        this.samsungConnections = new Map(); // ip -> { ws, timeout }
        this.atvProcesses = new Map(); // ip -> process
        this.pairingProcess = null;
        this.appleTvCredentials = {};
        this.loadAppleTvCredentials();
        this.startDiscovery();
        this.startPolling();
    }

    startPolling() {
        setInterval(() => {
            for (const id of this.devices.keys()) {
                this.refreshDevice(id);
            }
        }, 5000);
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

    startDiscovery() {
        console.log('Starting device discovery...');
        
        // 1. Custom SSDP Discovery (UPnP) using dgram
        // Replaces node-ssdp to avoid 'ip' package vulnerability
        this.setupSsdpDiscovery();

        // 2. mDNS Discovery (Bonjour/Zeroconf)
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

            this.addDevice({
                id: safeId,
                name: name,
                type: type,
                ip: rinfo.address,
                protocol: (type === 'tv' && name.includes('Samsung')) ? 'samsung-tizen' : (name.includes('Denon') ? 'denon-avr' : 'ssdp'),
                location: location,
                state: { on: false }
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
            }
            let protocol = `mdns-${sourceType}`;
            // If we identify a Samsung TV via mDNS, use the Tizen protocol for control
            if (type === 'tv' && (name.toLowerCase().includes('samsung') || model.toLowerCase().includes('samsung'))) {
                protocol = 'samsung-tizen';
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
                        
                        // Volume
                        if (status.volume) {
                            const vol = Math.round((status.volume.level || 0) * 100);
                            if (device.state.volume !== vol) {
                                device.state.volume = vol;
                                updated = true;
                            }
                            // Muted = Off? Or just muted. Let's say muted is off for toggle purposes
                            const isOn = !status.volume.muted;
                            if (device.state.on !== isOn) {
                                device.state.on = isOn;
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
            // Refresh Samsung TV (Basic On/Off check via TCP)
            const socket = new net.Socket();
            socket.setTimeout(2000);
            socket.connect(8002, device.ip, () => {
                // Connected = ON
                if (!device.state.on) {
                    device.state.on = true;
                    this.emit('device-updated', device);
                }
                socket.destroy();
            });
            socket.on('error', () => {
                // Error = OFF (likely)
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
                            if (volStr.length === 3) volStr = volStr.substring(0, 2);
                            const vol = parseInt(volStr);
                            if (device.state.volume !== vol) {
                                device.state.volume = vol;
                                updated = true;
                            }
                        }
                    } else if (line.startsWith('SI')) {
                        const source = line.substring(2);
                        if (device.state.mediaTitle !== source) {
                            device.state.mediaTitle = source;
                            updated = true;
                        }
                    }
                });

                if (updated) this.emit('device-updated', device);
            });

            socket.on('error', () => socket.destroy());
            socket.on('timeout', () => socket.destroy());
            setTimeout(() => socket.destroy(), 1000);
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
                    // Filter out non-ink consumables (like printheads which might be labeled CMYK)
                    // Usually single letters C, M, Y, K are inks.
                    if (['C', 'M', 'Y', 'K'].includes(label)) {
                        inks.push({ color: label, level: parseInt(level) });
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
            this.handleCastCommand(device, command, value);
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
        }

        // Emit update
        this.emit('device-updated', device);
        return device;
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

    getAtvProcess(ip) {
        if (this.atvProcesses.has(ip)) {
            return this.atvProcesses.get(ip);
        }

        console.log(`[DeviceManager] Spawning persistent ATV service for ${ip}...`);
        const { spawn } = require('child_process');
        const pythonPath = path.join(__dirname, '../.venv/bin/python');
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
                    } else if (msg.error) {
                        console.error(`[ATV Service Error] ${ip}: ${msg.error}`);
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
            console.error(`[ATV Service Stderr] ${ip}: ${data.toString()}`);
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
            // For toggle, we can send play/pause if it's media, or turn_on/off if it's power
            // But here we are likely talking about media toggle since we fixed the UI
            // Let's check if we have playing state
            if (device.state.playingState === 'playing') pyCommand = 'pause';
            else pyCommand = 'play';
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

    handleSamsungCommand(device, command, value) {
        // Custom Samsung Tizen Control via WebSocket (Port 8002 for secure, 8001 for insecure)
        // This avoids using the vulnerable 'samsung-tv-control' package
        
        const sendKey = (ws, key) => {
            const commandData = {
                method: 'ms.remote.control',
                params: {
                    Cmd: 'Click',
                    DataOfCmd: key,
                    Option: 'false',
                    TypeOfRemote: 'SendRemoteKey'
                }
            };
            if (ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify(commandData));
            }
        };

        const executeCommand = (ws) => {
            if (command === 'turn_off' || (command === 'toggle' && device.state.on)) {
                sendKey(ws, 'KEY_POWER');
            } else if (command === 'channel_up') {
                sendKey(ws, 'KEY_CHUP');
            } else if (command === 'channel_down') {
                sendKey(ws, 'KEY_CHDOWN');
            } else if (command === 'volume_up') {
                sendKey(ws, 'KEY_VOLUP');
            } else if (command === 'volume_down') {
                sendKey(ws, 'KEY_VOLDOWN');
            } else if (command === 'set_input') {
                const keyMap = {
                    'tv': 'KEY_TV',
                    'hdmi1': 'KEY_HDMI1',
                    'hdmi2': 'KEY_HDMI2',
                    'hdmi3': 'KEY_HDMI3',
                    'hdmi4': 'KEY_HDMI4'
                };
                const key = keyMap[value.toLowerCase()];
                if (key) sendKey(ws, key);
                else sendKey(ws, `KEY_${value.toUpperCase()}`);
            }
        };

        // Check for existing connection
        if (this.samsungConnections.has(device.ip)) {
            const conn = this.samsungConnections.get(device.ip);
            
            // Reset inactivity timeout
            clearTimeout(conn.timeout);
            conn.timeout = setTimeout(() => {
                console.log(`Closing idle Samsung connection for ${device.ip}`);
                conn.ws.close();
                this.samsungConnections.delete(device.ip);
            }, 15000); // Keep alive for 15 seconds

            if (conn.ws.readyState === WebSocket.OPEN) {
                executeCommand(conn.ws);
                return;
            } else {
                // Connection dead, remove it and reconnect
                this.samsungConnections.delete(device.ip);
            }
        }

        const appName = Buffer.from('DelovaHome').toString('base64');
        let url = `wss://${device.ip}:8002/api/v2/channels/samsung.remote.control?name=${appName}`;
        
        // If we have a saved token, append it to the URL
        if (device.token) {
            url += `&token=${device.token}`;
        }

        // Ignore self-signed certs for local TV
        const ws = new WebSocket(url, {
            rejectUnauthorized: false
        });

        ws.on('error', (e) => {
            console.error('Samsung TV Connection Error:', e.message);
            this.samsungConnections.delete(device.ip);
        });

        ws.on('close', () => {
            this.samsungConnections.delete(device.ip);
        });

        ws.on('message', (data) => {
            try {
                const msgStr = data.toString();
                const response = JSON.parse(msgStr);
                // Save the token if the TV sends one
                if (response.data && response.data.token) {
                    console.log(`Received new token for Samsung TV (${device.ip}): ${response.data.token}`);
                    device.token = response.data.token;
                }
            } catch (e) {
                // Ignore parse errors
            }
        });

        ws.on('open', () => {
            // Store connection
            const timeout = setTimeout(() => {
                console.log(`Closing idle Samsung connection for ${device.ip}`);
                ws.close();
                this.samsungConnections.delete(device.ip);
            }, device.token ? 15000 : 60000); // 15s normally, 60s if waiting for pairing

            this.samsungConnections.set(device.ip, { ws, timeout });

            if (!device.token) console.log('Waiting for Samsung TV pairing...');
            
            executeCommand(ws);
        });
    }

    startPairing(ip) {
        return new Promise((resolve, reject) => {
            if (this.pairingProcess) {
                reject(new Error('Pairing already in progress'));
                return;
            }

            const { spawn } = require('child_process');
            const pythonPath = path.join(__dirname, '../.venv/bin/python');
            const scriptPath = path.join(__dirname, 'pair_atv_interactive.py');

            console.log(`Starting pairing for ${ip}...`);
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
                client.connect(device.ip, () => resolve());
                client.on('error', (err) => reject(err));
            });

            if (command === 'set_volume') {
                await connect();
                client.setVolume({ level: value / 100 }, () => client.close());
            } 
            else if (command === 'turn_on' || (command === 'toggle' && device.state.on)) {
                await connect();
                // Unmute and ensure connected
                client.setVolume({ muted: false }, () => client.close());
            }
            else if (command === 'turn_off' || (command === 'toggle' && !device.state.on)) {
                await connect();
                // Stop apps and mute
                client.getStatus((err, status) => {
                    if (!err && status && status.applications) {
                        status.applications.forEach(app => {
                            if (app.displayName !== 'Backdrop') {
                                client.stop(app, () => {});
                            }
                        });
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
            const { spawn } = require('child_process');
            const pythonPath = path.join(__dirname, '../.venv/bin/python');
            const scriptPath = path.join(__dirname, 'control_atv.py');
            
            // Use 'status' command to get power, volume, and metadata
            const proc = spawn(pythonPath, [scriptPath, 'status', '--ip', ip]);
            let output = '';

            proc.stdout.on('data', (data) => {
                output += data.toString();
            });

            proc.on('close', (code) => {
                if (code === 0) {
                    try {
                        const data = JSON.parse(output.trim());
                        // Normalize keys
                        resolve({
                            on: data.on,
                            volume: data.volume,
                            state: data.playing_state || 'stopped',
                            title: data.title,
                            artist: data.artist,
                            album: data.album,
                            app: data.app
                        });
                    } catch (e) {
                        resolve(null);
                    }
                } else {
                    resolve(null);
                }
            });
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
