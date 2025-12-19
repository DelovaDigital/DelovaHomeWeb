const EventEmitter = require('events');
const cron = require('node-cron');
const deviceManager = require('./deviceManager');

class AutomationManager extends EventEmitter {
    constructor() {
        super();
        this.automations = [];
        this.tasks = new Map(); // Map of automationId -> cronTask
        
        // Listen for device updates to trigger state-based automations
        deviceManager.on('device-updated', (device) => {
            this.checkStateTriggers(device);
        });
    }

    // --- CRUD Operations ---

    getAutomations() {
        return this.automations;
    }

    addAutomation(automation) {
        if (!automation.id) automation.id = Date.now().toString();
        if (!automation.enabled) automation.enabled = true;
        
        this.automations.push(automation);
        this.registerAutomation(automation);
        return automation;
    }

    updateAutomation(id, updates) {
        const index = this.automations.findIndex(a => a.id === id);
        if (index === -1) throw new Error('Automation not found');
        
        const updated = { ...this.automations[index], ...updates };
        this.automations[index] = updated;
        
        // Re-register
        this.unregisterAutomation(id);
        this.registerAutomation(updated);
        
        return updated;
    }

    deleteAutomation(id) {
        const index = this.automations.findIndex(a => a.id === id);
        if (index !== -1) {
            this.unregisterAutomation(id);
            this.automations.splice(index, 1);
        }
    }

    // --- Execution Logic ---

    registerAutomation(automation) {
        if (!automation.enabled) return;

        // Time-based triggers
        if (automation.trigger.type === 'time' && automation.trigger.cron) {
            try {
                const task = cron.schedule(automation.trigger.cron, () => {
                    console.log(`[Automation] Executing time-based automation: ${automation.name}`);
                    this.executeActions(automation.actions);
                });
                this.tasks.set(automation.id, task);
            } catch (e) {
                console.error(`[Automation] Invalid cron expression for ${automation.name}:`, e);
            }
        }
    }

    unregisterAutomation(id) {
        const task = this.tasks.get(id);
        if (task) {
            task.stop();
            this.tasks.delete(id);
        }
    }

    checkStateTriggers(device) {
        this.automations.forEach(automation => {
            if (!automation.enabled) return;
            if (automation.trigger.type !== 'state') return;

            const t = automation.trigger;
            // Check if this device matches the trigger
            if (t.deviceId === device.id) {
                // Check condition
                // e.g. property: 'on', value: true
                // or property: 'brightness', operator: '>', value: 50
                
                // Simple equality check for now
                // We need to access nested properties safely?
                // device.state.on
                
                let currentValue = device.state[t.property];
                
                // Handle nested properties if needed, but flat state is common
                
                let match = false;
                if (t.operator === 'eq' || !t.operator) match = currentValue == t.value;
                else if (t.operator === 'neq') match = currentValue != t.value;
                else if (t.operator === 'gt') match = currentValue > t.value;
                else if (t.operator === 'lt') match = currentValue < t.value;
                
                if (match) {
                    console.log(`[Automation] Triggered state-based automation: ${automation.name}`);
                    this.executeActions(automation.actions);
                }
            }
        });
    }

    async executeActions(actions) {
        for (const action of actions) {
            try {
                if (action.type === 'device') {
                    await deviceManager.controlDevice(action.deviceId, action.command, action.value);
                } else if (action.type === 'scene') {
                    await deviceManager.activateScene(action.sceneName);
                } else if (action.type === 'delay') {
                    await new Promise(resolve => setTimeout(resolve, action.duration));
                }
            } catch (e) {
                console.error('[Automation] Action failed:', e);
            }
        }
    }
}

module.exports = new AutomationManager();
