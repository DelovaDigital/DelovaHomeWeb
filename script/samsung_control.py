import sys
import json
import os
import logging
from samsungtvws import SamsungTVWS

# Suppress logs
logging.basicConfig(level=logging.CRITICAL)

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
        json.dump(tokens, f)

def main():
    if len(sys.argv) < 3:
        print(json.dumps({"error": "Usage: python samsung_control.py <ip> <key>"}), flush=True)
        sys.exit(1)

    ip = sys.argv[1]
    key = sys.argv[2]

    tokens = load_tokens()
    token = tokens.get(ip)

    try:
        # Check if it's actually a Tizen TV by querying the API
        # This prevents false positives where port 8002 is open but not for control
        try:
            import requests
            # Try HTTP (8001) and HTTPS (8002)
            is_tizen = False
            try:
                requests.get(f'http://{ip}:8001/api/v2/', timeout=2)
                is_tizen = True
            except:
                try:
                    requests.get(f'https://{ip}:8002/api/v2/', timeout=2, verify=False)
                    is_tizen = True
                except:
                    pass
            
            if not is_tizen:
                # If API is not accessible, it's likely a legacy TV (Orchestrator)
                # Fail here so deviceManager falls back to samsung-remote
                raise Exception("Not a Tizen TV (API unreachable)")
        except ImportError:
            pass # requests not installed? ignore check

        # Increase timeout for initial pairing
        tv = SamsungTVWS(host=ip, port=8002, token=token, name='DelovaHome', timeout=30)
        
        # Open connection explicitly
        tv.open()
        
        # Save token if we got a new one
        if tv.token and tv.token != token:
            save_token(ip, tv.token)
            
        # Send key
        tv.send_key(key)
        
        print(json.dumps({"status": "success", "key": key}), flush=True)
        
    except Exception as e:
        print(json.dumps({"error": str(e)}), flush=True)
        sys.exit(1)

if __name__ == '__main__':
    main()
