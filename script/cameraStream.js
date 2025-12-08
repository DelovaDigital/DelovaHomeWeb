const { RTCPeerConnection, RTCRtpCodecParameters, MediaStreamTrack } = require("werift");
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
        this.tracks = []; // Array of { track, ssrc, pt }
    }

    async startUDP() {
        if (this.udpSocket) return;
        this.udpSocket = dgram.createSocket("udp4");
        await new Promise(resolve => {
            this.udpSocket.bind(0, "127.0.0.1", () => {
                this.udpPort = this.udpSocket.address().port;
                console.log(`[WebRTC] UDP socket bound to port ${this.udpPort}`);
                resolve();
            });
        });

        this.udpSocket.on("message", msg => {
            // Broadcast RTP to all tracks, patching SSRC and Payload Type
            this.tracks.forEach(context => {
                if (context.ssrc && context.pt) {
                    // Clone buffer to avoid race conditions/corruption
                    const packet = Buffer.from(msg);
                    
                    // Patch Payload Type (Byte 1)
                    // Keep the Marker bit (0x80) and inject new PT (0x7F)
                    packet[1] = (packet[1] & 0x80) | (context.pt & 0x7F);

                    // Patch SSRC (Bytes 8-11)
                    packet.writeUInt32BE(context.ssrc, 8);
                    
                    context.track.writeRtp(packet);
                } else {
                    // Fallback
                    context.track.writeRtp(msg);
                }
            });
        });
    }

    startFFmpeg() {
        if (this.ffmpeg) return;
        
        const args = [
            "-rtsp_transport", "tcp",
            "-i", this.url,
            "-an", // No audio for now
            
            // Force Transcode to H.264 Baseline (Browser Compatible)
            "-c:v", "libx264",
            "-vf", "scale=640:360", // Lower resolution for stability
            "-r", "15", // Match input framerate
            "-preset", "ultrafast",
            "-tune", "zerolatency",
            "-profile:v", "baseline",
            "-level", "3.0",
            "-pix_fmt", "yuv420p",
            "-g", "30", // Keyframe every ~2s
            "-bsf:v", "h264_mp4toannexb", // Ensure Annex B format for RTP
            
            "-f", "rtp",
            "-payload_type", "96",
            "-ssrc", "12345678", // Fixed SSRC (we overwrite it in Node.js)
            `rtp://127.0.0.1:${this.udpPort}?pkt_size=1200`
        ];

        console.log(`[WebRTC] Starting ffmpeg: ffmpeg ${args.join(" ")}`);
        this.ffmpeg = spawn("ffmpeg", args);

        this.ffmpeg.stderr.on("data", d => {
            console.log(`[ffmpeg] ${d}`);
        });

        this.ffmpeg.on("close", code => {
            console.log(`[WebRTC] ffmpeg exited with code ${code}`);
            this.ffmpeg = null;
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
        await this.startUDP();

        const pc = new RTCPeerConnection({
            codecs: {
                video: [
                    new RTCRtpCodecParameters({
                        mimeType: "video/H264",
                        clockRate: 90000,
                        payloadType: 96,
                        rtcpFeedback: [
                            { type: "nack" },
                            { type: "nack", parameter: "pli" },
                            { type: "ccm", parameter: "fir" },
                            { type: "goog-remb" },
                        ],
                        parameters: "packetization-mode=1;profile-level-id=42e01f;level-asymmetry-allowed=1",
                    }),
                ],
            },
        });

        this.connections.add(pc);

        const track = new MediaStreamTrack({ kind: "video" });
        pc.addTrack(track);

        await pc.setRemoteDescription({ type: "offer", sdp: offerSdp });
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);

        // 1. Extract SSRC from the generated answer SDP
        const ssrcMatch = answer.sdp.match(/a=ssrc:(\d+)/);
        const ssrc = ssrcMatch ? parseInt(ssrcMatch[1], 10) : 0;

        // 2. Extract Negotiated Payload Type (PT) for H264
        // Look for a=rtpmap:<pt> H264/90000
        const ptMatch = answer.sdp.match(/a=rtpmap:(\d+) H264\/90000/i);
        const pt = ptMatch ? parseInt(ptMatch[1], 10) : 96;

        console.log(`[WebRTC] Client connected. SSRC: ${ssrc}, PT: ${pt}`);

        const trackContext = { track, ssrc, pt };
        this.tracks.push(trackContext);

        pc.connectionStateChange.subscribe(state => {
            console.log(`[WebRTC] Connection state: ${state}`);
            if (state === "closed" || state === "failed") {
                this.connections.delete(pc);
                const idx = this.tracks.indexOf(trackContext);
                if (idx > -1) this.tracks.splice(idx, 1);
            }
        });

        // Start FFmpeg now that we have a client
        this.startFFmpeg();

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
