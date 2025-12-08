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
        tv = SamsungTVWS(host=ip, port=8002, token=token, name='DelovaHome')
        
        # This will trigger auth if token is invalid/missing
        tv.shortcuts().power() # Dummy call to check connection/auth? No, just open.
        
        # Actually, we need to open the connection. The library does it lazily.
        # But we want to capture the token if it changes.
        
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
