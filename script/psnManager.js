const {
    exchangeNpssoForAccessCode,
    exchangeAccessCodeForAuthTokens,
    exchangeRefreshTokenForAuthTokens,
    getUserTitles,
    makeUniversalSearch,
    getProfileFromUserName
} = require("psn-api");
const fs = require('fs');
const path = require('path');
const EventEmitter = require('events');

const CREDENTIALS_PATH = path.join(__dirname, '../psn-credentials.json');

class PSNManager extends EventEmitter {
    constructor() {
        super();
        this.authorization = null;
        this.npsso = null;
        this.loadCredentials();
    }

    loadCredentials() {
        if (fs.existsSync(CREDENTIALS_PATH)) {
            try {
                const data = JSON.parse(fs.readFileSync(CREDENTIALS_PATH, 'utf8'));
                this.npsso = data.npsso;
                this.authorization = data.authorization;
            } catch (e) {
                console.error('[PSN] Error loading credentials:', e);
            }
        }
    }

    saveCredentials() {
        try {
            fs.writeFileSync(CREDENTIALS_PATH, JSON.stringify({
                npsso: this.npsso,
                authorization: this.authorization
            }, null, 2));
        } catch (e) {
            console.error('[PSN] Error saving credentials:', e);
        }
    }

    async authenticate(npsso) {
        try {
            this.npsso = npsso;
            const accessCode = await exchangeNpssoForAccessCode(npsso);
            this.authorization = await exchangeAccessCodeForAuthTokens(accessCode);
            this.saveCredentials();
            console.log('[PSN] Authenticated successfully');
            return { success: true };
        } catch (e) {
            console.error('[PSN] Authentication error:', e);
            return { success: false, error: e.message };
        }
    }

    async refreshToken() {
        if (!this.authorization || !this.authorization.refreshToken) {
            throw new Error('No refresh token available');
        }
        try {
            this.authorization = await exchangeRefreshTokenForAuthTokens(this.authorization.refreshToken);
            this.saveCredentials();
            console.log('[PSN] Token refreshed');
        } catch (e) {
            console.error('[PSN] Token refresh error:', e);
            throw e;
        }
    }

    async ensureAuth() {
        if (!this.authorization) {
            if (this.npsso) {
                return this.authenticate(this.npsso);
            }
            throw new Error('Not authenticated');
        }
        
        // Check if token is expired (approximate check, usually 1 hour)
        // For simplicity, we'll just try and if it fails with 401, we refresh.
        // Or we can just refresh if we suspect it's old.
        // Better: try to refresh if it's been a while.
        // For now, let's just rely on error handling in methods.
    }

    async getGameLibrary(limit = 20) {
        try {
            await this.ensureAuth();
            
            // We need to get the user's accountId first.
            // "me" works for getUserTitles
            const response = await getUserTitles(
                { accessToken: this.authorization.accessToken },
                "me",
                { limit }
            );

            return response.titleTrophyGroups.map(t => ({
                name: t.trophyTitleName,
                platform: t.trophyTitlePlatform,
                titleId: t.npCommunicationId,
                imageUrl: t.trophyTitleIconUrl,
                lastPlayed: t.lastUpdatedDateTime
            }));

        } catch (e) {
            if (e.message && e.message.includes('401')) {
                console.log('[PSN] Token expired, refreshing...');
                await this.refreshToken();
                return this.getGameLibrary(limit);
            }
            console.error('[PSN] Get library error:', e);
            throw e;
        }
    }
}

const psnManager = new PSNManager();
module.exports = psnManager;
