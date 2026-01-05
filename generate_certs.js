const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const CERT_FILE = path.join(__dirname, 'server.cert');
const KEY_FILE = path.join(__dirname, 'server.key');

async function generate() {
    console.log('Generating certificates for cloud.delovahome.com...');
    const selfsigned = require('selfsigned');
    const attrs = [{ name: 'commonName', value: 'cloud.delovahome.com' }];
    
    try {
        // selfsigned v2+ returns a Promise
        let pems = await selfsigned.generate(attrs, { days: 365, keySize: 2048, algorithm: 'sha256' });
        
        if (!pems || !pems.cert) {
            console.error('Error: Generated object is missing certificate.', pems);
            return;
        }

        fs.writeFileSync(CERT_FILE, pems.cert);
        fs.writeFileSync(KEY_FILE, pems.private);
        
        console.log('✅ Certificates created successfully!');
        console.log('  - ' + CERT_FILE);
        console.log('  - ' + KEY_FILE);
        console.log('\nYou can now start your server with: node server.js');
        
    } catch (err) {
        console.error('Error generating certificates:', err);
    }
}

(async () => {
    try {
        try {
            require.resolve('selfsigned');
        } catch (e) {
            console.log('Installing "selfsigned" package to generate certificates...');
            execSync('npm install selfsigned --no-save', { stdio: 'inherit' });
        }
        await generate();
    } catch (err) {
        console.error('Failed to setup certificates:', err);
    }
})();
