const mqtt = require('mqtt');
const EventEmitter = require('events');

class MqttManager extends EventEmitter {
    constructor() {
        super();
        this.client = null;
        this.connected = false;
        this.config = {
            brokerUrl: process.env.MQTT_BROKER_URL || 'mqtt://localhost:1883',
            username: process.env.MQTT_USERNAME || '',
            password: process.env.MQTT_PASSWORD || '',
            clientId: 'delovahome_hub_' + Math.random().toString(16).substr(2, 8),
            baseTopic: 'delovahome'
        };
        this.subscriptions = new Set();
    }

    setConfig(newConfig) {
        this.config = { ...this.config, ...newConfig };
        if (this.connected) {
            console.log('[MQTT] Config changed, reconnecting...');
            this.connect();
        }
    }

    getConfig() {
        return this.config;
    }

    connect() {
        if (this.client) {
            this.client.end();
        }

        console.log(`[MQTT] Connecting to ${this.config.brokerUrl}...`);

        const options = {
            clientId: this.config.clientId,
            clean: true,
            reconnectPeriod: 5000,
        };

        if (this.config.username) {
            options.username = this.config.username;
            options.password = this.config.password;
        }

        this.client = mqtt.connect(this.config.brokerUrl, options);

        // Increase listeners limit to prevent warnings if many modules use the same manager
        this.client.setMaxListeners(20);

        this.client.on('connect', () => {
            console.log('[MQTT] Connected');
            this.connected = true;
            this.emit('connected');
            
            // Resubscribe to topics
            this.subscriptions.forEach(topic => {
                this.client.subscribe(topic);
            });
            
            // Subscribe to base topic for discovery/commands
            this.client.subscribe(`${this.config.baseTopic}/#`);
        });

        this.client.on('message', (topic, message) => {
            const msgStr = message.toString();
            // console.log(`[MQTT] Message on ${topic}: ${msgStr}`);
            
            try {
                // Try to parse JSON, otherwise return string
                const payload = JSON.parse(msgStr);
                this.emit('message', topic, payload);
            } catch (e) {
                this.emit('message', topic, msgStr);
            }
        });

        this.client.on('error', (err) => {
            console.error('[MQTT] Error:', err.message);
            this.emit('error', err);
        });

        this.client.on('offline', () => {
            // console.log('[MQTT] Offline');
            this.connected = false;
            this.emit('disconnected');
        });
    }

    subscribe(topic) {
        this.subscriptions.add(topic);
        if (this.connected && this.client) {
            this.client.subscribe(topic);
        }
    }

    unsubscribe(topic) {
        this.subscriptions.delete(topic);
        if (this.connected && this.client) {
            this.client.unsubscribe(topic);
        }
    }

    publish(topic, message, options = {}) {
        if (!this.connected || !this.client) {
            console.warn('[MQTT] Cannot publish, not connected');
            return;
        }
        
        const payload = typeof message === 'object' ? JSON.stringify(message) : message.toString();
        this.client.publish(topic, payload, options);
    }
}

module.exports = new MqttManager();
