const Stream = require('node-rtsp-stream');

class CameraStreamManager {
    constructor() {
        this.streams = new Map(); // deviceId -> { stream, wsPort }
        this.basePort = 9900;
    }

    startStream(deviceId, rtspUrl) {
        if (this.streams.has(deviceId)) {
            console.log(`Stream for device ${deviceId} already running on port ${this.streams.get(deviceId).wsPort}`);
            return this.streams.get(deviceId).wsPort;
        }

        const port = this.basePort + this.streams.size + 1;
        
        console.log(`Starting stream for ${deviceId} on port ${port} with URL: ${rtspUrl}`);
        
        try {
            const stream = new Stream({
                name: deviceId,
                streamUrl: rtspUrl,
                wsPort: port,
                ffmpegOptions: { // options ffmpeg flags
                    '-stats': '', 
                    '-r': 25,
                    '-q:v': 3 // Quality setting
                }
            });

            this.streams.set(deviceId, { stream, wsPort: port });
            return port;
        } catch (e) {
            console.error('Error starting stream:', e);
            return null;
        }
    }

    stopStream(deviceId) {
        if (this.streams.has(deviceId)) {
            const { stream } = this.streams.get(deviceId);
            try {
                stream.stop();
            } catch (e) {
                console.error('Error stopping stream:', e);
            }
            this.streams.delete(deviceId);
        }
    }
    
    getStreamPort(deviceId) {
        if (this.streams.has(deviceId)) {
            return this.streams.get(deviceId).wsPort;
        }
        return null;
    }
}

module.exports = new CameraStreamManager();
