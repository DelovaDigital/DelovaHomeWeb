import 'dart:io';
import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:nsd/nsd.dart';
import 'package:shared_preferences/shared_preferences.dart';
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
    _startDiscovery();
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
      _discovery = await startDiscovery('_delovahome._tcp');
      _discovery!.addServiceListener((service, status) {
        if (status == ServiceStatus.found) {
          setState(() {
            if (!_hubs.any((h) => h.name == service.name)) {
              _hubs.add(service);
            }
          });
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
      // Save to SharedPreferences
      final prefs = await SharedPreferences.getInstance();
      await prefs.setString('hub_ip', ip);
      await prefs.setString('hub_port', port.toString());
      
      // Extract Hub ID from TXT record if available
      if (service.txt != null && service.txt!.containsKey('id')) {
        // nsd returns Uint8List for TXT values, so we decode it
        final idBytes = service.txt!['id'];
        if (idBytes != null) {
          await prefs.setString('hub_id', utf8.decode(idBytes));
        }
      }

      if (mounted) {
        Navigator.of(context).pushReplacement(
          MaterialPageRoute(builder: (context) => const MainScreen()),
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
                    onPressed: () {
                      // Manual IP fallback
                      _showManualIpDialog();
                    },
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

  void _showManualIpDialog() {
    final controller = TextEditingController();
    showDialog(
      context: context,
      builder: (context) => AlertDialog(
        backgroundColor: Colors.grey[900],
        title: const Text('Enter Hub IP', style: TextStyle(color: Colors.white)),
        content: TextField(
          controller: controller,
          style: const TextStyle(color: Colors.white),
          decoration: const InputDecoration(
            hintText: '192.168.1.x',
            hintStyle: TextStyle(color: Colors.grey),
            enabledBorder: UnderlineInputBorder(borderSide: BorderSide(color: Colors.grey)),
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: const Text('Cancel'),
          ),
          TextButton(
            onPressed: () async {
              if (controller.text.isNotEmpty) {
                final prefs = await SharedPreferences.getInstance();
                await prefs.setString('hub_ip', controller.text);
                if (mounted) {
                  Navigator.pop(context);
                  Navigator.of(context).pushReplacement(
                    MaterialPageRoute(builder: (context) => const MainScreen()),
                  );
                }
              }
            },
            child: const Text('Connect'),
          ),
        ],
      ),
    );
  }
}
