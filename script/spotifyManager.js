const fs = require('fs');
const path = require('path');

class SpotifyManager {
    constructor() {
        this.clientId = process.env.SPOTIFY_CLIENT_ID;
        this.clientSecret = process.env.SPOTIFY_CLIENT_SECRET;
        this.redirectUri = process.env.SPOTIFY_REDIRECT_URI || 'http://localhost:3000/api/spotify/callback';
        this.scopes = [
            'user-read-playback-state',
            'user-modify-playback-state',
            'user-read-currently-playing',
            'user-read-playback-position',
            'user-library-read',
            'playlist-read-private',
            'playlist-read-collaborative'
        ];
        this.credentialsPath = path.join(__dirname, '../spotify-credentials.json');
        this.accessToken = null;
        this.refreshToken = null;
        this.tokenExpiration = 0;

        this.loadCredentials();
    }

    loadCredentials() {
        if (fs.existsSync(this.credentialsPath)) {
            try {
                const creds = JSON.parse(fs.readFileSync(this.credentialsPath));
                this.accessToken = creds.accessToken;
                this.refreshToken = creds.refreshToken;
                this.tokenExpiration = creds.tokenExpiration;
            } catch (e) {
                console.error('Error loading Spotify credentials:', e);
            }
        }
    }

    saveCredentials() {
        const creds = {
            accessToken: this.accessToken,
            refreshToken: this.refreshToken,
            tokenExpiration: this.tokenExpiration
        };
        fs.writeFileSync(this.credentialsPath, JSON.stringify(creds, null, 2));
    }

    getAuthUrl() {
        if (!this.clientId) return null;
        const params = new URLSearchParams({
            response_type: 'code',
            client_id: this.clientId,
            scope: this.scopes.join(' '),
            redirect_uri: this.redirectUri
        });
        return `https://accounts.spotify.com/authorize?${params.toString()}`;
    }

