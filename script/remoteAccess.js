module.exports = function(app, hubConfig, cloudClient) {
    console.log('Initializing Remote Access Routes...');

    // Link Hub to Cloud Account
    app.post('/api/cloud/link', async (req, res) => {
        const { username, password, cloudUrl } = req.body;
        
        if (!cloudClient) {
             return res.status(500).json({ error: 'Cloud client not initialized' });
        }

        try {
            console.log(`[Remote Access] Linking hub to ${cloudUrl} as ${username}`);
            // Assuming cloudClient.linkHub handles the handshake and saving of config
            await cloudClient.linkHub(cloudUrl, username, password, hubConfig.name);
            
            // Initiate connection after linking
            cloudClient.connect(); 
            
            res.json({ success: true });
        } catch(e) {
            console.error('[Remote Access] Link failed:', e);
            res.status(401).json({ error: e.message || 'Failed to link hub' });
        }
    });

    // Unlink/Disconnect Hub
    app.post('/api/cloud/disconnect', (req, res) => {
        if (!cloudClient) {
            return res.status(500).json({ error: 'Cloud client not initialized' });
        }

        try {
            console.log('[Remote Access] Unlinking hub...');
            cloudClient.disconnect();
            
            // Remove config file to prevent auto-reconnect
            const fs = require('fs');
            const path = require('path');
            const configPath = path.join(__dirname, '../cloud-config.json');
            
            if (fs.existsSync(configPath)) {
                fs.unlinkSync(configPath);
                console.log('[Remote Access] Removed cloud-config.json');
            }
            
            // Clear in-memory config if accessible, or relying on cloudClient to reload/clear
            if(cloudClient.config) {
                 cloudClient.config = {};
            }

            res.json({ success: true });
        } catch (e) {
             console.error('[Remote Access] Unlink failed:', e);
             res.status(500).json({ error: e.message });
        }
    });
};
