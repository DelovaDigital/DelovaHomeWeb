const EventEmitter = require('events');
const net = require('net');
const dgram = require('dgram');
const WebSocket = require('ws');
const { Bonjour } = require('bonjour-service');
const CastClient = require('castv2-client').Client;
const lgtv = require('lgtv2');

class DeviceManager extends EventEmitter {
    constructor() {
        super();
        this.devices = new Map(); // id -> device
        this.startDiscovery();
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
        this.addMockDevices();
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
            } else if (server.toLowerCase().includes('samsung') || server.toLowerCase().includes('tizen') || st.includes('samsung')) {
                type = 'tv';
                name = 'Samsung Smart TV';
            } else if (server.includes('UPnP/1.0') && location) {
                name = `UPnP Device (${rinfo.address})`;
            } else {
                name = `Device (${rinfo.address})`;
            }

            // Sanitize ID to be safe for HTML attributes
            const safeId = (usn || `ssdp-${rinfo.address}`).replace(/[^a-zA-Z0-9-_:]/g, '_');

            this.addDevice({
                id: safeId,
                name: name,
                type: type,
                ip: rinfo.address,
                protocol: type === 'tv' && name.includes('Samsung') ? 'samsung-tizen' : 'ssdp',
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
        if (service.txt) {
            if (service.txt.md) model = service.txt.md; // Model name often in 'md'
            else if (service.txt.model) model = service.txt.model;
        }

        if (sourceType === 'googlecast') {
            type = 'tv';
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
        } else if (lowerName.includes('printer')) {
            type = 'printer';
        } else if (lowerName.includes('tv') || lowerName.includes('chromecast')) {
            type = 'tv';
        } else if (lowerName.includes('light') || lowerName.includes('led') || lowerName.includes('hue') || lowerName.includes('bulb')) {
            type = 'light';
        } else if (lowerName.includes('speaker') || lowerName.includes('sonos')) {
            type = 'speaker';
        } else if (lowerName.includes('sensor') || lowerName.includes('homepod') || model.includes('AudioAccessory')) {
            type = 'sensor';
            if (model.includes('AudioAccessory5')) name = 'HomePod Mini';
            else if (model.includes('AudioAccessory1')) name = 'HomePod (Gen 1)';
            else if (model.includes('AudioAccessory6')) name = 'HomePod (Gen 2)';
        }

        // Resolve IP (use the first address found)
        const ip = service.addresses && service.addresses.length > 0 ? service.addresses[0] : null;

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
            }

            // Sanitize ID
            const safeId = `mdns-${service.fqdn || name}-${sourceType}`.replace(/[^a-zA-Z0-9-_]/g, '_');

            this.addDevice({
                id: safeId,
                name: name,
                type: type,
                ip: ip,
                protocol: protocol,
                port: service.port,
                model: model,
                state: initialState
            });
        }
    }

    addMockDevices() {
        setTimeout(() => {
            this.addDevice({
                id: 'mock-light-1',
                name: 'Woonkamer Lamp (Mock)',
                type: 'light',
                ip: '192.168.1.101',
                state: { on: false, brightness: 80 }
            });
        }, 1000);

        setTimeout(() => {
            this.addDevice({
                id: 'mock-tv-1',
                name: 'Samsung TV (Mock)',
                type: 'tv',
                ip: '192.168.1.102',
                state: { on: true, volume: 15, channel: 1 }
            });
        }, 2000);
    }

    addDevice(device) {
        // Deduplicate Samsung TVs by IP
        if (device.type === 'tv' && (device.name.includes('Samsung') || device.protocol === 'samsung-tizen')) {
            // Check if we already have a Samsung TV with this IP
            for (const [existingId, existingDevice] of this.devices.entries()) {
                if (existingDevice.ip === device.ip && existingDevice.type === 'tv') {
                    // If the existing device is generic UPnP, upgrade it to Samsung
                    if (existingDevice.name.startsWith('UPnP Device') || existingDevice.name === 'Unknown Device') {
                        console.log(`Upgrading device at ${device.ip} to Samsung TV`);
                        this.devices.delete(existingId); // Remove the generic one
                        // Continue to add the new specific one
                    } else if (existingDevice.name.includes('Samsung')) {
                        // We already have a Samsung TV at this IP, ignore this new announcement (likely just a different service UUID)
                        // console.log(`Ignoring duplicate Samsung TV announcement for ${device.ip}`);
                        return;
                    }
                }
            }
        }

        // General deduplication by ID
        if (!this.devices.has(device.id)) {
            this.devices.set(device.id, device);
            this.emit('device-added', device);
            console.log(`Device discovered: ${device.name} (${device.type}) via ${device.protocol || 'mock'}`);
        }
    }

    getAllDevices() {
        return Array.from(this.devices.values());
    }

    getDevice(id) {
        return this.devices.get(id);
    }

    async controlDevice(id, command, value) {
        const device = this.devices.get(id);
        if (!device) return null;

        console.log(`Controlling ${device.name} (${device.protocol}): ${command} = ${value}`);

        // Update state object first (Optimistic UI)
        if (command === 'toggle') {
            device.state.on = !device.state.on;
        } else if (command === 'turn_on') {
            device.state.on = true;
        } else if (command === 'turn_off') {
            device.state.on = false;
        } else if (command === 'set_brightness') {
            device.state.brightness = value;
        } else if (command === 'set_volume') {
            device.state.volume = value;
        } else if (command === 'set_target_temp') {
            device.state.target = value;
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

    handleSamsungCommand(device, command, value) {
        // Custom Samsung Tizen Control via WebSocket (Port 8002 for secure, 8001 for insecure)
        // This avoids using the vulnerable 'samsung-tv-control' package
        
        const appName = Buffer.from('DelovaHome').toString('base64');
        const url = `wss://${device.ip}:8002/api/v2/channels/samsung.remote.control?name=${appName}`;
        
        // Ignore self-signed certs for local TV
        const ws = new WebSocket(url, {
            rejectUnauthorized: false
        });

        ws.on('error', (e) => {
            console.error('Samsung TV Connection Error:', e.message);
        });

        ws.on('open', () => {
            // console.log('Connected to Samsung TV');
            
            const sendKey = (key) => {
                const commandData = {
                    method: 'ms.remote.control',
                    params: {
                        Cmd: 'Click',
                        DataOfCmd: key,
                        Option: 'false',
                        TypeOfRemote: 'SendRemoteKey'
                    }
                };
                ws.send(JSON.stringify(commandData));
            };

            if (command === 'turn_off' || (command === 'toggle' && device.state.on)) {
                sendKey('KEY_POWER');
            } else if (command === 'channel_up') {
                sendKey('KEY_CHUP');
            } else if (command === 'channel_down') {
                sendKey('KEY_CHDOWN');
            } else if (command === 'set_volume') {
                // Volume is tricky without current state, but we can try to nudge it
                // Ideally we'd just send KEY_VOLUP or KEY_VOLDOWN
                // For now, let's just support keys
            }

            // Close after a short delay to ensure message is sent
            setTimeout(() => ws.close(), 1000);
        });
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
}

module.exports = new DeviceManager();
