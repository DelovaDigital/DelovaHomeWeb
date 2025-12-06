function escapeXml(unsafe) {
    if (!unsafe) return '';
    return unsafe.replace(/[<>&'\"]/g, function (c) {
        switch (c) {
            case '<': return '&lt;';
            case '>': return '&gt;';
            case '&': return '&amp;';
            case '\'': return '&apos;';
            case '"': return '&quot;';
        }
    });
}

function createDidlLiteForSpotifyTrack(track) {
    // track: object from Spotify API /v1/tracks
    if (!track) return '';
    const id = track.id || '';
    const title = escapeXml(track.name || '');
    const artist = escapeXml((track.artists && track.artists[0] && track.artists[0].name) || '');
    const album = escapeXml((track.album && track.album.name) || '');
    const albumArt = (track.album && track.album.images && track.album.images[0]) ? track.album.images[0].url : '';

    // Minimal DIDL-Lite with item metadata. Sonos may or may not accept Spotify URIs directly,
    // but providing DIDL-Lite improves chances and gives UI information (title, album art).
    const didl = `<?xml version="1.0" encoding="UTF-8"?>\n<DIDL-Lite xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:upnp="urn:schemas-upnp-org:metadata-1-0/upnp/" xmlns:r="urn:schemas-rinconnetworks-com:metadata-1-0/">\n` +
        `<item id="${escapeXml('spotify-' + id)}" parentID="0" restricted="true">\n` +
        `<dc:title>${title}</dc:title>\n` +
        `<upnp:class>object.item.audioItem.musicTrack</upnp:class>\n` +
        `<dc:creator>${artist}</dc:creator>\n` +
        `<upnp:album>${album}</upnp:album>\n` +
        (albumArt ? `<upnp:albumArtURI>${escapeXml(albumArt)}</upnp:albumArtURI>\n` : '') +
        // CurrentURI for Sonos; often Sonos needs special protocolInfo but many devices accept spotify: URIs when metadata is provided
        `<res protocolInfo="*:*:*:*">${escapeXml('spotify:track:' + id)}</res>\n` +
        `</item>\n</DIDL-Lite>`;

    return didl;
}

module.exports = { createDidlLiteForSpotifyTrack };
