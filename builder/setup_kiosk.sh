#!/bin/bash
set -e

echo "========================================="
echo "   DelovaHome Kiosk Setup"
echo "========================================="

# 1. Install Display Server & Browser
echo "Installing X11, Openbox, and Chromium..."
sudo apt-get update
sudo apt-get install -y --no-install-recommends xserver-xorg x11-xserver-utils xinit openbox chromium-browser

# 2. Configure Openbox Autostart
echo "Configuring Kiosk Mode..."
mkdir -p /home/pi/.config/openbox
cat > /home/pi/.config/openbox/autostart <<EOF
# Disable power saving
xset s off
xset s noblank
xset -dpms

# Start Chromium in Kiosk Mode
# --check-for-update-interval=31536000 : Disable update checks
# --ignore-certificate-errors : Because we use self-signed certs
chromium-browser --noerrdialogs --disable-infobars --kiosk --ignore-certificate-errors https://localhost:3000
EOF

# 3. Auto-start X on login
echo "Configuring Auto-start..."
# Create .bash_profile if it doesn't exist
touch /home/pi/.bash_profile

if ! grep -q "startx" /home/pi/.bash_profile; then
    echo '[[ -z $DISPLAY && $XDG_VTNR -eq 1 ]] && startx -- -nocursor' >> /home/pi/.bash_profile
fi

# 4. Enable Console Auto-Login (Required for startx to run)
echo "Enabling Console Auto-Login..."
sudo raspi-config nonint do_boot_behaviour B2

echo "========================================="
echo "   Kiosk Setup Complete!"
echo "   Reboot your Pi to see the interface."
echo "========================================="
