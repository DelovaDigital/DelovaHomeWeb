import 'dart:io';
import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:nsd/nsd.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'login_screen.dart';
import 'main_screen.dart';

class HubDiscoveryScreen extends StatefulWidget {
  const HubDiscoveryScreen({super.key});

  @override
  State<HubDiscoveryScreen> createState() => _HubDiscoveryScreenState();
}

class _HubDiscoveryScreenState extends State<HubDiscoveryScreen> {
  final List<Service> _hubs = [];
  Discovery? _discovery;
  bool _isScanning = false;

  @override
  void initState() {
    super.initState();
    _checkAutoLogin();
    _startDiscovery();
  }

  Future<void> _checkAutoLogin() async {
    final prefs = await SharedPreferences.getInstance();
    final hubIp = prefs.getString('hub_ip');
    final hubPort = prefs.getString('hub_port');
    final userId = prefs.getString('userId');

    if (hubIp != null && hubPort != null && userId != null) {
      debugPrint('Found stored credentials. Verifying session...');
      try {
        final client = HttpClient();
        client.badCertificateCallback = (cert, host, port) => true;
        final url = Uri.parse('https://$hubIp:$hubPort/api/me?userId=$userId');
        final request = await client.getUrl(url);
        final response = await request.close();
        
        if (response.statusCode == 200) {
          final body = await response.transform(utf8.decoder).join();
          final data = jsonDecode(body);
          if (data['ok'] == true) {
            debugPrint('Session valid. Auto-login.');
            if (mounted) {
              Navigator.of(context).pushReplacement(
                MaterialPageRoute(builder: (context) => const MainScreen()),
              );
            }
            return;
          }
        }
      } catch (e) {
        debugPrint('Auto-login failed: $e');
      }
    }
  }

  @override
  void dispose() {
    _stopDiscovery();
    super.dispose();
  }

  Future<void> _startDiscovery() async {
    if (_isScanning) return;
    setState(() => _isScanning = true);

    try {
      // Search for _http._tcp as it is more standard, and filter by TXT record
      _discovery = await startDiscovery('_http._tcp');
      _discovery!.addServiceListener((service, status) {
        if (status == ServiceStatus.found) {
          debugPrint('Found service: ${service.name} ${service.txt}');
          
          bool isMatch = false;

          // 1. Check TXT record (Best method)
          if (service.txt != null && service.txt!.containsKey('type')) {
             try {
               final typeBytes = service.txt!['type'];
               if (typeBytes != null) {
                 final typeStr = utf8.decode(typeBytes);
                 if (typeStr == 'delovahome') isMatch = true;
               }
             } catch (e) { /* ignore decode error */ }
          }

          // 2. Fallback: Check Service Name (If TXT is stripped by router)
          if (!isMatch && (service.name != null && service.name!.toLowerCase().startsWith('delovahome'))) {
             isMatch = true;
          }

          if (isMatch) {
            setState(() {
              if (!_hubs.any((h) => h.name == service.name)) {
                _hubs.add(service);
              }
            });
          }
        }
      });
    } catch (e) {
      debugPrint('Discovery error: $e');
      setState(() => _isScanning = false);
    }
  }

  Future<void> _stopDiscovery() async {
    if (_discovery != null) {
      await stopDiscovery(_discovery!);
      _discovery = null;
    }
    if (mounted) setState(() => _isScanning = false);
  }

  void _showManualConnectDialog() {
    final ipController = TextEditingController();
    showDialog(
      context: context,
      builder: (context) => AlertDialog(
        backgroundColor: Colors.grey[900],
        title: const Text('Manual Connect', style: TextStyle(color: Colors.white)),
        content: TextField(
          controller: ipController,
          style: const TextStyle(color: Colors.white),
          decoration: const InputDecoration(
            labelText: 'Hub IP Address',
            labelStyle: TextStyle(color: Colors.grey),
            hintText: 'e.g. 192.168.0.216',
            hintStyle: TextStyle(color: Colors.grey),
            enabledBorder: UnderlineInputBorder(borderSide: BorderSide(color: Colors.grey)),
          ),
          keyboardType: TextInputType.number,
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: const Text('Cancel'),
          ),
          TextButton(
            onPressed: () {
              final ip = ipController.text.trim();
              if (ip.isNotEmpty) {
                Navigator.pop(context);
                Navigator.of(context).push(
                  MaterialPageRoute(
                    builder: (context) => LoginScreen(
                      hubIp: ip,
                      hubPort: '3000',
                      hubName: 'Manual Hub',
                    ),
                  ),
                );
              }
            },
            child: const Text('Connect'),
          ),
        ],
      ),
    );
  }

  Future<void> _connectToHub(Service service) async {
    // Extract IP and Port
    String? ip;
    int? port = service.port;

    if (service.addresses != null && service.addresses!.isNotEmpty) {
      // Prefer IPv4
      try {
        ip = service.addresses!.firstWhere((addr) => addr.type == InternetAddressType.IPv4).address;
      } catch (e) {
        ip = service.addresses!.first.address;
      }
    } else {
      ip = service.host;
    }

    if (ip != null) {
      // Navigate to Login Screen with Hub details
      if (mounted) {
        Navigator.of(context).push(
          MaterialPageRoute(
            builder: (context) => LoginScreen(
              hubIp: ip!,
              hubPort: port?.toString() ?? '3000',
              hubName: service.name,
            ),
          ),
        );
      }
    } else {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Could not resolve Hub IP')),
        );
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.black,
      appBar: AppBar(
        title: const Text('Select Your Hub'),
        backgroundColor: Colors.transparent,
        actions: [
          if (_isScanning)
            const Center(
              child: Padding(
                padding: EdgeInsets.only(right: 16.0),
                child: SizedBox(
                  width: 20,
                  height: 20,
                  child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white),
                ),
              ),
            )
          else
            IconButton(
              icon: const Icon(Icons.refresh),
              onPressed: () {
                _hubs.clear();
                _startDiscovery();
              },
            ),
          IconButton(
            icon: const Icon(Icons.add),
            tooltip: 'Manual Connect',
            onPressed: _showManualConnectDialog,
          ),
        ],
      ),
      body: _hubs.isEmpty
          ? Center(
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Icon(Icons.router, size: 80, color: Colors.grey[800]),
                  const SizedBox(height: 20),
                  const Text(
                    'Searching for DelovaHome Hubs...',
                    style: TextStyle(color: Colors.grey),
                  ),
                  const SizedBox(height: 40),
                  TextButton(
                    onPressed: _showManualConnectDialog,
                    child: const Text('Enter IP Manually'),
                  ),
                ],
              ),
            )
          : ListView.builder(
              itemCount: _hubs.length,
              itemBuilder: (context, index) {
                final hub = _hubs[index];
                return Card(
                  color: Colors.grey[900],
                  margin: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                  child: ListTile(
                    leading: const Icon(Icons.home_filled, color: Colors.amber, size: 32),
                    title: Text(hub.name ?? 'Unknown Hub', style: const TextStyle(color: Colors.white)),
                    subtitle: Text(
                      '${hub.host}:${hub.port}',
                      style: TextStyle(color: Colors.grey[400]),
                    ),
                    trailing: const Icon(Icons.arrow_forward_ios, color: Colors.grey),
                    onTap: () => _connectToHub(hub),
                  ),
                );
              },
            ),
    );
  }
}
