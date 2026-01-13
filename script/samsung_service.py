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
    is_legacy = False

    # Check ports to determine generation
    # Priority: 8002 (Modern Secure) > 8001 (Modern) > 55000 (Legacy)
    try:
        # Check Port 8002 (Tizen Secure)
        sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        sock.settimeout(1)
        if sock.connect_ex((ip, 8002)) == 0:
            is_legacy = False
        else:
            sock.close()
            # Check Port 8001 (Tizen/J-Series)
            sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            sock.settimeout(1)
            if sock.connect_ex((ip, 8001)) == 0:
                is_legacy = False
            else:
                sock.close()
                # Check Port 55000 (Legacy)
                sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
                sock.settimeout(1)
                if sock.connect_ex((ip, 55000)) == 0:
                    is_legacy = True
                sock.close()
        sock.close()
    except:
        pass

    if is_legacy:
        print(json.dumps({"error": "legacy_detected", "ip": ip}), flush=True)
        # Exit so deviceManager knows to use fallback
        sys.exit(1)

    def connect():
        nonlocal tv
        tokens = load_tokens()
        token = tokens.get(ip)
        
        print(json.dumps({"status": "debug", "message": f"Attempting connection to {ip}..."}), flush=True)

        # Try Port 8002 (Secure Tizen)
        try:
            tv = SamsungTVWS(host=ip, port=8002, token=token, name='DelovaHome', timeout=10)
            tv.open()
            
            # Log token status
            if tv.token:
                print(json.dumps({"status": "debug", "message": f"Token obtained: {tv.token[:5]}..."}), flush=True)
                if tv.token != token:
                    save_token(ip, tv.token)
                    print(json.dumps({"status": "debug", "message": "New token saved"}), flush=True)
            else:
                print(json.dumps({"status": "debug", "message": "No token returned by TV"}), flush=True)

            print(json.dumps({"status": "connected", "ip": ip, "port": 8002}), flush=True)
            return True
        except Exception as e_8002:
            print(json.dumps({"status": "debug", "message": f"Port 8002 failed: {e_8002}"}), flush=True)
            # Try Port 8001 (Legacy Tizen / J-Series)
            try:
                tv = SamsungTVWS(host=ip, port=8001, token=token, name='DelovaHome', timeout=10)
                tv.open()
                if tv.token and tv.token != token:
                    save_token(ip, tv.token)
                print(json.dumps({"status": "connected", "ip": ip, "port": 8001}), flush=True)
                return True
            except Exception as e_8001:
                print(json.dumps({"status": "debug", "message": f"Port 8001 failed: {e_8001}"}), flush=True)
                print(json.dumps({"error": f"8002: {e_8002}, 8001: {e_8001}", "type": "connection_error"}), flush=True)
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
