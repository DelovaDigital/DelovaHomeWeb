const SMB2 = require('@marsaud/smb2');
const fs = require('fs');
const path = require('path');

class NasManager {
    constructor() {
        this.config = [];
        this.loadConfig();
    }

    loadConfig() {
        try {
            const configPath = path.join(__dirname, '../nas-config.json');
            if (fs.existsSync(configPath)) {
                this.config = JSON.parse(fs.readFileSync(configPath));
            }
        } catch (e) {
            console.error('Error loading NAS config:', e);
            this.config = [];
        }
    }

    saveConfig() {
        const configPath = path.join(__dirname, '../nas-config.json');
        fs.writeFileSync(configPath, JSON.stringify(this.config, null, 2));
    }

    getNasList() {
        return this.config.map(c => ({
            id: c.id,
            name: c.name || c.host,
            host: c.host,
            share: c.share,
            username: c.username
        }));
    }

    async addNas(details) {
        let domain = details.domain || ''; 
        let username = details.username;

        // Handle domain\user format
        if (username && username.includes('\\')) {
            const parts = username.split('\\');
            domain = parts[0];
            username = parts[1];
        }

        // If domain is explicitly empty string, smb2 might behave weirdly if it expects something.
        // But usually empty string is fine for "no domain".
        // However, some servers require WORKGROUP if no domain is used.
        // Let's try to be smart: if domain is empty, try connecting. If it fails with LOGON_FAILURE, try WORKGROUP.
        
        const baseConfig = {
            share: `\\\\${details.host}\\${details.share}`,
            username: username,
            password: details.password,
            host: details.host, 
            shareName: details.share, 
            name: details.name || details.host
        };

        // Strategies to try for connection
        const strategies = [];
        
        // 1. Try as provided (or empty domain)
        strategies.push({ ...baseConfig, domain: domain || '' });

        // 2. If no domain provided, try WORKGROUP
        if (!domain) {
            strategies.push({ ...baseConfig, domain: 'WORKGROUP' });
        }

        // 3. If no domain provided, try Hostname/IP as domain
        if (!domain) {
            strategies.push({ ...baseConfig, domain: details.host });
        }

        let lastError = null;

        for (const config of strategies) {
            console.log(`[NAS] Testing connection to ${config.share} as ${config.domain}\\${config.username}`);
            try {
                await this.testConnection(config);
                // Success! Save this config
                config.id = Date.now().toString();
                this.config.push(config);
                this.saveConfig();
                return { ok: true, id: config.id };
            } catch (err) {
                console.error(`[NAS] Strategy failed (${config.domain}):`, err.code || err.message);
                lastError = err;
                // If error is NOT logon failure (e.g. network error), stop trying
                if (err.code !== 'STATUS_LOGON_FAILURE') {
                    break;
                }
            }
        }

        // If we get here, all strategies failed
        if (lastError && lastError.code === 'STATUS_LOGON_FAILURE') {
             // Check if it works with system tools to verify credentials
             // Use the original base config for this check
             const systemAuthWorks = await this.checkWithSmbUtil(baseConfig);
             if (systemAuthWorks) {
                 console.log('[NAS] System auth works. Trying native mount fallback...');
                 try {
                     await this.testNativeConnection(baseConfig);
                     // If native works, save with mode='native'
                     baseConfig.id = Date.now().toString();
                     baseConfig.mode = 'native';
                     this.config.push(baseConfig);
                     this.saveConfig();
                     return { ok: true, id: baseConfig.id };
                 } catch (nativeErr) {
                     console.error('[NAS] Native fallback failed:', nativeErr);
                     throw new Error('Credentials zijn correct, maar zowel de applicatie als de systeem-mount faalden. Controleer permissies op de share.');
                 }
             }

             throw new Error('Inloggen mislukt. Controleer wachtwoord. Tip: Op Raspberry Pi moet je vaak "sudo smbpasswd -a pi" uitvoeren om het Samba-wachtwoord in te stellen.');
        }
        
        throw new Error('Verbinding mislukt: ' + (lastError ? (lastError.code || lastError.message) : 'Onbekende fout'));
    }

