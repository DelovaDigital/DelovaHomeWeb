# DelovaHome Raspberry Pi Setup Guide

## 1. Prerequisites
Ensure your Raspberry Pi is set up with Raspberry Pi OS.

Install Node.js (v18 or newer recommended) and Git:
```bash
sudo apt update
sudo apt install -y git
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt install -y nodejs
```

## 2. Clone the Repository
You must clone the repository for the update system to work.
```bash
cd /home/pi
git clone https://github.com/DelovaDigital/OmniHome.git DelovaHome
cd DelovaHome/web
```
*Note: You may need to set up an SSH key or use a Personal Access Token if the repo is private.*

## 3. Install Dependencies
```bash
npm install
```

## 4. Generate SSL Certificates (Required for Spotify/HTTPS)
```bash
openssl req -nodes -new -x509 -keyout server.key -out server.cert -days 365 -subj "/CN=delovahome.local"
```

## 5. Setup Auto-Start (PM2)
We use PM2 to keep the server running and automatically restart it after updates.

```bash
sudo npm install -g pm2
pm2 start server.js --name "delovahome" -- --openssl-legacy-provider
pm2 save
pm2 startup
```
*Follow the command output from `pm2 startup` to enable boot on startup.*

## 6. Updating
You can now update the system directly from the web interface (Settings -> Check for updates).
When you release a new version on GitHub (push to main), the Pi will detect it.
