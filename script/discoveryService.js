const dgram = require('dgram');
const EventEmitter = require('events');
const { exec } = require('child_process');
const { Bonjour } = require('bonjour-service');

class DiscoveryService extends EventEmitter {
    constructor() {
        super();
        this.bonjour = new Bonjour();
        this.ssdpSocket = null;
        this.discoveredDevices = new Map(); // key: id/mac/ip, value: device info
    }

    start() {
        this.startMDNS();
        this.startSSDP();
    }

    stop() {
        if (this.bonjour) {
            this.bonjour.destroy();
        }
        if (this.ssdpSocket) {
            this.ssdpSocket.close();
        }
    }

    startMDNS() {
        console.log('[Discovery] Starting mDNS...');

        // NOTE: We do not publish 'DelovaHome Hub' here anymore because server.js handles
        // advertising with the correct Hub ID and Port.
        // This prevents double-binding and "Service name in use" errors.
        
        // Browse for common services
        const services = [
            'googlecast',   // Chromecast
            'http',         // Web servers (Shelly, etc)
            'shelly',       // Shelly specific
            'printer',      // Printers (IPP)
            'ipp',          // Printers
            'spotify-connect', // Spotify
            'airplay',      // Apple TV / AirPlay
            'hap',          // HomeKit
            'smb',          // NAS
            'ssh',          // Linux/RPi
            'sftp-ssh',     // Linux/RPi
            'workstation',  // PC
            'raop',         // AirPlay Speakers
            'daap',         // iTunes
            'webos-second-screen', // LG TV
            'esphomelib',   // ESPhome
            'matter',       // Matter
            '_matter._tcp', // Matter
            '_matterc._udp', // Matter
            'bond',         // Bond Bridge (Ceiling Fans/Fireplaces)
            'smartthings',  // SmartThings
            'home-connect', // Bosch/Siemens (Washers/Dryers)
            'elgato',       // Elgato Key Lights
            'axis-video',   // Axis Cameras
            'miio',         // Xiaomi
            'services',     // Generic DNS-SD
            'touch-able',   // Apple TV Remote suitable
            'androidtvremote2', // Android TV
            'vizio-smart-cast', // Vizio
            'roku-rcp',     // Roku
            'sonos'         // Sonos
        ];

        services.forEach(type => {
            this.bonjour.find({ type }, (service) => {
                this.handleMDNSService(service);
            });
        });
    }

    getMacAddress(ip) {
        return new Promise((resolve) => {
            // First ping to populate ARP cache
            const pingCmd = process.platform === 'win32' 
                ? `ping -n 1 -w 200 ${ip}` 
                : `ping -c 1 -W 1 ${ip}`;

            exec(pingCmd, () => {
                // Then check ARP table
                const arpCmd = process.platform === 'win32' ? `arp -a ${ip}` : `arp -n ${ip}`;
                
                exec(arpCmd, (err, stdout) => {
                    if (err) return resolve(null);
                    
                    const macRegex = /([0-9A-Fa-f]{1,2}[:-]){5}([0-9A-Fa-f]{1,2})/;
                    const match = stdout.match(macRegex);
                    
                    if (match) {
                        resolve(match[0]);
                    } else {
                        resolve(null);
                    }
                });
            });
        });
    }

