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
            console.warn('Sonos manager not yet fully initialized. Returning devices found so far.');
        }
        // Safely access devices without throwing if empty
        try {
            // The library throws "No Devices available!" if accessing .Devices when empty.
            return (this.manager.Devices || []).map(d => ({ uuid: d.uuid, name: d.Name }));
        } catch (e) {
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
                     
                     // Metadata IS required for containers.
                     // The <desc> tag often causes UPnP Error 402 if the Account ID (SA_RINCON...) doesn't match the actual account.
                     // It is safer to OMIT <desc> when we don't know the exact account ID.
                     if (!sonosMeta) {
                         sonosMeta = `<DIDL-Lite xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:upnp="urn:schemas-upnp-org:metadata-1-0/upnp/" xmlns:r="urn:schemas-rinconnetworks-com:metadata-1-0/" xmlns="urn:schemas-upnp-org:metadata-1-0/DIDL-Lite/"><item id="1006206c${playlistId}" parentID="1006206c" restricted="true"><dc:title>Spotify Playlist</dc:title><upnp:class>object.container.playlistContainer</upnp:class></item></DIDL-Lite>`;
                     }
                     
                     // Try to URLEncode the playlist ID properly just in case
                     const encodedId = encodeURIComponent(playlistId);
                     sonosUri = `x-rincon-cpcontainer:1006206c${encodedId}?sid=9&flags=10860&sn=1`;
                     
                     // Force Queue path immediately for playlists
                     console.log(`[Sonos] Spotify Playlist detected. Using Queue-based playback directly. URI: ${sonosUri}`);
                     
                     try { await device.QueueService.RemoveAllTracks({ InstanceID: 0 }); } catch (ignored) {}

                     await device.QueueService.AddURI({
                         InstanceID: 0,
                         EnqueuedURI: sonosUri,
                         EnqueuedURIMetaData: sonosMeta,
                         DesiredFirstTrackNumberEnqueued: 0,
                         EnqueueAsNext: true
                     });

                     const queueUri = `x-rincon-queue:${device.uuid}#0`;
                     await device.AVTransportService.SetAVTransportURI({
                        InstanceID: 0,
                        CurrentURI: queueUri,
                        CurrentURIMetaData: ''
                     });
                     
                     // Skip the standard SetAVTransportURI below
                     return device.Play();

                 } else if (uri.includes('track')) {

                     // Spotify Track
                     // Format: x-sonos-spotify:spotify%3atrack%3a{id}?sid=9&flags=8224&sn=1
                     const trackId = uri.split(':')[2];
                     const encodedTrackId = encodeURIComponent(trackId);
                     sonosUri = `x-sonos-spotify:spotify%3atrack%3a${encodedTrackId}?sid=9&flags=8224&sn=1`;
                     
                     if (!sonosMeta) {
                          sonosMeta = `<DIDL-Lite xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:upnp="urn:schemas-upnp-org:metadata-1-0/upnp/" xmlns:r="urn:schemas-rinconnetworks-com:metadata-1-0/" xmlns="urn:schemas-upnp-org:metadata-1-0/DIDL-Lite/"><item id="10032020spotify%3atrack%3a${encodedTrackId}" parentID="" restricted="true"><dc:title>Spotify Track</dc:title><upnp:class>object.item.audioItem.musicTrack</upnp:class></item></DIDL-Lite>`;
                     }
                 }
            }

            console.log(`[Sonos] Setting URI: ${sonosUri}`);

            // Only proceed to SetAVTransportURI if we haven't already returned (i.e. not a Playlist which is handled above)
            try {
                await device.AVTransportService.SetAVTransportURI({
                    InstanceID: 0,
                    CurrentURI: sonosUri,
                    CurrentURIMetaData: sonosMeta
                });
            } catch (e) {
                // Illegal MIME-Type (714) or Invalid Args (402) often means the format is wrong for SetAVTransportURI (direct play).
                // It usually implies this container type must be added to Queue first.
                // NOTE: We now handle playlists explicitly above, but keep this for other cases or tracks if they fail.
                const isPlaybackError = e.message && (
                    e.message.includes('Illegal MIME-Type') || 
                    e.message.includes('Invalid args') ||
                    (e.UpnpErrorCode === 714) || 
                    (e.UpnpErrorCode === 402)
                );

                if (isPlaybackError && isSpotify && uri.includes('playlist')) {
                    console.warn('[Sonos] SetAVTransportURI failed for playlist, switching to Queue-based playback...');
                    
                    // 1. Clear Queue (optional, but ensures we play what user asked)
                    try { await device.QueueService.RemoveAllTracks({ InstanceID: 0 }); } catch (ignored) {}

                    // 2. Add to Queue
                    // Note: EnqueueAsNext might not be supported on all endpoints, but usually works with AddURI
                    await device.QueueService.AddURI({
                         InstanceID: 0,
                         EnqueuedURI: sonosUri,
                         EnqueuedURIMetaData: sonosMeta,
                         DesiredFirstTrackNumberEnqueued: 0,
                         EnqueueAsNext: true
                    });

                    // 3. Set Transport to Queue
                    // We need the RINCON_ ID for this. device.uuid usually starts with RINCON_ or contains it.
                    // If device.uuid is "RINCON_xxxx" -> x-rincon-queue:RINCON_xxxx#0
                    // If uuid is just standard UUID, we might need device.raw.udn or similar?
                    // The library usually maps uuid to the RINCON_ id for us somewhere?
                    // Let's assume device.uuid is sufficient or try to construct it.
                    let queueUri = `x-rincon-queue:${device.uuid}#0`;
                    // If uuid doesn't start with RINCON, checks might be needed. 
                    // Most Sonos UUIDs in this lib show as "RINCON_..." or typical UUIDs.
                    // If it is a proper UUID (blocks), the queue URI might be x-rincon-queue:RINCON_{mac}01400#0
                    // But often device.uuid IS that ID in this lib.
                    
                    await device.AVTransportService.SetAVTransportURI({
                        InstanceID: 0,
                        CurrentURI: queueUri,
                        CurrentURIMetaData: ''
                    });

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
