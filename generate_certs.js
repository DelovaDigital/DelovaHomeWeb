const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const CERT_FILE = path.join(__dirname, 'server.cert');
const KEY_FILE = path.join(__dirname, 'server.key');

function generate() {
    console.log('Generating certificates for cloud.delovahome.com...');
    const selfsigned = require('selfsigned');
    const attrs = [{ name: 'commonName', value: 'cloud.delovahome.com' }];
    const pems = selfsigned.generate(attrs, { days: 365, keySize: 2048, algorithm: 'sha256' });

    if (!pems.cert) {
        console.error('Error: pems.cert is undefined. Keys:', Object.keys(pems));
    }

    fs.writeFileSync(CERT_FILE, pems.cert);
    fs.writeFileSync(KEY_FILE, pems.private);
    
    console.log('✅ Certificates created successfully!');
    console.log('  - ' + CERT_FILE);
    console.log('  - ' + KEY_FILE);
    console.log('\nYou can now start your server with: node server.js');
}

try {
    require.resolve('selfsigned');
    generate();
} catch (e) {
    console.log('Installing "selfsigned" package to generate certificates...');
    try {
        execSync('npm install selfsigned --no-save', { stdio: 'inherit' });
        generate();
    } catch (err) {
        console.error('Failed to install selfsigned:', err);
    }
}
