const dgram = require('dgram');
const EventEmitter = require('events');
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
            'webos-second-screen' // LG TV
        ];

        services.forEach(type => {
            this.bonjour.find({ type }, (service) => {
                this.handleMDNSService(service);
            });
        });
    }

    handleMDNSService(service) {
        // Filter and normalize
        let device = null;
        const name = service.name || '';
        const ip = service.referer ? service.referer.address : (service.addresses ? service.addresses[0] : null);
        
        if (!ip) return;

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
            device = {
                id: `airplay-${name.replace(/[^a-zA-Z0-9]/g, '')}`,
                name: name.replace(/^[^@]*@/, ''), // Remove MAC prefix often found in RAOP names
                type: 'speaker',
                ip: ip,
                model: 'AirPlay Speaker',
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

        if (device) {
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
    }
}

module.exports = new DiscoveryService();
