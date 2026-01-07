const { SonosManager } = require('@svrooij/sonos');

class SonosManagerModule {
    constructor() {
        this.manager = new SonosManager();
        this.isInitialized = false;
        this._initialize();
    }

    async _initialize() {
        try {
            console.log('Initializing Sonos discovery...');
            // Initialize will start discovery and find all devices.
            // Catch errors specifically from discovery to avoid crashing
            try {
                await this.manager.InitializeWithDiscovery(10); 
                this.isInitialized = true;
                console.log(`Sonos discovery complete. Found ${this.manager.Devices.length} devices.`);
            } catch (discoveryErr) {
                if (discoveryErr.message && discoveryErr.message.includes('No players found')) {
                    console.log('Sonos discovery: No players found (this is normal if no Sonos devices are on the network).');
                    this.isInitialized = true; // Mark as initialized even if empty, so we don't block usage
                } else {
                    throw discoveryErr;
                }
            }
            
        } catch (err) {
            console.error('Error during Sonos initialization:', err.message);
        }
    }

    getDiscoveredDevices() {
        if (!this.isInitialized) {
            console.warn('Sonos manager not yet initialized. Device list may be empty.');
            return [];
        }
        // Safely access devices without throwing if empty
        try {
            // The library throws "No Devices available!" if accessing .Devices when empty.
            // Using checkInitialized() internally or similar might trigger this.
            // We can check this.manager.devices (lowercase) if accessible or wrap in try-catch.
            return (this.manager.Devices || []).map(d => ({ uuid: d.uuid, name: d.Name }));
        } catch (e) {
            // Suppress "No Devices available!" error from library
            return [];
        }
    }

    async _getDevice(uuid) {
        if (!this.isInitialized) {
            throw new Error('Sonos manager not initialized.');
        }
        const device = this.manager.Devices.find(d => d.uuid === uuid);
        if (!device) {
            throw new Error(`Sonos device with UUID ${uuid} not found.`);
        }
        return device;
    }

