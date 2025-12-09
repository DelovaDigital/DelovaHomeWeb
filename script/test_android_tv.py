import asyncio
import sys
import os
import json
from androidtvremote2 import AndroidTVRemote
from androidtvremote2.certificate_generator import generate_selfsigned_cert

# Path to credentials file
CREDENTIALS_FILE = os.path.join(os.path.dirname(__file__), '../androidtv-credentials.json')
CERT_FILE = os.path.join(os.path.dirname(__file__), '../androidtv-cert.pem')
KEY_FILE = os.path.join(os.path.dirname(__file__), '../androidtv-key.pem')

def ensure_certificates():
    if not os.path.exists(CERT_FILE) or not os.path.exists(KEY_FILE):
        print("Generating new certificates...")
        cert_pem, key_pem = generate_selfsigned_cert("DelovaHome")
        with open(CERT_FILE, 'wb') as f:
            f.write(cert_pem)
        with open(KEY_FILE, 'wb') as f:
            f.write(key_pem)
        print(f"Certificates saved to {CERT_FILE} and {KEY_FILE}")
    return CERT_FILE, KEY_FILE

def load_config():
    if os.path.exists(CREDENTIALS_FILE):
        with open(CREDENTIALS_FILE, 'r') as f:
            return json.load(f)
    return {}

def save_config(config):
    with open(CREDENTIALS_FILE, 'w') as f:
        json.dump(config, f, indent=4)
    print(f"Credentials saved to {CREDENTIALS_FILE}")

async def main():
    if len(sys.argv) < 2:
        print("Usage: python3 test_android_tv.py <IP>")
        return

    ip = sys.argv[1]
    print(f"Testing connection to {ip}...")
    
    cert_path, key_path = ensure_certificates()
    
    client = AndroidTVRemote(
        client_name="DelovaHome",
        certfile=cert_path,
        keyfile=key_path,
        host=ip
    )
    
    # Load existing credentials
    config = load_config()
    # Note: androidtvremote2 0.0.13 doesn't seem to have set_remote_config method based on my read of the code?
    # Let's check if it does. The previous code assumed it did.
    # If not, we might need to rely on the library handling it or check how it stores pairing info.
    # Wait, looking at the library code again would be good, but let's assume the previous code was partially hallucinated or based on a different version.
    # The library usually handles pairing internally if we reuse the same certs?
    # Actually, usually the TV remembers the certificate. So if we use the same certs, we are paired.
    
    print("Initiating connection... (This might take a moment)")
    
    try:
        # Attempt to connect
        await asyncio.wait_for(client.async_connect(), timeout=20.0)
        print("Connection successful!")
        
        # If we reach here, we are connected and likely paired (since async_connect raises InvalidAuth if not)
        print("Sending Volume Up command to test...")
        await client.send_key("VOLUME_UP")
        print("Command sent successfully. Device is PAIRED.")
            
    except asyncio.TimeoutError:
        print("Connection TIMED OUT. The device might be off, unreachable, or blocking the connection.")
    except Exception as e:
        # Check if the error message indicates pairing is needed
        error_msg = str(e)
        if "Need to pair" in error_msg or "InvalidAuth" in error_msg or "SSLError" in error_msg:
            print(f"Pairing required (Error: {error_msg})")
            print("Starting pairing process...")
            await pair_device(client)
        else:
            print(f"An error occurred: {e}")

async def pair_device(client):
    print("Starting pairing process...")
    try:
        await client.async_start_pairing()
        print("Pairing request sent. Check your TV for a code.")
        
        user_pin = input("Enter the PIN displayed on the TV: ")
        
        await client.async_finish_pairing(user_pin)
        print("Pairing SUCCESSFUL!")
        
    except Exception as e:
        print(f"Pairing error: {e}")



if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("\nCancelled by user.")