    async handleCallback(code) {
        const params = new URLSearchParams({
            grant_type: 'authorization_code',
            code: code,
            redirect_uri: this.redirectUri
        });

        const response = await fetch('https://accounts.spotify.com/api/token', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Authorization': 'Basic ' + Buffer.from(this.clientId + ':' + this.clientSecret).toString('base64')
            },
            body: params
        });

        const data = await response.json();
        if (data.access_token) {
            this.accessToken = data.access_token;
            this.refreshToken = data.refresh_token;
            this.tokenExpiration = Date.now() + (data.expires_in * 1000);
            this.saveCredentials();
            return true;
        }
        return false;
    }

    async refreshAccessToken() {
        if (!this.refreshToken) return false;

        const params = new URLSearchParams({
            grant_type: 'refresh_token',
            refresh_token: this.refreshToken
        });

        try {
            const response = await fetch('https://accounts.spotify.com/api/token', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'Authorization': 'Basic ' + Buffer.from(this.clientId + ':' + this.clientSecret).toString('base64')
                },
                body: params
            });

            const data = await response.json();
            if (data.access_token) {
                this.accessToken = data.access_token;
                if (data.refresh_token) this.refreshToken = data.refresh_token;
                this.tokenExpiration = Date.now() + (data.expires_in * 1000);
                this.saveCredentials();
                return true;
            }
        } catch (e) {
            console.error('Error refreshing Spotify token:', e);
        }
        return false;
    }

    async getHeaders() {
        if (!this.accessToken) return null;
        if (Date.now() > this.tokenExpiration - 60000) {
            await this.refreshAccessToken();
        }
        return {
            'Authorization': `Bearer ${this.accessToken}`
        };
    }

    async getPlaybackState() {
        const headers = await this.getHeaders();
        if (!headers) return null;

        try {
            const response = await fetch('https://api.spotify.com/v1/me/player', { headers });
            if (response.status === 204) return { is_playing: false }; // No content
            if (response.status !== 200) return null;
            return await response.json();
        } catch (e) {
            console.error('Error fetching Spotify state:', e);
            return null;
        }
    }

    async play() {
        const headers = await this.getHeaders();
        if (!headers) return;
        await fetch('https://api.spotify.com/v1/me/player/play', { method: 'PUT', headers });
    }

    async pause() {
        const headers = await this.getHeaders();
        if (!headers) return;
        await fetch('https://api.spotify.com/v1/me/player/pause', { method: 'PUT', headers });
    }

    async next() {
        const headers = await this.getHeaders();
        if (!headers) return;
        await fetch('https://api.spotify.com/v1/me/player/next', { method: 'POST', headers });
    }

    async previous() {
        const headers = await this.getHeaders();
        if (!headers) return;
        await fetch('https://api.spotify.com/v1/me/player/previous', { method: 'POST', headers });
    }

    async setVolume(volume) {
        const headers = await this.getHeaders();
        if (!headers) return;
        await fetch(`https://api.spotify.com/v1/me/player/volume?volume_percent=${volume}`, { method: 'PUT', headers });
    }

    async getDevices() {
        const headers = await this.getHeaders();
        if (!headers) return [];
        try {
            const response = await fetch('https://api.spotify.com/v1/me/player/devices', { headers });
            const data = await response.json();
            return data.devices || [];
        } catch (e) {
            console.error('Error fetching Spotify devices:', e);
            return [];
        }
    }

    async transferPlayback(deviceId) {
        const headers = await this.getHeaders();
        if (!headers) return;
        await fetch('https://api.spotify.com/v1/me/player', {
            method: 'PUT',
            headers: { ...headers, 'Content-Type': 'application/json' },
            body: JSON.stringify({ device_ids: [deviceId], play: true })
        });
    }

    async getUserPlaylists() {
        const headers = await this.getHeaders();
        if (!headers) return [];
        try {
            const response = await fetch('https://api.spotify.com/v1/me/playlists?limit=20', { headers });
            const data = await response.json();
            return data.items || [];
        } catch (e) {
            console.error('Error fetching playlists:', e);
            return [];
        }
    }

    async getUserAlbums() {
        const headers = await this.getHeaders();
        if (!headers) return [];
        try {
            const response = await fetch('https://api.spotify.com/v1/me/albums?limit=20', { headers });
            const data = await response.json();
            return data.items ? data.items.map(i => i.album) : [];
        } catch (e) {
            console.error('Error fetching albums:', e);
            return [];
        }
    }

    async playContext(contextUri) {
        const headers = await this.getHeaders();
        if (!headers) return;
        await fetch('https://api.spotify.com/v1/me/player/play', {
            method: 'PUT',
            headers: { ...headers, 'Content-Type': 'application/json' },
            body: JSON.stringify({ context_uri: contextUri })
        });
    }

    async playUris(uris) {
        const headers = await this.getHeaders();
        if (!headers) return;
        try {
            await fetch('https://api.spotify.com/v1/me/player/play', {
                method: 'PUT',
                headers: { ...headers, 'Content-Type': 'application/json' },
                body: JSON.stringify({ uris: uris })
            });
        } catch (e) {
            console.error('Error playing URIs:', e);
        }
    }

    async search(q) {
        const headers = await this.getHeaders();
        if (!headers) return { tracks: [], artists: [] };
        try {
            const params = new URLSearchParams({ q: q, type: 'track,artist', limit: '20' });
            const response = await fetch(`https://api.spotify.com/v1/search?${params.toString()}`, { headers });
            if (response.status !== 200) return { tracks: [], artists: [] };
            const data = await response.json();
            return {
                tracks: data.tracks ? data.tracks.items : [],
                artists: data.artists ? data.artists.items : []
            };
        } catch (e) {
            console.error('Error searching Spotify:', e);
            return { tracks: [], artists: [] };
        }
    }
}

module.exports = new SpotifyManager();
