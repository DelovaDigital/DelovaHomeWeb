const aedes = require('aedes')();
const server = require('net').createServer(aedes.handle);
const port = 1883;

function startBroker() {
    return new Promise((resolve, reject) => {
        server.listen(port, function () {
            console.log('[Broker] MQTT Broker started and listening on port', port);
            resolve(server);
        });

        server.on('error', (err) => {
            if (err.code === 'EADDRINUSE') {
                console.log('[Broker] Port 1883 already in use, assuming external broker is running.');
                resolve(null); // Resolve anyway, assuming something else is handling MQTT
            } else {
                console.error('[Broker] Error starting broker:', err);
                reject(err);
            }
        });
    });
}

module.exports = { startBroker, aedes };
