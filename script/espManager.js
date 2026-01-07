const EventEmitter = require('events');
const mqttManager = require('./mqttManager');
const deviceManager = require('./deviceManager');

class ESPManager extends EventEmitter {
    constructor() {
        super();
        this.nodes = new Map(); // id -> nodeConfig
        this.baseTopic = 'delovahome/nodes';
        
        this.init();
    }

    init() {
        // Wait for MQTT connection
        if (mqttManager.connected) {
            this.onMqttConnected();
        }
        mqttManager.on('connected', () => this.onMqttConnected());
        
        // Listen for messages
        mqttManager.on('message', (topic, message) => this.handleMessage(topic, message));
    }

    onMqttConnected() {
        console.log('[ESP] MQTT Connected, subscribing to topics...');
        // Subscribe to Home Assistant Auto-Discovery
        mqttManager.subscribe('homeassistant/+/+/config');
        // Subscribe to DelovaHome custom nodes
        mqttManager.subscribe(`${this.baseTopic}/#`);
        // Subscribe to Tasmota discovery
        mqttManager.subscribe('tasmota/discovery/#');
        // Subscribe to WLED discovery (via mDNS usually, but also MQTT topic check)
        mqttManager.subscribe('wled/+/info'); 
    }

    handleMessage(topic, message) {
        // 1. Home Assistant Auto-Discovery
        // Topic format: homeassistant/<component>/<node_id>/config
        if (topic.startsWith('homeassistant/')) {
            this.handleHADiscovery(topic, message);
            return;
        }

        // 2. Custom Node Heartbeats / Info
        if (topic.startsWith(this.baseTopic)) {
            // Handle custom node logic here if we define a protocol
            return;
        }
    }

    handleHADiscovery(topic, payload) {
        // Parse message
        let config;
        try {
            config = typeof payload === 'string' ? JSON.parse(payload) : payload;
        } catch (e) {
            console.error('[ESP] Failed to parse HA discovery config:', e);
            return;
        }

        if (!config) return; // Empty payload often means "delete device"

        const parts = topic.split('/');
        const component = parts[1]; // light, switch, sensor
        const nodeId = parts[2];

        // We need a unique ID. HA configs usually have `unique_id`, else use node_id
        const uniqueId = config.unique_id || nodeId;
        const name = config.name || nodeId;

        // Map component to our device types
        let type = 'unknown';
        if (component === 'light') type = 'light';
        else if (component === 'switch') type = 'switch';
        else if (component === 'sensor') type = 'sensor';
        else if (component === 'binary_sensor') type = 'sensor'; // or binary_sensor support later

        // Skip if not supported
        if (type === 'unknown') return;

        // Register device
        const device = {
            id: uniqueId,
            name: name,
            type: type,
            protocol: 'mqtt',
            state: { on: false }, // Default
            mqttConfig: {
                ...config,
                command_topic: config.command_topic || config.cmd_t,
                state_topic: config.state_topic || config.stat_t,
                brightness_command_topic: config.brightness_command_topic || config.bri_cmd_t,
                brightness_state_topic: config.brightness_state_topic || config.bri_stat_t,
                rgb_command_topic: config.rgb_command_topic || config.rgb_cmd_t,
                effect_command_topic: config.effect_command_topic || config.fx_cmd_t,
                payload_on: config.payload_on || config.pl_on || 'ON',
                payload_off: config.payload_off || config.pl_off || 'OFF'
            }
        };

        // Add to DeviceManager
        // Note: deviceManager will emit 'device-added' which presenceManager etc listen to.
        deviceManager.addDevice(device);

        // Subscribe to state topic if exists
        if (device.mqttConfig.state_topic) {
            mqttManager.subscribe(device.mqttConfig.state_topic);
        }
    }

    // Called by DeviceManager when a command is sent to a device with protocol='mqtt'
    async controlDevice(device, command, value) {
        if (!device.mqttConfig) return;

        const conf = device.mqttConfig;

        if (command === 'turn_on') {
            if (conf.command_topic) {
                mqttManager.publish(conf.command_topic, conf.payload_on);
                // Optimistic update
                if (device.state) device.state.on = true;
            }
        } else if (command === 'turn_off') {
            if (conf.command_topic) {
                mqttManager.publish(conf.command_topic, conf.payload_off);
                // Optimistic update
                if (device.state) device.state.on = false;
            }
        } else if (command === 'toggle') {
            // Check current state or guess
             if (device.state && device.state.on) this.controlDevice(device, 'turn_off');
             else this.controlDevice(device, 'turn_on');
        } else if (command === 'set_brightness') {
             // WLED / HA Standard: Brightness 0-255
             // Our internal system usually uses 0-100. Let's assume 0-100 logic and scale it.
             const val = Math.round((value / 100) * 255);
             if (conf.brightness_command_topic) {
                 mqttManager.publish(conf.brightness_command_topic, String(val));
             }
        } else if (command === 'set_color') {
            // value is likely [r, g, b] or hex
            if (conf.rgb_command_topic) {
                // Tasmota/HA expect "R,G,B" or Hex? It varies. HA defaults to "R,G,B" usually
                // Assuming value is {r,g,b} or [r,g,b]
                let rgbStr = value;
                if (Array.isArray(value)) rgbStr = value.join(',');
                mqttManager.publish(conf.rgb_command_topic, rgbStr);
            }
        }
    }
}

module.exports = new ESPManager();
