import sys
import os
import json
import time
import logging
from samsungtvws import SamsungTVWS

# Path to token file (same as used by the service)
TOKEN_FILE = os.path.join(os.path.dirname(__file__), '../samsung-tokens.json')

def load_tokens():
    if os.path.exists(TOKEN_FILE):
        try:
            with open(TOKEN_FILE, 'r') as f:
                return json.load(f)
        except:
            return {}
    return {}

def save_token(ip, token):
    tokens = load_tokens()
    tokens[ip] = token
    with open(TOKEN_FILE, 'w') as f:
        json.dump(tokens, f, indent=4)
    print(f"Token saved to {TOKEN_FILE}")

def main():
    if len(sys.argv) < 2:
        print("Usage: python3 test_samsung_tv.py <IP>")
        return

    ip = sys.argv[1]
    print(f"Testing connection to Samsung TV at {ip}...")

    tokens = load_tokens()
    token = tokens.get(ip)

    if token:
        print("Found existing token.")
    else:
        print("No existing token found. You may need to accept a prompt on the TV.")

    # Try Port 8002 (Secure)
    try:
        print("\n--- Testing Port 8002 (Secure Tizen) ---")
        tv = SamsungTVWS(host=ip, port=8002, token=token, name='DelovaHome', timeout=10)
        tv.open()
        print(f"Connected! Token received: {tv.token}")
        
        if tv.token and tv.token != token:
            print("Saving new token...")
            save_token(ip, tv.token)
        
        print("Sending KEY_VOLUP...")
        tv.send_key('KEY_VOLUP')
        print("Command sent (8002). Did the volume change?")
        
        tv.close()

    except Exception as e:
        print(f"Port 8002 failed: {e}")

    # Try Port 8001 (Legacy Tizen / J-Series)
    try:
        print("\n--- Testing Port 8001 (Legacy Tizen / J-Series) ---")
        tv = SamsungTVWS(host=ip, port=8001, token=token, name='DelovaHome', timeout=10)
        tv.open()
        print(f"Connected! Token received: {tv.token}")
        
        if tv.token and tv.token != token:
            print("Saving new token...")
            save_token(ip, tv.token)
            
        print("Sending KEY_VOLUP...")
        tv.send_key('KEY_VOLUP')
        print("Command sent (8001). Did the volume change?")
        
        tv.close()
            
    except Exception as e2:
        print(f"Port 8001 failed: {e2}")

if __name__ == "__main__":
    main()
