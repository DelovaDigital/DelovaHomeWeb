const fs = require('fs');
const path = require('path');

class PluginManager {
    constructor() {
        this.pluginsDir = path.join(__dirname, '../plugins');
        this.activePlugins = new Map();
        if (!fs.existsSync(this.pluginsDir)) {
            fs.mkdirSync(this.pluginsDir);
        }
    }

    loadPlugins() {
        console.log('PluginManager: Loading plugins...');
        const entries = fs.readdirSync(this.pluginsDir, { withFileTypes: true });
        
        for (const entry of entries) {
            if (entry.isDirectory()) {
                this.loadPlugin(entry.name);
            }
        }
    }

    loadPlugin(name) {
        try {
            const pluginPath = path.join(this.pluginsDir, name);
            const entryPoint = require(pluginPath);
            if (entryPoint && typeof entryPoint.init === 'function') {
                entryPoint.init({
                    // Pass core managers here
                });
                this.activePlugins.set(name, entryPoint);
                console.log(`PluginManager: Loaded ${name}`);
            }
        } catch (e) {
            console.error(`PluginManager: Failed to load ${name}`, e);
        }
    }
}

module.exports = new PluginManager();