    async handleMDNSService(service) {
        // Filter and normalize
        let device = null;
        const name = service.name || '';
        const ip = service.referer ? service.referer.address : (service.addresses ? service.addresses[0] : null);
        
        if (!ip) return;

        const mac = await this.getMacAddress(ip);

        // Shelly
        if (name.toLowerCase().includes('shelly') || (service.txt && service.txt.gen)) {
            device = {
                id: `shelly-${name.replace(/[^a-zA-Z0-9]/g, '')}`,
                name: name,
                type: 'shelly',
                ip: ip,
                model: service.txt ? service.txt.gen : 'Unknown',
                raw: service
            };
        }
        // Chromecast
        else if (service.type === 'googlecast') {
            device = {
                id: `cast-${service.txt.id || name.replace(/[^a-zA-Z0-9]/g, '')}`,
                name: service.txt.fn || name,
                type: 'chromecast',
                ip: ip,
                model: service.txt.md || 'Chromecast',
                raw: service
            };
        }
        // Printer
        else if (service.type === 'printer' || service.type === 'ipp') {
             device = {
                id: `printer-${name.replace(/[^a-zA-Z0-9]/g, '')}`,
                name: name,
                type: 'printer',
                ip: ip,
                model: service.txt ? service.txt.ty : 'Printer',
                raw: service
            };
        }
        // Computers / RPi / NAS
        else if (['ssh', 'sftp-ssh', 'workstation', 'smb'].includes(service.type)) {
            let type = 'pc';
            if (name.toLowerCase().includes('pi') || name.toLowerCase().includes('raspberry')) type = 'rpi';
            else if (name.toLowerCase().includes('nas') || name.toLowerCase().includes('synology') || name.toLowerCase().includes('qnap')) type = 'nas';
            
            device = {
                id: `pc-${name.replace(/[^a-zA-Z0-9]/g, '')}`,
                name: name,
                type: type,
                ip: ip,
                model: 'Computer',
                raw: service
            };
        }
        // Speakers (AirPlay/RAOP)
        else if (service.type === 'raop' || service.type === 'airplay') {
            let type = 'speaker';
            let model = 'AirPlay Speaker';
            
            // Check for Mac computers masquerading as AirPlay receivers
            if (service.txt && service.txt.model) {
                model = service.txt.model;
                if (model.includes('MacBook') || model.includes('iMac') || model.includes('Macmini') || model.includes('MacPro')) {
                    type = 'computer';
                }
            }

            device = {
                id: `airplay-${name.replace(/[^a-zA-Z0-9]/g, '')}`,
                name: name.replace(/^[^@]*@/, ''), // Remove MAC prefix often found in RAOP names
                type: type,
                ip: ip,
                model: model,
                raw: service
            };
        }
        // LG TV
        else if (service.type === 'webos-second-screen') {
            device = {
                id: `lg-${name.replace(/[^a-zA-Z0-9]/g, '')}`,
                name: name,
                type: 'tv',
                ip: ip,
                model: 'LG WebOS',
                raw: service
            };
        }
        // ESPhome
        else if (service.type === 'esphomelib') {
            device = {
                id: `esphome-${name.replace(/[^a-zA-Z0-9]/g, '')}`,
                name: name,
                type: 'esphome',
                ip: ip,
                model: 'ESPhome Device',
                raw: service
            };
        }
        // Matter
        else if (service.type === 'matter' || service.type === '_matter._tcp' || service.type === '_matterc._udp') {
            device = {
                id: `matter-${name.replace(/[^a-zA-Z0-9]/g, '')}`,
                name: name,
                type: 'matter',
                ip: ip,
                model: 'Matter Device',
                raw: service
            };
        }
        // HomeKit (HAP)
        else if (service.type === 'hap') {
            device = {
                id: `hap-${name.replace(/[^a-zA-Z0-9]/g, '')}`,
                name: name,
                type: 'homekit',
                ip: ip,
                model: service.txt ? service.txt.md : 'HomeKit Device',
                raw: service
            };
        }
        // Bond Bridge (Fans/Fireplaces)
        else if (service.type === 'bond') {
             device = {
                id: `bond-${name.replace(/[^a-zA-Z0-9]/g, '')}`,
                name: name,
                type: 'hub',
                ip: ip,
                model: 'Bond Bridge',
                raw: service
            };
        }
        // Home Connect (Bosch/Siemens Appliances)
        else if (service.type === 'home-connect') {
             let type = 'appliance';
             if (name.toLowerCase().includes('washer') || name.toLowerCase().includes('washing')) type = 'washer';
             else if (name.toLowerCase().includes('dryer')) type = 'dryer';
             else if (name.toLowerCase().includes('dishwasher')) type = 'dishwasher';
             else if (name.toLowerCase().includes('oven')) type = 'oven';
             else if (name.toLowerCase().includes('fridge') || name.toLowerCase().includes('freezer') || name.toLowerCase().includes('cooler')) type = 'fridge';
             else if (name.toLowerCase().includes('coffee')) type = 'coffee_machine';

             device = {
                id: `homeconnect-${name.replace(/[^a-zA-Z0-9]/g, '')}`,
                name: name,
                type: type,
                ip: ip,
                model: 'Home Connect Appliance',
                raw: service
            };
        }
        // Generic Keyword Search (Last Resort)
        // Check if name contains appliance keywords
        else {
             const lowerName = name.toLowerCase();
             let type = null;
             
             if (lowerName.includes('washer') || lowerName.includes('washing')) type = 'washer';
             else if (lowerName.includes('dryer')) type = 'dryer';
             else if (lowerName.includes('fridge') || lowerName.includes('refrigerator')) type = 'fridge';
             else if (lowerName.includes('dishwasher')) type = 'dishwasher';
             
             if (type) {
                 device = {
                    id: `generic-${name.replace(/[^a-zA-Z0-9]/g, '')}`,
                    name: name,
                    type: type,
                    ip: ip,
                    model: 'Generic Appliance',
                    raw: service
                };
             }
        }

        if (device) {
            if (mac) device.mac = mac;
            this.emit('discovered', device);
        }
    }

