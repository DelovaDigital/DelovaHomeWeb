#!/bin/bash
set -e

# --- Configuration ---
# If your repo is private, you can embed a token here OR enter it when prompted
# Format: https://<token>@github.com/username/repo.git
REPO_URL="https://github.com/DelovaDigital/OmniHome.git"
INSTALL_DIR="/home/pi/DelovaHome"
NODE_VERSION="18.x"

echo "========================================="
echo "   DelovaHome Automated Installer"
echo "========================================="

# 1. System Updates
echo "[1/6] Updating system packages..."
sudo apt-get update
# sudo apt-get upgrade -y # Uncomment to force full OS upgrade (takes longer)
sudo apt-get install -y git build-essential curl avahi-daemon

# 2. Install Node.js
echo "[2/6] Installing Node.js ${NODE_VERSION}..."
if ! command -v node &> /dev/null; then
    curl -fsSL https://deb.nodesource.com/setup_${NODE_VERSION} | sudo -E bash -
    sudo apt-get install -y nodejs
else
    echo "Node.js is already installed."
fi

# 3. Clone Repository
echo "[3/6] Setting up DelovaHome source code..."
if [ -d "$INSTALL_DIR" ]; then
    echo "Directory exists. Pulling latest changes..."
    cd "$INSTALL_DIR"
    git pull
else
    echo "Cloning repository..."
    # Try cloning. If it fails (e.g. private repo), prompt user.
    if ! git clone "$REPO_URL" "$INSTALL_DIR"; then
        echo "Error: Clone failed. If this is a private repo, please ensure you have access."
        echo "You may need to edit this script to include a Personal Access Token in the URL."
        exit 1
    fi
fi

# 4. Install Dependencies
echo "[4/6] Installing project dependencies..."
cd "$INSTALL_DIR/web"
npm install

# 5. SSL Certificates (Required for Spotify/HTTPS)
echo "[5/6] Configuring SSL..."
if [ ! -f server.key ]; then
    echo "Generating self-signed certificate..."
    openssl req -nodes -new -x509 -keyout server.key -out server.cert -days 3650 -subj "/CN=delovahome.local"
else
    echo "SSL certificates already exist."
fi

# 5b. Environment Configuration
if [ ! -f .env ]; then
    echo "Creating default .env file..."
    echo "PORT=3000" > .env
    # echo "DB_USER=..." >> .env
    # echo "DB_PASS=..." >> .env
    # echo "DB_SERVER=..." >> .env
fi

# 6. Setup PM2 (Process Manager)
echo "[6/6] Configuring auto-start with PM2..."
sudo npm install -g pm2

# Stop existing if running
pm2 delete delovahome 2>/dev/null || true

# Start the app
pm2 start server.js --name "delovahome" -- --openssl-legacy-provider

# Freeze process list for reboot
pm2 save

# Setup startup hook (this command detects the OS and runs the appropriate startup command)
# We capture the output command and execute it
STARTUP_CMD=$(pm2 startup | grep "sudo env")
if [ -n "$STARTUP_CMD" ]; then
    echo "Executing startup hook: $STARTUP_CMD"
    eval "$STARTUP_CMD"
fi

echo "========================================="
echo "   Installation Complete!"
echo "   DelovaHome is running at https://$(hostname -I | awk '{print $1}'):3000"
echo "========================================="
