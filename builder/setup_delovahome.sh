#!/bin/bash
set -e

# --- Configuration ---
REPO_URL="https://github.com/DelovaDigital/DelovaHomeWeb.git"
INSTALL_DIR="/home/pi/DelovaHome"
NODE_VERSION="20.x"
NEW_HOSTNAME="delovahome"

echo "========================================="
echo "   DelovaHome Automated Installer"
echo "========================================="

# 0. Set Hostname
echo "[0/6] Checking hostname..."
CURRENT_HOSTNAME=$(cat /etc/hostname | tr -d " \t\n\r")
if [ "$CURRENT_HOSTNAME" != "$NEW_HOSTNAME" ]; then
    echo "Changing hostname from '$CURRENT_HOSTNAME' to '$NEW_HOSTNAME'..."
    echo "$NEW_HOSTNAME" | sudo tee /etc/hostname
    sudo sed -i "s/127.0.1.1.*$CURRENT_HOSTNAME/127.0.1.1\t$NEW_HOSTNAME/g" /etc/hosts
    sudo hostnamectl set-hostname "$NEW_HOSTNAME"
    echo "Hostname updated. Please reboot after installation."
else
    echo "Hostname is already set to '$NEW_HOSTNAME'."
fi

# 1. System Updates
echo "[1/6] Updating system packages..."
sudo apt-get update
sudo apt-get install -y git build-essential curl avahi-daemon python3-venv python3-pip openssl ffmpeg

# 2. Install Node.js
echo "[2/6] Checking Node.js version..."
CURRENT_NODE_VER=$(node -v 2>/dev/null || echo "none")
REQUIRED_PREFIX="v20"

if [[ "$CURRENT_NODE_VER" != "$REQUIRED_PREFIX"* ]]; then
    echo "Node.js is $CURRENT_NODE_VER. Installing/Upgrading to ${NODE_VERSION}..."
    sudo apt-get remove -y nodejs || true
    sudo apt-get autoremove -y || true

    curl -fsSL https://deb.nodesource.com/setup_${NODE_VERSION} | sudo -E bash -
    sudo apt-get install -y nodejs
else
    echo "Node.js ${NODE_VERSION} is already installed ($CURRENT_NODE_VER)."
fi

# 3. Clone Repository
echo "[3/6] Setting up DelovaHome source code..."
if [ -d "$INSTALL_DIR" ]; then
    echo "Directory exists. Pulling latest changes..."
    cd "$INSTALL_DIR"
    git pull
else
    echo "Cloning repository..."
    if ! git clone "$REPO_URL" "$INSTALL_DIR"; then
        echo "Error: Clone failed. If this is a private repo, provide a PAT."
        exit 1
    fi
fi

# 3b. Setup Python Environment
echo "[3b/6] Setting up Python environment..."
cd "$INSTALL_DIR"

# Remove venv if incomplete
if [ -d ".venv" ] && [ ! -f ".venv/bin/python" ]; then
    echo "Broken virtual environment detected. Recreating..."
    rm -rf .venv
fi

# Create venv (with pip auto-installed)
if [ ! -d ".venv" ]; then
    echo "Creating virtual environment..."
    python3 -m venv .venv
fi

# Ensure pip exists
if [ ! -f ".venv/bin/pip" ]; then
    echo "Pip missing, reinstalling via ensurepip..."
    .venv/bin/python -m ensurepip --upgrade
fi

echo "Installing Python dependencies..."
./.venv/bin/pip install --upgrade pip
./.venv/bin/pip install pyatv

# 4. Install Node Dependencies
echo "[4/6] Installing project dependencies..."
cd "$INSTALL_DIR"
npm install

# 5. SSL Certificates
echo "[5/6] Configuring SSL..."
if [ ! -f server.key ]; then
    echo "Generating self-signed certificate..."
    openssl req -nodes -new -x509 \
        -keyout server.key \
        -out server.cert \
        -days 3650 \
        -subj "/CN=delovahome.local"
else
    echo "SSL certificates already exist."
fi

# 5b. Environment Configuration
if [ ! -f .env ]; then
    echo "Creating default .env file..."
    echo "PORT=3000" > .env
fi

# 6. Setup PM2 (Process Manager)
echo "[6/6] Configuring auto-start with PM2..."
sudo npm install -g pm2

# Stop existing
pm2 delete delovahome 2>/dev/null || true

# Start App
pm2 start server.js --name "delovahome" -- --openssl-legacy-provider

# Save PM2 state
pm2 save

# Setup PM2 startup hook
STARTUP_CMD=$(pm2 startup | grep "sudo env")
if [ -n "$STARTUP_CMD" ]; then
    echo "Executing startup hook: $STARTUP_CMD"
    eval "$STARTUP_CMD"
fi

echo "========================================="
echo "   Installation Complete!"
echo "   DelovaHome is running at https://$(hostname -I | awk '{print $1}'):3000"
echo "========================================="
