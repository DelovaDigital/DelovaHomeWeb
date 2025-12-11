const express = require('express');
const app = express();
const port = process.env.PORT || 3000;

/**
 * Spotify Cloud Redirect Server
 * 
 * This server acts as a bridge between Spotify's OAuth and your local OmniHome instance.
 * 
 * Deployment Instructions:
 * 1. Host this script on a public server (e.g., Vercel, Heroku, DigitalOcean, or a VPS).
 * 2. Set the environment variable PORT if needed (defaults to 3000).
 * 3. In your Spotify Developer Dashboard, set the Redirect URI to:
 *    https://<your-public-domain>/callback
 * 4. In your local OmniHome .env file, set:
 *    SPOTIFY_REDIRECT_URI=https://<your-public-domain>/callback
 */

app.get('/', (req, res) => {
    res.send('Delove Home Spotify Redirect Server is running.');
});

app.get('/callback', (req, res) => {
    const { code, state, error } = req.query;

    if (error) {
        return res.status(400).send(`Spotify Auth Error: ${error}`);
    }

    if (!code || !state) {
        return res.status(400).send('Missing code or state parameter.');
    }

    try {
        // Decode the state parameter to find the local instance URL
        const stateJson = Buffer.from(state, 'base64').toString('utf8');
        const stateObj = JSON.parse(stateJson);
        
        const localBaseUrl = stateObj.localBaseUrl;

        if (!localBaseUrl) {
            console.error('No localBaseUrl found in state:', stateObj);
            return res.status(400).send('Invalid state: No local instance URL found. Cannot redirect.');
        }

        // Construct the local callback URL
        // We pass the code and state back to the local instance
        const localCallbackUrl = `${localBaseUrl}/api/spotify/callback?code=${code}&state=${state}`;

        console.log(`Redirecting to local instance: ${localCallbackUrl}`);
        res.redirect(localCallbackUrl);

    } catch (e) {
        console.error('Error processing callback:', e);
        res.status(500).send('Internal Server Error processing callback.');
    }
});

app.listen(port, () => {
    console.log(`Redirect server listening on port ${port}`);
});
