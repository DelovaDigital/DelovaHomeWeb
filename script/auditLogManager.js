const fs = require('fs');
const path = require('path');

class AuditLogManager {
    constructor() {
        this.logFile = path.join(__dirname, '../data/audit_log.json');
        this.logs = [];
        this.loadLogs();
    }

    loadLogs() {
        try {
            if (fs.existsSync(this.logFile)) {
                this.logs = JSON.parse(fs.readFileSync(this.logFile, 'utf8'));
            }
        } catch (err) {
            console.error('AuditLogManager: Error loading logs', err);
        }
    }

    logAction(source, action, details) {
        const entry = {
            id: Date.now().toString(36) + Math.random().toString(36).substr(2),
            timestamp: new Date().toISOString(),
            source,
            action,
            details
        };
        this.logs.unshift(entry);
        
        // Keep last 1000 logs
        if (this.logs.length > 1000) this.logs = this.logs.slice(0, 1000);
        
        this.saveLogs();
    }

    saveLogs() {
        try {
            fs.writeFileSync(this.logFile, JSON.stringify(this.logs, null, 2));
        } catch (err) {
            console.error('AuditLogManager: Error saving logs', err);
        }
    }

    getLogs(filter = {}) {
        // Implement filtering if needed
        return this.logs;
    }
}

module.exports = new AuditLogManager();
