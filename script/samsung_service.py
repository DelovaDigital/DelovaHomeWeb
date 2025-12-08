import sys
import json
import os
import logging
import time
import socket
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
    if len(sys.argv) < 2:
        print(json.dumps({"error": "Usage: python samsung_service.py <ip>"}), flush=True)
        sys.exit(1)

    ip = sys.argv[1]
    tv = None
    is_legacy = False

    # Check for legacy (Port 8002 closed)
    try:
        sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        sock.settimeout(1)
        if sock.connect_ex((ip, 8002)) != 0:
            # Port 8002 closed, might be legacy
            is_legacy = True
        sock.close()
    except:
        pass

    if is_legacy:
        print(json.dumps({"error": "legacy_detected", "ip": ip}), flush=True)
        # We keep running? No, if it's legacy, this service is useless.
        # But maybe it's just off?
        # If it's off, we can't control it via WS anyway.
        # Let's wait for commands. If we get a command, we try to connect.

    def connect():
        nonlocal tv
        tokens = load_tokens()
        token = tokens.get(ip)
        try:
            # timeout=5 for faster failure
            tv = SamsungTVWS(host=ip, port=8002, token=token, name='DelovaHome', timeout=5)
            tv.open()
            if tv.token and tv.token != token:
                save_token(ip, tv.token)
            print(json.dumps({"status": "connected", "ip": ip}), flush=True)
            return True
        except Exception as e:
            print(json.dumps({"error": str(e), "type": "connection_error"}), flush=True)
            tv = None
            return False

    # Initial connection attempt
    if not is_legacy:
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
