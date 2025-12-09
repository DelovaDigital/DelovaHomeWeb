const knx = require('knx');
const EventEmitter = require('events');

class KnxManager extends EventEmitter {
    constructor() {
        super();
        this.connection = null;
        this.connected = false;
        this.config = {
            ipAddr: '0.0.0.0', // IP of KNX IP Interface
            ipPort: 3671,
            physAddr: '1.1.128', // Physical address of this client
            handlers: {} // Map of Group Address -> Handler Function
        };
    }

    connect(config) {
        if (this.connection) {
            this.disconnect();
        }

        this.config = { ...this.config, ...config };

        console.log(`[KNX] Connecting to ${this.config.ipAddr}:${this.config.ipPort}...`);

        try {
            this.connection = new knx.Connection({
                ipAddr: this.config.ipAddr,
                ipPort: this.config.ipPort,
                physAddr: this.config.physAddr,
                handlers: {
                    connected: () => {
                        console.log('[KNX] Connected!');
                        this.connected = true;
                        this.emit('connected');
                    },
                    event: (evt, src, dest, value) => {
                        this.handleEvent(evt, src, dest, value);
                    },
                    error: (conn, err) => {
                        console.log('[KNX] Error:', err);
                        this.emit('error', err);
                    },
                    disconnected: () => {
                        console.log('[KNX] Disconnected');
                        this.connected = false;
                        this.emit('disconnected');
                    }
                }
            });
        } catch (e) {
            console.error('[KNX] Connection failed:', e);
        }
    }

    disconnect() {
        if (this.connection) {
            this.connection.Disconnect();
            this.connection = null;
            this.connected = false;
        }
    }

    handleEvent(evt, src, dest, value) {
        // console.log(`[KNX] Event: ${evt}, Src: ${src}, Dest: ${dest}, Value: ${value}`);
        this.emit('event', { evt, src, dest, value });
        
        // If we have a specific handler for this group address
        if (this.config.handlers[dest]) {
            this.config.handlers[dest](value);
        }
    }

    write(groupAddress, value, dpt = 'DPT1.001') {
        if (!this.connected || !this.connection) {
            console.warn('[KNX] Cannot write, not connected.');
            return;
        }
        try {
            this.connection.write(groupAddress, value, dpt);
        } catch (e) {
            console.error(`[KNX] Write error to ${groupAddress}:`, e);
        }
    }

    read(groupAddress) {
        if (!this.connected || !this.connection) return;
        this.connection.read(groupAddress);
    }
}

module.exports = new KnxManager();
