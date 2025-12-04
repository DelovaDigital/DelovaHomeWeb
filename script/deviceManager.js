const EventEmitter = require('events');
const SsdpClient = require('node-ssdp').Client;
const { Bonjour } = require('bonjour-service');
const CastClient = require('castv2-client').Client;

class DeviceManager extends EventEmitter {
    constructor() {
        super();
        this.devices = new Map(); // id -> device
        this.startDiscovery();
    }

    startDiscovery() {
        console.log('Starting device discovery...');
        
        // 1. SSDP Discovery (UPnP)
        this.ssdpClient = new SsdpClient();
        
        this.ssdpClient.on('response', (headers, statusCode, rinfo) => {
            if (!rinfo) return;
            
            // Log raw discovery for debugging
            // console.log('SSDP Response from', rinfo.address, headers);

            const location = headers.LOCATION || headers.Location;
            const usn = headers.USN || headers.Usn || '';
            const server = headers.SERVER || headers.Server || '';
            
            // Basic identification based on USN or headers
            let type = 'unknown';
            let name = 'Unknown Device';

            // Improved detection logic
            if (usn.includes('HueBridge') || server.includes('IpBridge')) {
                type = 'light';
                name = 'Philips Hue Bridge';
            } else if (usn.includes('Wemo') || server.includes('Wemo')) {
                type = 'switch';
                name = 'Wemo Switch';
            } else if (server.includes('Sonos')) {
                type = 'speaker';
                name = 'Sonos Speaker';
            } else if (server.includes('UPnP/1.0') && location) {
                // Generic UPnP device
                name = `UPnP Device (${rinfo.address})`;
            } else {
                name = `Device (${rinfo.address})`;
            }

            this.addDevice({
                id: usn || `ssdp-${rinfo.address}`,
                name: name,
                type: type,
                ip: rinfo.address,
                protocol: 'ssdp',
                location: location,
                state: { on: false } // Default state
            });
        });

        // Search for all SSDP devices
        try {
            this.ssdpClient.search('ssdp:all');
        } catch (e) {
            console.error('Error starting SSDP search:', e);
        }
        
        // Periodically search again
        setInterval(() => {
            try {
                this.ssdpClient.search('ssdp:all');
            } catch (e) { console.error('SSDP search error:', e); }
        }, 10000);


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
        
        // Keep Mock devices for testing purposes if no real devices are found immediately
        // You can remove this later
        this.addMockDevices();
    }

    processMdnsService(service, sourceType) {
        // console.log(`mDNS Service found (${sourceType}):`, service.name);
        
        let type = 'unknown';
        let name = service.name;
        const lowerName = name.toLowerCase();

        if (sourceType === 'googlecast') {
            type = 'tv';
        } else if (sourceType === 'spotify') {
            type = 'speaker';
        } else if (lowerName.includes('printer')) {
            type = 'printer';
        } else if (lowerName.includes('tv') || lowerName.includes('chromecast')) {
            type = 'tv';
        } else if (lowerName.includes('light') || lowerName.includes('led') || lowerName.includes('hue')) {
            type = 'light';
        } else if (lowerName.includes('speaker') || lowerName.includes('sonos')) {
            type = 'speaker';
        }

        // Resolve IP (use the first address found)
        const ip = service.addresses && service.addresses.length > 0 ? service.addresses[0] : null;

        if (ip) {
            this.addDevice({
                id: `mdns-${service.fqdn || name}-${sourceType}`,
                name: name,
                type: type,
                ip: ip,
                protocol: `mdns-${sourceType}`,
                port: service.port,
                state: { on: false }
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

        // 1. Handle Google Cast Devices
        if (device.protocol === 'mdns-googlecast') {
            try {
                if (command === 'set_volume') {
                    const client = new CastClient();
                    client.connect(device.ip, () => {
                        client.setVolume({ level: value / 100 }, () => {
                            client.close();
                        });
                    });
                    // Optimistic update
                    device.state.volume = value;
                } else if (command === 'toggle') {
                    // Cast devices don't really "toggle" power easily via API without launching an app
                    // But we can mute/unmute or stop playback
                    const client = new CastClient();
                    client.connect(device.ip, () => {
                        client.setVolume({ muted: !device.state.on }, () => { // Hack: use 'on' state as 'muted' inverse?
                             // Actually, let's just toggle mute
                             client.getVolume((err, vol) => {
                                 if (!err) {
                                     client.setVolume({ muted: !vol.muted }, () => client.close());
                                 } else client.close();
                             });
                        });
                    });
                }
            } catch (err) {
                console.error('Error controlling Cast device:', err);
            }
        }

        // 2. Handle Mock Devices
        if (device.protocol === 'mock' || !device.protocol) {
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
        }

        // Emit update
        this.emit('device-updated', device);
        return device;
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
