const EventEmitter = require('events');
const fs = require('fs');
const path = require('path');

class NotificationManager extends EventEmitter {
    constructor() {
        super();
        this.history = [];
        this.maxHistory = 100;
        this.pushTokens = new Set();
        this.fcmAdmin = null;
        
        // Try initialize Firebase Admin if creds exist
        // const serviceAccount = require('../serviceAccountKey.json');
        // if (serviceAccount) {
        //    const admin = require('firebase-admin');
        //    admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
        //    this.fcmAdmin = admin;
        // }

        this.settings = {
            email: { enabled: false, smtp: '' }, // Placeholder for Windows Server SMTP or external
            push: { enabled: false, fcmKey: '' } // Placeholder for Firebase
        };
    }
    
    registerDeviceToken(token, platform) {
        if (!token) return;
        this.pushTokens.add(token);
        console.log(`[Notification] Registered push token (Total: ${this.pushTokens.size})`);
    }

    /**
     * Send a notification
     * @param {string} title 
     * @param {string} message 
     * @param {string} priority 'high', 'normal', 'low'
     * @param {string} target 'all', 'admin', specific user ID
     */
    async send(title, message, priority = 'normal', target = 'all') {
        const notification = {
            id: Date.now().toString(),
            timestamp: new Date().toISOString(),
            title,
            message,
            priority,
            target,
            read: false
        };

        console.log(`[Notification] [${priority.toUpperCase()}] ${title}: ${message}`);

        // 1. Add to history
        this.history.unshift(notification);
        if (this.history.length > this.maxHistory) {
            this.history.pop();
        }

        // 2. Emit event (for WebSocket broadcasting in server.js)
        this.emit('notification', notification);
        
        // 3. Send Push Notification via Firebase
        if (this.pushTokens.size > 0 && this.fcmAdmin) {
            try {
                 const messagePayload = {
                    notification: { title, body: message },
                    tokens: Array.from(this.pushTokens)
                 };
                 await this.fcmAdmin.messaging().sendMulticast(messagePayload);
                 console.log(`[Notification] Sent FCM push to ${this.pushTokens.size} devices`);
            } catch(e) {
                 console.error('[Notification] FCM Send Error:', e);
            }
        }


        // 3. Dispatch to external providers (Not implemented yet, but scaffolded)
        if (this.settings.email.enabled) {
            // await this.sendEmail(notification);
        }
    }

    getHistory(userId = null) {
        if (!userId) return this.history;
        return this.history.filter(n => n.target === 'all' || n.target === userId);
    }

    markAsRead(id) {
        const note = this.history.find(n => n.id === id);
        if (note) note.read = true;
    }

    clearAll() {
        this.history = [];
    }
}

module.exports = new NotificationManager();
