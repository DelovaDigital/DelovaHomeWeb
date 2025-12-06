const { RTCPeerConnection, MediaStreamTrack } = require("werift");
const { spawn } = require("child_process");
const dgram = require("dgram");
const EventEmitter = require("events");

class WebRtcCameraStream extends EventEmitter {
constructor(rtspUrl) {
super();
this.url = rtspUrl;
this.udpSocket = null;
this.udpPort = 0;
this.ffmpeg = null;
this.connections = new Set();
this.tracks = [];
}

async start() {
    if (this.udpSocket) return;

    // 1. Create UDP socket
    this.udpSocket = dgram.createSocket("udp4");
    await new Promise((resolve) => {
        this.udpSocket.bind(0, "127.0.0.1", () => {
            this.udpPort = this.udpSocket.address().port;
            console.log(`[WebRTC] UDP socket bound to port ${this.udpPort}`);
            resolve();
        });
    });

    // 2. Forward RTP packets to werift tracks
    this.udpSocket.on("message", (msg) => {
        this.tracks.forEach(track => track.writeRtp(msg));
    });

    // 3. Start FFmpeg
    const args = [
        "-rtsp_transport", "tcp",
        "-i", this.url,
        "-an", // no audio
        "-c:v", "libx264",
        "-preset", "ultrafast",
        "-tune", "zerolatency",
        "-profile:v", "baseline",
        "-level", "3.1",
        "-pix_fmt", "yuv420p",
        "-r", "25",
        "-g", "25", // keyframe every 1 second
        "-x264opts", "keyint=25:min-keyint=25:no-scenecut",
        "-f", "rtp",
        "-payload_type", "96",
        "-ssrc", "12345678",
        `rtp://127.0.0.1:${this.udpPort}?pkt_size=1200`
    ];

    console.log(`[WebRTC] Starting ffmpeg: ffmpeg ${args.join(" ")}`);
    this.ffmpeg = spawn("ffmpeg", args);

    this.ffmpeg.stderr.on("data", (d) => {
        // Optional: uncomment to debug
        // console.log(`[ffmpeg] ${d}`);
    });

    this.ffmpeg.on("close", (code) => {
        console.log(`[WebRTC] ffmpeg exited with code ${code}`);
        this.stop();
    });
}

stop() {
    if (this.ffmpeg) {
        this.ffmpeg.kill();
        this.ffmpeg = null;
    }
    if (this.udpSocket) {
        this.udpSocket.close();
        this.udpSocket = null;
    }
    this.connections.forEach(pc => pc.close());
    this.connections.clear();
    this.tracks = [];
}

async handleOffer(offerSdp) {
    if (!this.udpSocket) await this.start();

    const pc = new RTCPeerConnection({
        codecs: {
            video: [
                {
                    mimeType: "video/H264",
                    clockRate: 90000,
                    payloadType: 96,
                    parameters: "packetization-mode=1;profile-level-id=42e01f;level-asymmetry-allowed=1",
                    rtcpFeedback: [
                        { type: "nack" },
                        { type: "nack", parameter: "pli" },
                        { type: "ccm", parameter: "fir" },
                        { type: "goog-remb" },
                    ],
                },
            ],
        },
    });

    this.connections.add(pc);

    const track = new MediaStreamTrack({ kind: "video" });
    this.tracks.push(track);
    pc.addTrack(track);

    await pc.setRemoteDescription({ type: "offer", sdp: offerSdp });
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);

    pc.connectionStateChange.subscribe((state) => {
        console.log(`[WebRTC] Connection state: ${state}`);
        if (state === "closed" || state === "failed") {
            this.connections.delete(pc);
            const idx = this.tracks.indexOf(track);
            if (idx > -1) this.tracks.splice(idx, 1);
        }
    });

    return answer.sdp;
}


}

class CameraStreamManager {
constructor() {
this.streams = new Map();
}


getStream(deviceId, rtspUrl) {
    if (!this.streams.has(deviceId)) {
        this.streams.set(deviceId, new WebRtcCameraStream(rtspUrl));
    }
    return this.streams.get(deviceId);
}

stopStream(deviceId) {
    if (this.streams.has(deviceId)) {
        this.streams.get(deviceId).stop();
        this.streams.delete(deviceId);
    }
}

}

module.exports = new CameraStreamManager();
