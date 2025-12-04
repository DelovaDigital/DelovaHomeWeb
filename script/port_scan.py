import socket
import asyncio

target_ip = "192.168.0.68"

async def scan_port(port):
    conn = asyncio.open_connection(target_ip, port)
    try:
        reader, writer = await asyncio.wait_for(conn, timeout=0.5)
        print(f"Port {port} is OPEN")
        writer.close()
        await writer.wait_closed()
    except:
        pass

async def main():
    print(f"Scanning {target_ip}...")
    # Scan common ranges
    tasks = []
    # Common Apple TV ports
    ports_to_scan = [3689, 5000, 7000, 7100, 49152, 49153, 49154, 49155, 49156, 49157, 49158, 49159, 49160]
    
    # Add a wider range
    ports_to_scan.extend(range(49152, 49200))
    
    # Remove duplicates
    ports_to_scan = sorted(list(set(ports_to_scan)))

    for port in ports_to_scan:
        await scan_port(port)

if __name__ == '__main__':
    asyncio.run(main())
