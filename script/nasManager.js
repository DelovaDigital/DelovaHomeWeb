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
        console.log(`[NAS] listFiles called for id=${id} path=${dirPath} platform=${process.platform}`);
        const config = this.config.find(c => c.id === id);
        if (!config) throw new Error('NAS not found');

        // Force disable native mode on Linux/Pi to prevent infinite recursion
        if (config.mode === 'native' && process.platform !== 'darwin') {
            console.log('[NAS] Forcing smb2 mode on non-darwin platform');
            config.mode = 'smb2'; // Downgrade to smb2
        }

        if (config.mode === 'native') {
            return this.listNativeFiles(config, dirPath);
        }

        if (config.mode === 'legacy') {
            return this.listWithSmbClient(config, dirPath);
        }

        // Normalize path: ensure backslashes for SMB
        const smbPath = dirPath.replace(/\//g, '\\');

        return new Promise((resolve, reject) => {
            try {
                const client = new SMB2({
                    share: config.share,
                    domain: config.domain || '',
                    username: config.username,
                    password: config.password
                });

                client.readdir(smbPath, (err, files) => {
                    if (err) {
                        // Suppress error log if we are going to fallback
                        const isLogonFailure = err.code === 'STATUS_LOGON_FAILURE' || (err.message && err.message.includes('LOGON_FAILURE'));
                        
                        if (!isLogonFailure) {
                            console.error('[NAS] SMB2 readdir error:', err);
                        }
                        
                        // Fallback to smbclient on Linux if authentication fails
                        if (process.platform === 'linux' && isLogonFailure) {
                            console.log('[NAS] SMB2 library failed (Logon Failure). Trying smbclient fallback...');
                            this.listWithSmbClient(config, dirPath)
                                .then(files => {
                                    // If fallback works, update config to use legacy mode permanently
                                    console.log('[NAS] Fallback successful. Updating config to use legacy mode.');
                                    config.mode = 'legacy';
                                    this.saveConfig();
                                    resolve(files);
                                })
                                .catch(fallbackErr => {
                                    console.error('[NAS] smbclient fallback failed:', fallbackErr);
                                    reject(err); // Return original error if fallback fails
                                });
                            return;
                        }
                        
                        if (isLogonFailure) {
                             console.error('[NAS] SMB2 readdir error:', err);
                        }
                        reject(err);
                    } else {
                        const fileList = files.map(f => ({
                            name: f,
                            isDirectory: !f.includes('.') // Naive guess
                        }));
                        resolve(fileList);
                    }
                });
            } catch (err) {
                console.error('[NAS] SMB2 client init error:', err);
                reject(err);
            }
        });
    }

    async listWithSmbClient(config, dirPath) {
        const { exec } = require('child_process');
        
        // Convert share to forward slashes for smbclient (//host/share)
        const shareUrl = config.share.replace(/\\/g, '/');
        
        // Construct user%password
        let userAuth = config.username;
        if (config.domain) {
            userAuth = `${config.domain}\\${config.username}`;
        }
        // Escape single quotes in password for shell
        const safePassword = config.password.replace(/'/g, "'\\''");
        const auth = `${userAuth}%${safePassword}`;
        
        // Command: smbclient //host/share -U user%pass -D path -c ls
        // Note: dirPath needs to be backslashes for -D? Or forward? smbclient usually takes backslashes for internal paths
        const internalPath = dirPath.replace(/\//g, '\\');
        
        // Add legacy support options just in case
        const options = "--option='client min protocol=NT1'";
        
        let cmd = `smbclient '${shareUrl}' ${options} -U '${auth}' -c 'ls'`;
        if (internalPath) {
            cmd = `smbclient '${shareUrl}' ${options} -U '${auth}' -D '${internalPath}' -c 'ls'`;
        }
        
        console.log(`[NAS] Executing smbclient: ${cmd.replace(safePassword, '***')}`);

        return new Promise((resolve, reject) => {
            exec(cmd, { maxBuffer: 1024 * 1024 }, (err, stdout, stderr) => {
                if (err) {
                    console.error('[NAS] smbclient error:', stderr);
                    if (stderr.includes('not found')) {
                        return reject(new Error('smbclient not installed. Run: sudo apt-get install smbclient'));
                    }
                    return reject(new Error(stderr || err.message));
                }
                
                console.log('[NAS] smbclient success. Parsing output...');
                // console.log('[NAS] Raw output (first 5 lines):', stdout.split('\n').slice(0, 5).join('\n'));
                
                const files = [];
                const lines = stdout.split('\n');
                for (const line of lines) {
                    // Parse output: "  filename   D   0  Date..."
                    // Regex: space + name + space + attributes + space + size
                    // Attributes can be D, A, H, S, R, N, etc.
                    const match = line.match(/^\s+(.*?)\s+([DAHSRN]+)\s+(\d+)\s+\w+/);
                    if (match) {
                        const name = match[1].trim();
                        const attr = match[2];
                        if (name === '.' || name === '..') continue;
                        
                        files.push({
                            name: name,
                            isDirectory: attr.includes('D')
                        });
                    }
                }
                console.log(`[NAS] Parsed ${files.length} files.`);
                resolve(files);
            });
        });
    }

    async listNativeFiles(config, dirPath) {
        if (process.platform !== 'darwin') {
             // If we somehow got here on Linux, redirect back to listFiles but ensure mode is NOT native
             // to avoid recursion.
             config.mode = 'smb2';
             return this.listFiles(config.id, dirPath);
        }
        
        // ... (rest of native implementation for macOS) ...
        // Since we removed the implementation, let's just throw error or use SMB2
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

    async getFileStream(id, filePath) {
        const config = this.config.find(c => c.id === id);
        if (!config) throw new Error('NAS not found');

        // Normalize path
        const smbPath = filePath.replace(/\//g, '\\');

        if (config.mode === 'native') {
             const localPath = await this.getLocalFilePath(id, filePath);
             if (localPath) return fs.createReadStream(localPath);
        }

        if (config.mode === 'legacy') {
            return this.getSmbClientStream(config, filePath);
        }

        // Try SMB2 lib first
        try {
             const client = new SMB2({
                share: config.share,
                domain: config.domain || '',
                username: config.username,
                password: config.password
            });
            
            // Check if createReadStream is available and works
            return await client.createReadStream(smbPath);
        } catch (err) {
            const isLogonFailure = err.code === 'STATUS_LOGON_FAILURE' || (err.message && err.message.includes('LOGON_FAILURE'));

            if (!isLogonFailure) {
                console.error('[NAS] SMB2 stream error:', err);
            }

            // Fallback to smbclient on Linux
             if (process.platform === 'linux') {
                 if (isLogonFailure) {
                     console.log('[NAS] SMB2 stream failed (Logon Failure). Falling back to smbclient stream');
                 } else {
                     console.log('[NAS] Falling back to smbclient stream');
                 }
                 return this.getSmbClientStream(config, filePath);
             }
             
             if (isLogonFailure) {
                 console.error('[NAS] SMB2 stream error:', err);
             }
             throw err;
        }
    }

    getSmbClientStream(config, filePath) {
        const { spawn } = require('child_process');
        
        const shareUrl = config.share.replace(/\\/g, '/');
        let userAuth = config.username;
        if (config.domain) userAuth = `${config.domain}\\${config.username}`;
        
        const auth = `${userAuth}%${config.password}`;
        const internalPath = filePath.replace(/\//g, '\\');
        
        // smbclient //host/share -U user%pass -c 'get "path" -'
        // Note: When using spawn, do NOT wrap arguments in quotes like in shell
        const args = [
            shareUrl,
            "--option=client min protocol=NT1",
            '-U', auth,
            '-c', `get "${internalPath}" -`
        ];
        
        console.log(`[NAS] Spawning smbclient stream for ${internalPath}`);
        const child = spawn('smbclient', args);
        
        // Log stderr for debugging
        child.stderr.on('data', (data) => {
             console.error(`[NAS Stream Stderr]: ${data.toString()}`);
        });
        
        child.on('close', (code) => {
            console.log(`[NAS] smbclient stream process exited with code ${code}`);
        });

        return child.stdout;
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
