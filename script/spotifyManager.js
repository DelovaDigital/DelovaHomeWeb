const fetch = global.fetch || require('node-fetch');
const db = require('./db'); // Import the database module

class SpotifyManager {
    constructor() {
        this.clientId = process.env.SPOTIFY_CLIENT_ID;
        this.clientSecret = process.env.SPOTIFY_CLIENT_SECRET;
        this.redirectUri = process.env.SPOTIFY_REDIRECT_URI || 'https://localhost:3000/api/spotify/callback';
        this.scopes = [
            'user-read-playback-state',
            'user-modify-playback-state',
            'user-read-currently-playing',
            'user-read-playback-position',
            'user-library-read',
            'playlist-read-private',
            'playlist-read-collaborative'
        ];
    }

    getAuthUrl(userId) {
        if (!this.clientId) return null;
        // Use the 'state' parameter to pass the userId back to the callback for security
        const state = Buffer.from(JSON.stringify({ userId })).toString('base64');
        const params = new URLSearchParams({
            response_type: 'code',
            client_id: this.clientId,
            scope: this.scopes.join(' '),
            redirect_uri: this.redirectUri,
            state: state
        });
        return `https://accounts.spotify.com/authorize?${params.toString()}`;
    }

    async handleCallback(code, state) {
        let userId;
        try {
            userId = JSON.parse(Buffer.from(state, 'base64').toString('utf8')).userId;
        } catch (e) {
            console.error('Invalid state received from Spotify callback:', e);
            return false;
        }

        if (!userId) {
            console.error('No userId found in Spotify callback state');
            return false;
        }
        
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
            const tokenExpiration = Date.now() + (data.expires_in * 1000);
            
            try {
                const pool = await db.getPool();
                await pool.request()
                    .input('userId', db.sql.Int, userId)
                    .input('accessToken', db.sql.NVarChar(512), data.access_token)
                    .input('refreshToken', db.sql.NVarChar(512), data.refresh_token)
                    .input('tokenExpiration', db.sql.BigInt, tokenExpiration)
                    .query(`UPDATE Users SET 
                                SpotifyAccessToken = @accessToken, 
                                SpotifyRefreshToken = @refreshToken, 
                                SpotifyTokenExpiration = @tokenExpiration
                            WHERE Id = @userId`);
                return true;
            } catch (dbError) {
                console.error('Failed to save Spotify tokens to database:', dbError);
                return false;
            }
        }
        console.error('Spotify token exchange failed:', data);
        return false;
    }

    async refreshAccessToken(userId, refreshToken) {
        if (!refreshToken) return null;

        const params = new URLSearchParams({
            grant_type: 'refresh_token',
            refresh_token: refreshToken
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
                const newAccessToken = data.access_token;
                const newRefreshToken = data.refresh_token || refreshToken;
                const newExpiration = Date.now() + (data.expires_in * 1000);

                const pool = await db.getPool();
                await pool.request()
                    .input('userId', db.sql.Int, userId)
                    .input('accessToken', db.sql.NVarChar(512), newAccessToken)
                    .input('refreshToken', db.sql.NVarChar(512), newRefreshToken)
                    .input('tokenExpiration', db.sql.BigInt, newExpiration)
                    .query(`UPDATE Users SET 
                                SpotifyAccessToken = @accessToken, 
                                SpotifyRefreshToken = @refreshToken, 
                                SpotifyTokenExpiration = @tokenExpiration
                            WHERE Id = @userId`);
                
                return { accessToken: newAccessToken };
            }
            console.error(`Failed to refresh Spotify token for user ${userId}:`, data);
        } catch (e) {
            console.error(`Error refreshing Spotify token for user ${userId}:`, e);
        }
        return null;
    }

    async getHeaders(userId) {
        if (!userId) return null;

        const pool = await db.getPool();
        const result = await pool.request()
            .input('userId', db.sql.Int, userId)
            .query('SELECT SpotifyAccessToken, SpotifyRefreshToken, SpotifyTokenExpiration FROM Users WHERE Id = @userId');
        
        let user = result.recordset[0];
        if (!user || !user.SpotifyAccessToken) {
            return null; // User has not linked their Spotify account
        }

        if (Date.now() > user.SpotifyTokenExpiration - 60000) {
            const newTokens = await this.refreshAccessToken(userId, user.SpotifyRefreshToken);
            if (!newTokens) return null;
            user.SpotifyAccessToken = newTokens.accessToken;
        }

        return { 'Authorization': `Bearer ${user.SpotifyAccessToken}` };
    }

    async getPlaybackState(userId) {
        const headers = await this.getHeaders(userId);
        if (!headers) return null;
        try {
            const response = await fetch('https://api.spotify.com/v1/me/player', { headers });
            if (response.status === 204) return { is_playing: false };
            if (!response.ok) return null;
            return await response.json();
        } catch (e) {
            console.error('Error fetching Spotify state:', e);
            return null;
        }
    }

    async play(userId, uris) {
        const headers = await this.getHeaders(userId);
        if (!headers) throw new Error('No valid Spotify token for user');
        const body = uris ? JSON.stringify({ uris }) : undefined;
        const resp = await fetch('https://api.spotify.com/v1/me/player/play', { 
            method: 'PUT', 
            headers: { ...headers, 'Content-Type': 'application/json' },
            body
        });
        if (!resp.ok) {
            if (resp.status === 404) {
                const error = await resp.json().catch(() => ({}));
                if (error.error && error.error.reason === 'NO_ACTIVE_DEVICE') {
                    throw new Error('No active Spotify device found. Please start playing on a device first.');
                }
            }
            throw new Error(`Spotify play failed: ${resp.status}`);
        }
    }

    async pause(userId) {
        const headers = await this.getHeaders(userId);
        if (!headers) throw new Error('No valid Spotify token for user');
        const resp = await fetch('https://api.spotify.com/v1/me/player/pause', { method: 'PUT', headers });
        if (!resp.ok) throw new Error(`Spotify pause failed: ${resp.status}`);
    }

    async next(userId) {
        const headers = await this.getHeaders(userId);
        if (!headers) throw new Error('No valid Spotify token for user');
        const resp = await fetch('https://api.spotify.com/v1/me/player/next', { method: 'POST', headers });
        if (!resp.ok) throw new Error(`Spotify next failed: ${resp.status}`);
    }

    async previous(userId) {
        const headers = await this.getHeaders(userId);
        if (!headers) throw new Error('No valid Spotify token for user');
        const resp = await fetch('https://api.spotify.com/v1/me/player/previous', { method: 'POST', headers });
        if (!resp.ok) throw new Error(`Spotify previous failed: ${resp.status}`);
    }

    async setVolume(userId, volume) {
        const headers = await this.getHeaders(userId);
        if (!headers) throw new Error('No valid Spotify token for user');
        const url = `https://api.spotify.com/v1/me/player/volume?volume_percent=${parseInt(volume, 10)}`;
        const resp = await fetch(url, { method: 'PUT', headers });
        if (!resp.ok) throw new Error(`Spotify setVolume failed: ${resp.status}`);
    }

    async getDevices(userId) {
        const headers = await this.getHeaders(userId);
        if (!headers) return [];
        try {
            const response = await fetch('https://api.spotify.com/v1/me/player/devices', { headers });
            if (!response.ok) return [];
            const data = await response.json();
            return data.devices || [];
        } catch (e) {
            return [];
        }
    }

    async transferPlayback(userId, deviceId) {
        const headers = await this.getHeaders(userId);
        if (!headers) throw new Error('No valid Spotify token for user');

        // Accept either a string deviceId or an object { deviceId, uris }
        let targetId = deviceId;
        let uris = null;
        if (typeof deviceId === 'object' && deviceId !== null) {
            targetId = deviceId.deviceId || deviceId.id;
            uris = deviceId.uris || null;
        }

        // First try a normal transfer with play:true
        let resp = await fetch('https://api.spotify.com/v1/me/player', {
            method: 'PUT',
            headers: { ...headers, 'Content-Type': 'application/json' },
            body: JSON.stringify({ device_ids: [targetId], play: true })
        });

        if (resp.ok) return;

        // If transfer failed, attempt to fetch current playback and explicitly start playback on the target device
        try {
            const state = await this.getPlaybackState(userId);
            let playBody = null;
            if (uris && Array.isArray(uris) && uris.length > 0) {
                playBody = { uris };
            } else if (state && state.item && state.item.uri) {
                // Try to continue playing the currently playing track
                playBody = { uris: [state.item.uri] };
            } else if (state && state.context && state.context.uri) {
                playBody = { context_uri: state.context.uri };
            }

            if (playBody) {
                // Use the play endpoint with the device_id query param to target the device
                const playUrl = `https://api.spotify.com/v1/me/player/play?device_id=${encodeURIComponent(targetId)}`;
                const playResp = await fetch(playUrl, {
                    method: 'PUT',
                    headers: { ...headers, 'Content-Type': 'application/json' },
                    body: JSON.stringify(playBody)
                });
                if (playResp.ok) return;
            }

            // As a last resort, try transferring again without play flag
            resp = await fetch('https://api.spotify.com/v1/me/player', {
                method: 'PUT',
                headers: { ...headers, 'Content-Type': 'application/json' },
                body: JSON.stringify({ device_ids: [targetId] })
            });
            if (resp.ok) return;

        } catch (e) {
            console.error('Error attempting fallback playback on transfer:', e);
        }

        // If we reach here, all attempts failed
        throw new Error(`Spotify transferPlayback failed: ${resp.status}`);
    }

    async getUserPlaylists(userId) {
        const headers = await this.getHeaders(userId);
        if (!headers) return [];
        try {
            const response = await fetch('https://api.spotify.com/v1/me/playlists?limit=20', { headers });
            if (!response.ok) return [];
            const data = await response.json();
            return data.items || [];
        } catch (e) {
            return [];
        }
    }

    async getTrack(userId, trackId) {
        const headers = await this.getHeaders(userId);
        if (!headers) return null;
        try {
            const url = `https://api.spotify.com/v1/tracks/${encodeURIComponent(trackId)}`;
            const resp = await fetch(url, { headers });
            if (!resp.ok) return null;
            return await resp.json();
        } catch (e) {
            console.error(`Error fetching track ${trackId}:`, e);
            return null;
        }
    }

    async getUserAlbums(userId) {
        const headers = await this.getHeaders(userId);
        if (!headers) return [];
        try {
            const response = await fetch('https://api.spotify.com/v1/me/albums?limit=20', { headers });
            if (!response.ok) return [];
            const data = await response.json();
            return data.items ? data.items.map(i => i.album) : [];
        } catch (e) {
            return [];
        }
    }

    async playContext(userId, contextUri) {
        const headers = await this.getHeaders(userId);
        if (!headers) throw new Error('No valid Spotify token for user');
        const resp = await fetch('https://api.spotify.com/v1/me/player/play', {
            method: 'PUT',
            headers: { ...headers, 'Content-Type': 'application/json' },
            body: JSON.stringify({ context_uri: contextUri })
        });
        if (!resp.ok) {
            if (resp.status === 404) {
                const error = await resp.json().catch(() => ({}));
                if (error.error && error.error.reason === 'NO_ACTIVE_DEVICE') {
                    throw new Error('No active Spotify device found. Please start playing on a device first.');
                }
            }
            throw new Error(`Spotify playContext failed: ${resp.status}`);
        }
    }

    async playUris(userId, uris) {
        const headers = await this.getHeaders(userId);
        if (!headers) throw new Error('No valid Spotify token for user');
        const resp = await fetch('https://api.spotify.com/v1/me/player/play', {
            method: 'PUT',
            headers: { ...headers, 'Content-Type': 'application/json' },
            body: JSON.stringify({ uris: uris })
        });
        if (!resp.ok) {
            if (resp.status === 404) {
                const error = await resp.json().catch(() => ({}));
                if (error.error && error.error.reason === 'NO_ACTIVE_DEVICE') {
                    throw new Error('No active Spotify device found. Please start playing on a device first.');
                }
            }
            throw new Error(`Spotify playUris failed: ${resp.status}`);
        }
    }

    async search(userId, q) {
        const headers = await this.getHeaders(userId);
        if (!headers) return { tracks: [], artists: [] };
        try {
            const params = new URLSearchParams({ q: q, type: 'track,artist', limit: '20' });
            const response = await fetch(`https://api.spotify.com/v1/search?${params.toString()}`, { headers });
            if (!response.ok) return { tracks: [], artists: [] };
            const data = await response.json();
            return {
                tracks: data.tracks ? data.tracks.items : [],
                artists: data.artists ? data.artists.items : []
            };
        } catch (e) {
            return { tracks: [], artists: [] };
        }
    }
}

module.exports = new SpotifyManager();