    startSSDP() {
        console.log('[Discovery] Starting SSDP...');
        const SSDP_ADDR = '239.255.255.250';
        const SSDP_PORT = 1900;
        const M_SEARCH = 
            'M-SEARCH * HTTP/1.1\r\n' +
            'HOST: 239.255.255.250:1900\r\n' +
            'MAN: "ssdp:discover"\r\n' +
            'MX: 1\r\n' +
            'ST: ssdp:all\r\n' +
            '\r\n';

        this.ssdpSocket = dgram.createSocket('udp4');

        this.ssdpSocket.on('message', (msg, rinfo) => {
            this.handleSSDPResponse(msg, rinfo);
        });

        this.ssdpSocket.bind(() => {
            this.ssdpSocket.setBroadcast(true);
            this.ssdpSocket.setMulticastTTL(128);
            this.ssdpSocket.addMembership(SSDP_ADDR);
            
            // Send search immediately and then periodically
            this.sendSSDPSearch(M_SEARCH, SSDP_ADDR, SSDP_PORT);
            setInterval(() => {
                this.sendSSDPSearch(M_SEARCH, SSDP_ADDR, SSDP_PORT);
            }, 30000);
        });
    }

    sendSSDPSearch(message, addr, port) {
        if(this.ssdpSocket) {
            const buf = Buffer.from(message);
            this.ssdpSocket.send(buf, 0, buf.length, port, addr);
        }
    }

    handleSSDPResponse(msg, rinfo) {
        const msgStr = msg.toString();
        const headers = {};
        msgStr.split('\r\n').forEach(line => {
            const parts = line.split(': ');
            if (parts.length >= 2) {
                headers[parts[0].toUpperCase()] = parts.slice(1).join(': ');
            }
        });

        const server = headers['SERVER'] || '';
        const location = headers['LOCATION'] || '';
        const st = headers['ST'] || '';
        const usn = headers['USN'] || '';

        // Philips Hue
        if (server.includes('IpBridge')) {
            // Fetch description.xml to get details
            // For now, just emit basic info
            this.emit('discovered', {
                id: `hue-${usn.split(':')[1] || rinfo.address}`,
                name: 'Philips Hue Bridge',
                type: 'hue',
                ip: rinfo.address,
                model: 'Bridge',
                location: location
            });
        }
        // Sonos (usually handled by sonosManager, but good to have here)
        else if (server.includes('Sonos')) {
             this.emit('discovered', {
                id: `sonos-${usn.split('_')[1] || rinfo.address}`,
                name: 'Sonos Device',
                type: 'sonos',
                ip: rinfo.address,
                model: 'Sonos',
                location: location
            });
        }
        // Amazon Alexa (Echo) - Basic Detection
        else if (server.includes('UPnP/1.0') && (st.includes('device:Basic:1') || st.includes('device:Echo:1'))) {
             // Placeholder for Alexa
        }
        // SmartThings
        else if (server.includes('SmartThings')) {
            this.emit('discovered', {
                id: `smartthings-${usn.split(':')[1] || rinfo.address}`,
                name: 'SmartThings Hub',
                type: 'smartthings',
                ip: rinfo.address,
                model: 'Hub',
                location: location
            });
        }
    }
}

module.exports = new DiscoveryService(); // Export singleton
    