    async play(uuid, uri, metadata) {
        const device = await this._getDevice(uuid);
        // To play a stream, you often need to set the AVTransportURI first
        if (uri) {
            // Special handling for Spotify URIs on Sonos
            // Sonos requires a specific URI format for Spotify content:
            // x-rincon-cpcontainer:1006206c{playlist_id}?sid=9&flags=10860&sn=2 for Playlists
            // x-sonos-spotify:spotify%3atrack%3a{track_id}?sid=9&flags=8224&sn=2 for Tracks
            
            let sonosUri = uri;
            let sonosMeta = metadata || '';
            const isSpotify = uri.startsWith('spotify:');

            if (isSpotify) {
                 const region = 3079; // Europe? This varies. 
                 // Actually, sid=9 is for Spotify. flags vary.
                 // sid=9, sn=2 seems standard for Spotify Connect logic via UPnP?
                 // But simpler is to use the dedicated library methods if available, or construct the URI carefully.
                 // The library 'sonos' has helpers for this ideally, but if not we do it manually.

                 // Manual Construction:
                 if (uri.includes('playlist')) {
                     // Spotify Playlist
                     // Format: x-rincon-cpcontainer:1006206c{hex_playlist_id}?sid=9&flags=10860&sn=1
                     const playlistId = uri.split(':')[2];
                     
                     // Metadata IS required for containers usually.
                     // If we don't have it, we might fail or play empty.
                     // Construct minimal DIDL if missing
                     if (!sonosMeta) {
                         sonosMeta = `<DIDL-Lite xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:upnp="urn:schemas-upnp-org:metadata-1-0/upnp/" xmlns:r="urn:schemas-rinconnetworks-com:metadata-1-0/" xmlns="urn:schemas-upnp-org:metadata-1-0/DIDL-Lite/"><item id="1006206c${playlistId}" parentID="1006206c" restricted="true"><dc:title>Spotify Playlist</dc:title><upnp:class>object.container.playlistContainer</upnp:class><desc id="cdudn" nameSpace="urn:schemas-rinconnetworks-com:metadata-1-0/">SA_RINCON65535_</desc></item></DIDL-Lite>`;
                     }
                     
                     // We actually need to use AddURIToQueue and then Play, or SetAVTransportURI if it's a container?
                     // SetAVTransportURI with x-rincon-cpcontainer works for some, but Queue is safer for playlists.
                     // Let's try Queue approach for Playlists if regular SetAV fails? 
                     // Or just try the format:
                     sonosUri = `x-rincon-cpcontainer:1006206c${playlistId}?sid=9&flags=10860&sn=1`; // flags might need tuning
                     
                     // NOTE: Playlists on Sonos via UPnP are notoriously hard without a proper queue.
                     // Using device.PlayNotification might be easier for single tracks, but for playlists...
                     
                     // Alternative: x-sonos-spotify:spotify:playlist:...
                 } else if (uri.includes('track')) {
                     // Spotify Track
                     // Format: x-sonos-spotify:spotify%3atrack%3a{id}?sid=9&flags=8224&sn=1
                     const trackId = uri.split(':')[2];
                     sonosUri = `x-sonos-spotify:spotify%3atrack%3a${trackId}?sid=9&flags=8224&sn=1`;
                     if (!sonosMeta) {
                          sonosMeta = `<DIDL-Lite xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:upnp="urn:schemas-upnp-org:metadata-1-0/upnp/" xmlns:r="urn:schemas-rinconnetworks-com:metadata-1-0/" xmlns="urn:schemas-upnp-org:metadata-1-0/DIDL-Lite/"><item id="10032020spotify%3atrack%3a${trackId}" parentID="" restricted="true"><dc:title>Spotify Track</dc:title><upnp:class>object.item.audioItem.musicTrack</upnp:class><desc id="cdudn" nameSpace="urn:schemas-rinconnetworks-com:metadata-1-0/">SA_RINCON65535_</desc></item></DIDL-Lite>`;
                     }
                 }
            }

            console.log(`[Sonos] Setting URI: ${sonosUri}`);
            
            try {
                await device.AVTransportService.SetAVTransportURI({
                    InstanceID: 0,
                    CurrentURI: sonosUri,
                    CurrentURIMetaData: sonosMeta
                });
            } catch (e) {
                // Illegal MIME-Type often means the format is wrong for SetAVTransportURI.
                // It might need to be added to Queue first?
                if (e.message && e.message.includes('Illegal MIME-Type') && isSpotify && uri.includes('playlist')) {
                    console.warn('[Sonos] SetAVTransportURI failed for playlist, trying AddURIToQueue...');
                    // Add to Queue logic
                    // This library might have .addRegionToQueue or similar?
                    // Fallback to library helper if possible or simple queue add
                    await device.QueueService.AddURI({
                         InstanceID: 0,
                         EnqueuedURI: sonosUri,
                         EnqueuedURIMetaData: sonosMeta,
                         DesiredFirstTrackNumberEnqueued: 0,
                         EnqueueAsNext: true
                    });
                    // Then Skip to it? Or user must press play?
                    // Usually we just Play()
                } else {
                    throw e; // Rethrow other errors
                }
            }
        }
        return device.Play();
    }

    async pause(uuid) {
        const device = await this._getDevice(uuid);
        return device.Pause();
    }

    async next(uuid) {
        const device = await this._getDevice(uuid);
        return device.Next();
    }

    async previous(uuid) {
        const device = await this._getDevice(uuid);
        return device.Previous();
    }

    async setVolume(uuid, volume) {
        const device = await this._getDevice(uuid);
        // The volume is 0-100
        return device.RenderingControlService.SetVolume({
            InstanceID: 0,
            Channel: 'Master',
            DesiredVolume: volume
        });
    }
    
    async getPlaybackState(uuid) {
        const device = await this._getDevice(uuid);
        
        try {
            const transportState = await device.AVTransportService.GetTransportInfo({ InstanceID: 0 });
            const mediaInfo = await device.AVTransportService.GetMediaInfo({ InstanceID: 0 });
            const positionInfo = await device.AVTransportService.GetPositionInfo({ InstanceID: 0 });

            // The metadata is often an XML string that needs parsing.
            // For now, we'll return what the library gives us.
            const trackData = mediaInfo.CurrentURIMetaData || {};

            return {
                status: transportState.CurrentTransportState, // e.g., 'PLAYING', 'PAUSED_PLAYBACK', 'STOPPED'
                track: {
                    title: trackData.Title,
                    artist: trackData.Creator,
                    album: trackData.Album,
                    duration: positionInfo.TrackDuration,
                    uri: mediaInfo.CurrentURI,
                },
                position: positionInfo.RelTime,
            };
        } catch(e) {
            console.error(`Error getting playback state for Sonos device ${uuid}:`, e);
            return { status: 'UNKNOWN' };
        }
    }
}

// Create a singleton instance
const sonosManager = new SonosManagerModule();
module.exports = sonosManager;
