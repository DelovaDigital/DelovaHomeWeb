import sys
import os
import time
import logging
import json
import urllib.request
import ssl

# Configure logging to see WebSocket details
logging.basicConfig(level=logging.DEBUG)

# Try to import samsungtvws
try:
    from samsungtvws import SamsungTVWS
except ImportError:
    print("Error: samsungtvws not installed. Run: pip install samsungtvws")
    sys.exit(1)

if len(sys.argv) < 2:
    print("Usage: python test_samsung_tv.py <IP_ADDRESS>")
    sys.exit(1)

tv_ip = sys.argv[1]
token_path = os.path.join(os.path.dirname(__file__), 'samsung_token.txt')

print(f"Testing connection to Samsung TV at {tv_ip}...")

# --- Helper to get device info ---
def get_device_info(ip, port, protocol="http"):
    url = f"{protocol}://{ip}:{port}/api/v2/"
    print(f"Checking {url}...")
    try:
        ctx = ssl.create_default_context()
        ctx.check_hostname = False
        ctx.verify_mode = ssl.CERT_NONE
        
        req = urllib.request.Request(url)
        if protocol == "https":
            response = urllib.request.urlopen(req, context=ctx, timeout=3)
        else:
            response = urllib.request.urlopen(req, timeout=3)
            
        data = json.loads(response.read().decode('utf-8'))
        print(f"SUCCESS: Found TV Model: {data.get('device', {}).get('modelName')}")
        print(f"OS: {data.get('device', {}).get('OS')}")
        return True
    except Exception as e:
        print(f"Failed to reach {url}: {e}")
        return False

# 1. Check HTTP API
print("\n--- Diagnostic: Checking API ---")
api_8001 = get_device_info(tv_ip, 8001, "http")
api_8002 = get_device_info(tv_ip, 8002, "https")

if not api_8001 and not api_8002:
    print("WARNING: Could not reach TV API on port 8001 or 8002. TV might be off or network isolated.")

# 2. Try WebSocket on 8002
print("\n--- Diagnostic: Testing Port 8002 (Secure WebSocket) ---")
try:
    # Delete token file to force fresh pairing
    if os.path.exists(token_path):
        print("Removing existing token file to force fresh pairing...")
        os.remove(token_path)

    print("Initializing SamsungTVWS...")
    # Increase timeout for pairing
    tv = SamsungTVWS(host=tv_ip, port=8002, token_file=token_path, timeout=10)
    
    print("Opening connection (Watch TV for popup!)...")
    tv.open()
    print("Connection opened.")
    
    # Check if we got a token
    if os.path.exists(token_path):
        with open(token_path, 'r') as f:
            print(f"Token saved to file: {f.read()}")
    else:
        print("No token file created. (This is common if TV didn't prompt)")

    print("Sending KEY_VOLUP...")
    tv.send_key('KEY_VOLUP')
    time.sleep(1)
    print("Sending KEY_VOLUP...")
    tv.send_key('KEY_VOLUP')
    
    tv.close()
    print("Connection closed.")

except Exception as e:
    print(f"Port 8002 failed: {e}")
