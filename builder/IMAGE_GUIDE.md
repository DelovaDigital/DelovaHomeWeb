# How to Create a DelovaHome Raspberry Pi Image

This guide explains how to create a "flash-and-forget" image for Raspberry Pi that automatically installs and runs DelovaHome.

## Method 1: The "Golden Image" (Easiest)
This method involves setting up one Pi manually, then copying its SD card to a file that you can flash to other cards.

### Steps:
1.  **Flash Raspberry Pi OS Lite** to an SD card using Raspberry Pi Imager.
    *   *Tip: In the Imager settings (gear icon), set hostname to `delovahome`, enable SSH, and set a username/password.*
2.  **Boot the Pi** and connect via SSH.
3.  **Copy the setup script** to the Pi:
    ```bash
    # If you set the hostname to 'delovahome' in step 1:
    scp builder/setup_delovahome.sh pi@delovahome.local:/home/pi/
    
    # OR use the IP address if that doesn't work:
    scp builder/setup_delovahome.sh pi@<YOUR_PI_IP_ADDRESS>:/home/pi/
    ```
4.  **Run the script** on the Pi:
    ```bash
    chmod +x setup_delovahome.sh
    ./setup_delovahome.sh
    ```
5.  **Verify** everything works by visiting `https://delovahome.local:3000`.
6.  **Prepare for Imaging**:
    *   Delete personal data (e.g., `~/.bash_history`).
    *   Shutdown: `sudo shutdown now`.
7.  **Create the Image**:
    *   Put the SD card back in your computer.
    *   Use a tool like **Win32DiskImager** (Windows) or **Disk Utility/dd** (Mac/Linux) to "Read" the SD card to a `.img` file.
    *   *Optional: Use [pishrink](https://github.com/Drewsif/PiShrink) to make the image smaller.*

---

## Method 2: Fully Automated (Cloud-Init / User-Data)
This method uses the "OS Customization" feature of Raspberry Pi Imager to run the installation automatically on the very first boot.

### Steps:
1.  Open **Raspberry Pi Imager**.
2.  Choose OS: **Raspberry Pi OS Lite (64-bit)**.
3.  Choose Storage: Your SD Card.
4.  Click **Next**, then **Edit Settings**.
5.  **General Tab**:
    *   Hostname: `delovahome`
    *   Set Username/Password.
    *   Configure Wireless LAN (if using Wi-Fi).
6.  **Services Tab**: Enable SSH.
7.  **Options Tab** (or manually editing `user-data`):
    *   Unfortunately, the standard Imager UI doesn't let you paste a full script easily.
    *   **Alternative**: Flash the OS normally. Before ejecting, open the `boot` partition on your computer.
    *   Create a file named `firstrun.sh` in the root of the boot drive with the content of `setup_delovahome.sh`.
    *   Edit `cmdline.txt` on the boot drive and add `systemd.run=/boot/firstrun.sh` to the end of the line (separated by a space).
    *   *Note: This is advanced and can be tricky to debug.*

### Recommended Approach
Use **Method 1**. It is more reliable for creating a stable "Production" image. You can verify the installation works perfectly before creating the master image.

## Updating the Firmware
Since the application is set up with `git`, you can release updates by:
1.  Pushing changes to the GitHub `main` branch.
2.  Users click **"Check for updates"** in the DelovaHome Settings dashboard.
3.  The Pi pulls the new code and restarts automatically.