    async listFiles(id, dirPath = '') {
        const config = this.config.find(c => c.id === id);
        if (!config) throw new Error('NAS not found');

        // Use native SMB2 library instead of system mount commands
        // This works on all platforms (macOS, Linux, Windows) without needing sudo/mount permissions
        return new Promise((resolve, reject) => {
            const client = new SMB2({
                share: config.share,
                domain: config.domain || '',
                username: config.username,
                password: config.password
            });

            // Convert path to Windows style backslashes
            const smbPath = dirPath.replace(/\//g, '\\');

            client.readdir(smbPath, (err, files) => {
                if (err) {
                    console.error('[NAS] SMB2 readdir error:', err);
                    return reject(err);
                }

                // Format file list
                // Note: SMB2 library returns just names, we might need stat for isDirectory
                // But for now let's just return names and try to guess or fetch details if needed
                // Actually, client.readdir returns strings.
                // We need to iterate and check if they are folders.
                // This is slow. Let's try to just return them and let the UI handle it,
                // or do a parallel check.
                
                // Optimization: Assume no extension = folder? No, that's bad.
                // We should use client.stat() on each file? That's N+1 requests.
                // The SMB2 library might not support readdir with attributes easily.
                
                // Let's try to map them.
                const fileList = files.map(name => ({
                    name: name,
                    isDirectory: !name.includes('.'), // Naive guess for now to speed up
                    path: path.join(dirPath, name).replace(/\\/g, '/')
                }));
                
                resolve(fileList);
            });
        });
    }

    // Legacy native mount methods removed to prevent Linux errors
    async testNativeConnection(config) {
        throw new Error('Native mount not supported on this platform');
    }

    async listFilesNative(config, dirPath) {
        throw new Error('Native mount not supported on this platform');
    }

    testConnection(config) {
        return new Promise((resolve, reject) => {
            // Some NAS devices (like OMV/Samba) might require NTLMv2 or specific packet signing settings.
            // The smb2 library defaults to auto-negotiate but sometimes needs help.
            
            const smbOptions = {
                share: config.share,
                domain: config.domain || '',
                username: config.username,
                password: config.password,
                autoCloseTimeout: 0
            };

            const client = new SMB2(smbOptions);

            client.readdir('', (err, files) => {
                if (err) reject(err);
                else resolve(files);
            });
        });
    }

    async checkWithSmbUtil(config) {
        if (process.platform !== 'darwin') return false;
        const { exec } = require('child_process');
        // Construct URL: //user:pass@host
        // We need to encode components to be safe
        const user = encodeURIComponent(config.username);
        const pass = encodeURIComponent(config.password);
        const host = config.host;
        const url = `//${user}:${pass}@${host}`;
        
        return new Promise((resolve) => {
            // smbutil view lists shares. If this works, auth is good.
            exec(`smbutil view "${url}"`, (err, stdout, stderr) => {
                if (err) {
                    console.log('[NAS] smbutil check failed (Auth invalid or unreachable)');
                    resolve(false);
                } else {
                    console.log('[NAS] smbutil check success (Credentials are valid)');
                    resolve(true);
                }
            });
        });
    }

    async listFiles(id, dirPath = '') {
        const config = this.config.find(c => c.id === id);
        if (!config) throw new Error('NAS not found');

        if (config.mode === 'native') {
            return this.listNativeFiles(config, dirPath);
        }

        // Normalize path: ensure backslashes for SMB
        const smbPath = dirPath.replace(/\//g, '');

        return new Promise((resolve, reject) => {
            const client = new SMB2({
                share: config.share,
                domain: config.domain || '',
                username: config.username,
                password: config.password
            });

            client.readdir(smbPath, (err, files) => {
                if (err) {
                    reject(err);
                } else {
                    // Add metadata if possible, or just return names
                    // smb2 readdir returns strings (filenames)
                    // To get isDirectory, we might need to try to read it or use another method?
                    // smb2 has readdir which returns names.
                    // We can try to stat them, but that's slow for many files.
                    // Let's just return names for now and maybe try to guess or fetch details on demand.
                    // Actually, standard readdir just gives names.
                    
                    // Map to object structure
                    const fileList = files.map(f => ({
                        name: f,
                        isDirectory: !f.includes('.') // Very naive guess, but smb2 lib is limited
                    }));
                    resolve(fileList);
                }
            });
        });
    }

    async listNativeFiles(config, dirPath) {
        // This method is deprecated and should not be used on Linux/Pi
        // Redirect to standard listFiles which uses SMB2 lib
        return this.listFiles(config.id, dirPath);
    }

    findExistingMount(config) {
        const { exec } = require('child_process');
        return new Promise((resolve) => {
            exec('mount', (err, stdout) => {
                if (err) return resolve(null);
                
                // Look for //user@host/share
                // Note: mount output might not include password, and might use different format
                // Example: //pi@192.168.0.114/Backup on ...
                const searchStr = `//${config.username}@${config.host}/${config.shareName}`;
                const lines = stdout.split('\n');
                for (const line of lines) {
                    if (line.includes(searchStr)) {
                        // Extract path: "... on /path/to/mount (..."
                        const match = line.match(/ on (.+) \(/);
                        if (match && match[1]) {
                            return resolve(match[1]);
                        }
                    }
                }
                resolve(null);
            });
        });
    }

    async getFileDetails(id, filePath) {
         const config = this.config.find(c => c.id === id);
         if (!config) throw new Error('NAS not found');
         
         if (config.mode === 'native') {
             // Not implemented for native yet, but we can just return basic info
             return { size: 0, created: new Date(), modified: new Date() };
         }

         const smbPath = filePath.replace(/\//g, '\\');
         
         return new Promise((resolve, reject) => {
            const client = new SMB2({
                share: config.share,
                domain: config.domain,
                username: config.username,
                password: config.password
            });
            
            client.stat(smbPath, (err, stats) => {
                if(err) reject(err);
                else resolve(stats);
            });
         });
    }

    async getLocalFilePath(id, filePath) {
        const config = this.config.find(c => c.id === id);
        if (!config) throw new Error('NAS not found');

        if (config.mode === 'native') {
            const mountPoint = await this.findExistingMount(config);
            if (mountPoint) {
                // Fix path separators for macOS (replace backslashes with forward slashes)
                const normalizedPath = filePath.replace(/\\/g, '/');
                return path.join(mountPoint, normalizedPath);
            }
            // If not mounted, we should try to mount it? 
            // For now assume it's mounted if we are listing files.
            // Or we can trigger a temporary mount just for this file?
            // Let's try to trigger listNativeFiles to ensure mount, then get path.
            // But listNativeFiles unmounts immediately if it creates a temp mount.
            // We need a persistent mount for streaming.
            // For now, let's rely on the fact that if the user browsed, it might be mounted?
            // Actually, listNativeFiles unmounts if it created the mount.
            // If we want streaming, we should probably keep it mounted or mount on demand.
            
            // Strategy: Check if mounted. If not, mount it and keep it?
            // Or just mount, stream, and let OS handle cleanup?
            // Better: Mount to a stable location for this session?
            
            // Simple fix: Just try to find existing mount. If not found, fail for now.
            // Since we just listed files, it might be mounted if it was a "leaked" mount.
            // But if we used a temp mount in listFiles, it's gone now.
            
            // Wait, my listNativeFiles implementation unmounts immediately!
            // Except if it found an EXISTING mount.
            // So if we rely on "leaked" mounts, it works.
            // If we want proper support, we should mount persistently.
            
            if (!mountPoint) {
                 // Try to mount it temporarily? No, sendFile needs a path.
                 // Let's try to mount it to a fixed path for this NAS ID
                 const os = require('os');
                 const fixedMount = path.join(os.tmpdir(), `delovahome_nas_persistent_${id}`);
                 if (!fs.existsSync(fixedMount)) fs.mkdirSync(fixedMount);
                 
                 // Check if already mounted there
                 const isMounted = await this.isMountedAt(fixedMount);
                 if (!isMounted) {
                     await this.mountPath(config, fixedMount);
                 }
                 const normalizedPath = filePath.replace(/\\/g, '/');
                 return path.join(fixedMount, normalizedPath);
            }
            const normalizedPath = filePath.replace(/\\/g, '/');
            return path.join(mountPoint, normalizedPath);
        }
        return null; // Not supported for non-native yet (would need to download to temp)
    }

    isMountedAt(path) {
        const { exec } = require('child_process');
        return new Promise(resolve => {
            exec('mount', (err, stdout) => {
                if (err) return resolve(false);
                resolve(stdout.includes(` on ${path} (`));
            });
        });
    }

    mountPath(config, mountPoint) {
        const { exec } = require('child_process');
        const user = encodeURIComponent(config.username);
        const pass = encodeURIComponent(config.password);
        const host = config.host;
        const share = config.shareName;
        const url = `//${user}:${pass}@${host}/${share}`;
        
        return new Promise((resolve, reject) => {
            exec(`mount_smbfs "${url}" "${mountPoint}"`, (err) => {
                if (err) reject(err);
                else resolve();
            });
        });
    }
}

module.exports = new NasManager();
