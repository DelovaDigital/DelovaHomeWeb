import sys
import json
import os
import time
import socket

# Early print to debug startup
print(json.dumps({"status": "debug", "message": "Service starting..."}), flush=True)

try:
    from samsungtvws import SamsungTVWS
except ImportError as e:
    print(json.dumps({"error": f"Import failed: {e}", "type": "import_error"}), flush=True)
    sys.exit(1)

import logging
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
    if len(sys.argv) < 2:
        print(json.dumps({"error": "Usage: python samsung_service.py <ip>"}), flush=True)
        sys.exit(1)

    ip = sys.argv[1]
    tv = None
    cached_port = None
    
    def connect():
        nonlocal tv, cached_port
        tokens = load_tokens()
        token = tokens.get(ip)
        
        print(json.dumps({"status": "debug", "message": f"Token loaded for {ip}: {token}"}), flush=True)

        # If we found a working port before, prioritize it
        ports = [8002, 8001]
        if cached_port == 8001:
            ports = [8001, 8002]

        print(json.dumps({"status": "debug", "message": f"Connecting to {ip}..."}), flush=True)

        for port in ports:
            try:
                # Reduced timeout for snappier UI response, but enough for pairing
                # If cached_port is set, we expect it to work instantly.
                # If pairing (token invalid), we need more time for user to click Allow
                t_out = 5 if cached_port == port else 20 
                
                # Try Port
                tv = SamsungTVWS(host=ip, port=port, token=token, name='DelovaHome', timeout=t_out)
                tv.open()
                
                print(json.dumps({"status": "debug", "message": f"Connected. Current token: {tv.token}"}), flush=True)

                if tv.token:
                    if tv.token != token:
                        print(json.dumps({"status": "debug", "message": "Saving new token..."}), flush=True)
                        save_token(ip, tv.token)

                print(json.dumps({"status": "connected", "ip": ip, "port": port}), flush=True)
                cached_port = port
                return True
            except Exception as e:
                 # Only log detailed debug if we are struggling
                 print(json.dumps({"status": "debug", "message": f"Port {port} failed: {e}"}), flush=True)
                 pass
        
        print(json.dumps({"error": "Connection failed on both ports", "type": "connection_error"}), flush=True)
        tv = None
        return False

    # Initial connection
    connect()

    # Read stdin
    while True:
        try:
            line = sys.stdin.readline()
            if not line:
                break
            
            line = line.strip()
            if not line:
                continue

            try:
                cmd_data = json.loads(line)
            except:
                continue

            command = cmd_data.get('command')
            
            if command == 'key':
                key = cmd_data.get('value')
                
                if not tv:
                    if not connect():
                        # Failed to connect. 
                        # If it was flagged as legacy, or connection refused, report failure
                        print(json.dumps({"status": "failed", "key": key, "reason": "connection_failed"}), flush=True)
                        continue
                
                try:
                    tv.send_key(key)
                    print(json.dumps({"status": "sent", "key": key}), flush=True)
                except Exception as e:
                    print(json.dumps({"error": str(e), "type": "send_error"}), flush=True)
                    tv = None # Force reconnect next time
                    # Try immediate reconnect?
                    if connect():
                        try:
                            tv.send_key(key)
                            print(json.dumps({"status": "sent", "key": key}), flush=True)
                        except:
                            print(json.dumps({"status": "failed", "key": key}), flush=True)

        except KeyboardInterrupt:
            break
        except Exception as e:
            print(json.dumps({"error": f"Loop error: {e}"}), flush=True)
            break

if __name__ == '__main__':
    main()
