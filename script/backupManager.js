const fs = require('fs');
const path = require('path');

module.exports = function(app, hubConfig) {
    console.log('Initializing Backup Manager routes...');

    app.get('/api/backup/download', (req, res) => {
        try {
            const backup = {
                timestamp: new Date().toISOString(),
                version: '1.0',
                files: {
                    hubConfig: readJson('hub_config.json'),
                    scenes: readJson('data/scenes.json'),
                    rooms: readJson('data/rooms.json'),
                    sceneMappings: readJson('data/scene_mappings.json'),
                    locales: readJson('data/locales.json')
                }
            };

            res.setHeader('Content-Disposition', `attachment; filename="delovahome_backup_${Date.now()}.json"`);
            res.setHeader('Content-Type', 'application/json');
            res.json(backup);
        } catch (e) {
            console.error('Backup download failed:', e);
            res.status(500).json({ error: 'Failed to generate backup' });
        }
    });

    app.post('/api/backup/restore', (req, res) => {
        try {
            console.log('[Backup] Restoration started...');
            const backup = req.body;
            
            if (!backup || !backup.files) {
                 return res.status(400).json({ error: 'Invalid backup format' });
            }

            const files = backup.files;

            // Restore files
            if (files.hubConfig) writeJson('hub_config.json', files.hubConfig);
            if (files.scenes) writeJson('data/scenes.json', files.scenes);
            if (files.rooms) writeJson('data/rooms.json', files.rooms);
            if (files.sceneMappings) writeJson('data/scene_mappings.json', files.sceneMappings);
            if (files.locales) writeJson('data/locales.json', files.locales);

            console.log('[Backup] Restoration completed.');
            res.json({ success: true, message: 'Backup restored. Restarting...' });
            
            // Restart
            setTimeout(() => {
                 process.exit(0); 
            }, 1000);

        } catch (e) {
             console.error('Backup restore failed:', e);
             res.status(500).json({ error: 'Failed to restore backup' });
        }
    });
    
    // System Actions
    app.post('/api/system/restart', (req, res) => {
         res.json({ success: true });
         setTimeout(() => {
             console.log('[System] Manual restart triggered.');
             process.exit(0); 
         }, 1000);
    });
    
    // Helpers
    function readJson(relPath) {
        const fullPath = path.join(__dirname, '..', relPath);
        if (fs.existsSync(fullPath)) {
            try {
                return JSON.parse(fs.readFileSync(fullPath, 'utf8'));
            } catch(e) { console.error(`Failed to read ${relPath}`, e); return null; }
        }
        return null; // Return null if not found
    }

    function writeJson(relPath, data) {
        const fullPath = path.join(__dirname, '..', relPath);
        const dir = path.dirname(fullPath);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(fullPath, JSON.stringify(data, null, 2));
    }
};
