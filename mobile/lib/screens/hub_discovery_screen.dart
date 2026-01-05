import 'dart:io';
import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:nsd/nsd.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:geolocator/geolocator.dart' hide ServiceStatus; // For openAppSettings
import 'login_screen.dart';
import 'main_screen.dart';
import '../utils/app_translations.dart';

import '../widgets/gradient_background.dart';
import '../widgets/glass_card.dart';

class HubDiscoveryScreen extends StatefulWidget {
  const HubDiscoveryScreen({super.key});

  @override
  State<HubDiscoveryScreen> createState() => _HubDiscoveryScreenState();
}

class _HubDiscoveryScreenState extends State<HubDiscoveryScreen> with SingleTickerProviderStateMixin {
  final List<HubInfo> _hubs = [];
  Discovery? _discovery;
  bool _isScanning = false;
  late AnimationController _pulseController;
  late Animation<double> _pulseAnimation;
  String _lang = 'nl';
  RawDatagramSocket? _udpSocket;

  @override
  void initState() {
    super.initState();
    _loadLanguage();
    _pulseController = AnimationController(
      vsync: this,
      duration: const Duration(seconds: 2),
    )..repeat(reverse: true);
    _pulseAnimation = Tween<double>(begin: 1.0, end: 1.2).animate(
      CurvedAnimation(parent: _pulseController, curve: Curves.easeInOut),
    );
    _checkAutoLogin();
    // Add a small delay to ensure UI is ready and increase chance of permission prompt
    Future.delayed(const Duration(seconds: 1), _startDiscovery);
  }

  Future<void> _loadLanguage() async {
    final prefs = await SharedPreferences.getInstance();
    if (mounted) {
      setState(() {
        _lang = prefs.getString('language') ?? 'nl';
      });
    }
  }

  String t(String key) => AppTranslations.get(key, lang: _lang);

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
        client.connectionTimeout = const Duration(seconds: 5);
        
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
    _pulseController.dispose();
    super.dispose();
  }

  Future<void> _startDiscovery() async {
    if (_isScanning) return;
    setState(() {
      _isScanning = true;
      _hubs.clear();
    });

    // 1. Start UDP Discovery (Fast & Reliable on local subnet)
    _startUDPDiscovery();

    // 2. Start mDNS Discovery (Standard)
    try {
      // Search for specific service type first (more reliable)
      _discovery = await startDiscovery('_delovahome._tcp');
      _discovery!.addServiceListener((service, status) {
        if (status == ServiceStatus.found) {
           _addServiceToHubs(service);
        }
      });

      // Also search for _http._tcp as fallback
      final httpDiscovery = await startDiscovery('_http._tcp');
      httpDiscovery.addServiceListener((service, status) {
        if (status == ServiceStatus.found) {
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
          // 2. Fallback: Check Service Name
          if (!isMatch && (service.name != null && service.name!.toLowerCase().startsWith('delovahome'))) {
             isMatch = true;
          }

          if (isMatch) {
            _addServiceToHubs(service);
          }
        }
      });
    } catch (e) {
      debugPrint('Discovery error: $e');
      setState(() => _isScanning = false);
    }
  }

  Future<void> _startUDPDiscovery() async {
    try {
      _udpSocket = await RawDatagramSocket.bind(InternetAddress.anyIPv4, 0);
      _udpSocket!.broadcastEnabled = true;
      
      _udpSocket!.listen((RawSocketEvent event) {
        if (event == RawSocketEvent.read) {
          final datagram = _udpSocket!.receive();
          if (datagram != null) {
            try {
              final msg = utf8.decode(datagram.data);
              final data = jsonDecode(msg);
              if (data['type'] == 'delovahome') {
                debugPrint('Found Hub via UDP: ${data['name']} at ${datagram.address.address}');
                _addHubInfo(HubInfo(
                  name: data['name'],
                  ip: datagram.address.address,
                  port: int.tryParse(data['port'].toString()) ?? 3000,
                  id: data['id']
                ));
              }
            } catch (e) {
              // Not our packet
            }
          }
        }
      });

      final data = utf8.encode('DELOVAHOME_DISCOVER');
      
      // Send multiple times to ensure delivery
      for (int i = 0; i < 3; i++) {
        if (_udpSocket == null) break;

        // 1. Global Broadcast
        try {
          _udpSocket!.send(data, InternetAddress('255.255.255.255'), 8888);
          debugPrint('Sent UDP Broadcast to 255.255.255.255:8888');
        } catch (e) {
          debugPrint('Global broadcast failed: $e');
        }

        // 2. Subnet Broadcast (Try to find local interface)
        try {
          // Hardcoded fallbacks for common subnets
          _udpSocket!.send(data, InternetAddress('192.168.0.255'), 8888);
          _udpSocket!.send(data, InternetAddress('192.168.1.255'), 8888);
          _udpSocket!.send(data, InternetAddress('192.168.178.255'), 8888); // FritzBox default

          for (var interface in await NetworkInterface.list(type: InternetAddressType.IPv4)) {
            for (var addr in interface.addresses) {
              if (!addr.isLoopback) {
                // Assume /24 for simplicity: replace last segment with 255
                final parts = addr.address.split('.');
                if (parts.length == 4) {
                  parts[3] = '255';
                  final broadcastIp = parts.join('.');
                  debugPrint('Sending to subnet broadcast: $broadcastIp');
                  _udpSocket!.send(data, InternetAddress(broadcastIp), 8888);
                }
              }
            }
          }
        } catch (e) {
          debugPrint('Subnet broadcast failed: $e');
        }

        await Future.delayed(const Duration(milliseconds: 800));
      }

    } catch (e) {
      debugPrint('UDP Discovery failed: $e');
    }
  }

  void _addServiceToHubs(Service service) {
    String? ip;
    if (service.addresses != null && service.addresses!.isNotEmpty) {
      try {
        ip = service.addresses!.firstWhere((addr) => addr.type == InternetAddressType.IPv4).address;
      } catch (e) {
        ip = service.addresses!.first.address;
      }
    } else {
      ip = service.host;
    }

    if (ip != null) {
      _addHubInfo(HubInfo(
        name: service.name ?? 'Unknown Hub',
        ip: ip,
        port: service.port ?? 3000,
        id: null // mDNS might have it in TXT but we can live without it for listing
      ));
    }
  }

  void _addHubInfo(HubInfo info) {
    if (mounted) {
      setState(() {
        // Avoid duplicates by IP
        if (!_hubs.any((h) => h.ip == info.ip)) {
          _hubs.add(info);
        }
      });
    }
  }

  Future<void> _stopDiscovery() async {
    if (_discovery != null) {
      await stopDiscovery(_discovery!);
      _discovery = null;
    }
    _udpSocket?.close();
    _udpSocket = null;
    if (mounted) setState(() => _isScanning = false);
  }

  void _showCloudLoginDialog() {
    final urlController = TextEditingController();
    final emailController = TextEditingController();
    final passwordController = TextEditingController();
    bool isLoading = false;

    showDialog(
      context: context,
      builder: (context) => StatefulBuilder(
        builder: (context, setState) => AlertDialog(
          backgroundColor: const Color(0xFF1A237E),
          title: const Text('Cloud Login', style: TextStyle(color: Colors.white)),
          content: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              TextField(
                controller: urlController,
                style: const TextStyle(color: Colors.white),
                decoration: const InputDecoration(
                  labelText: 'Cloud URL',
                  hintText: 'e.g. http://192.168.1.50:4000',
                  labelStyle: TextStyle(color: Colors.white70),
                  hintStyle: TextStyle(color: Colors.white30),
                  enabledBorder: UnderlineInputBorder(borderSide: BorderSide(color: Colors.white30)),
                ),
              ),
              TextField(
                controller: emailController,
                style: const TextStyle(color: Colors.white),
                decoration: const InputDecoration(
                  labelText: 'Email or Username',
                  labelStyle: TextStyle(color: Colors.white70),
                  enabledBorder: UnderlineInputBorder(borderSide: BorderSide(color: Colors.white30)),
                ),
              ),
              TextField(
                controller: passwordController,
                obscureText: true,
                style: const TextStyle(color: Colors.white),
                decoration: const InputDecoration(
                  labelText: 'Password',
                  labelStyle: TextStyle(color: Colors.white70),
                  enabledBorder: UnderlineInputBorder(borderSide: BorderSide(color: Colors.white30)),
                ),
              ),
              if (isLoading)
                const Padding(
                  padding: EdgeInsets.only(top: 16.0),
                  child: CircularProgressIndicator(color: Colors.cyan),
                ),
            ],
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(context),
              child: Text(t('cancel'), style: const TextStyle(color: Colors.white70)),
            ),
            ElevatedButton(
              style: ElevatedButton.styleFrom(backgroundColor: Colors.purple),
              onPressed: isLoading ? null : () async {
                if (urlController.text.isEmpty || emailController.text.isEmpty || passwordController.text.isEmpty) {
                  return;
                }
                
                setState(() => isLoading = true);
                
                try {
                  // Construct URL
                  String baseUrl = urlController.text;
                  if (!baseUrl.startsWith('http')) {
                    baseUrl = 'http://$baseUrl';
                  }
                  // Remove trailing slash
                  if (baseUrl.endsWith('/')) baseUrl = baseUrl.substring(0, baseUrl.length - 1);

                  final url = Uri.parse('$baseUrl/api/login');
                  
                  final client = HttpClient();
                  client.badCertificateCallback = (cert, host, port) => true;
                  
                  final request = await client.postUrl(url);
                  request.headers.set('Content-Type', 'application/json');
                  request.add(utf8.encode(jsonEncode({
                    'username': emailController.text,
                    'password': passwordController.text,
                  })));
                  
                  final response = await request.close();
                  final responseBody = await response.transform(utf8.decoder).join();
                  final data = jsonDecode(responseBody);

                  if (response.statusCode == 200 && data['ok'] == true) {
                    // Login Success
                    final prefs = await SharedPreferences.getInstance();
                    await prefs.setString('hub_ip', baseUrl); // Store full URL as IP
                    await prefs.setString('hub_port', ''); // Clear port as it's in URL
                    await prefs.setString('username', data['username']);
                    if (data['userId'] != null) {
                      await prefs.setString('userId', data['userId'].toString());
                    }
                    if (data['token'] != null) {
                      await prefs.setString('cloud_token', data['token']);
                    }
                    
                    // Handle Hub Selection
                    List<dynamic> hubs = [];
                    if (data['user'] != null && data['user']['hubs'] != null) {
                      hubs = data['user']['hubs'];
                    }

                    if (mounted) {
                      Navigator.pop(context); // Close login dialog
                      
                      if (hubs.isEmpty) {
                        ScaffoldMessenger.of(context).showSnackBar(
                          const SnackBar(content: Text('No hubs linked to this account')),
                        );
                      } else if (hubs.length == 1) {
                        // Auto-select single hub
                        await prefs.setString('hub_id', hubs[0]['id']);
                        await prefs.setString('hub_name', hubs[0]['name']);
                        if (mounted) {
                          Navigator.of(context).pushAndRemoveUntil(
                            MaterialPageRoute(builder: (context) => const MainScreen()),
                            (route) => false,
                          );
                        }
                      } else {
                        // Show Hub Selection Dialog
                        _showHubSelectionDialog(hubs);
                      }
                    }
                  } else {
                    if (mounted) {
                      ScaffoldMessenger.of(context).showSnackBar(
                        SnackBar(content: Text(data['error'] ?? 'Login failed')),
                      );
                    }
                  }
                } catch (e) {
                  if (mounted) {
                    ScaffoldMessenger.of(context).showSnackBar(
                      SnackBar(content: Text('Connection error: $e')),
                    );
                  }
                } finally {
                  if (mounted) setState(() => isLoading = false);
                }
              },
              child: const Text('Login', style: TextStyle(color: Colors.white)),
            ),
          ],
        ),
      ),
    );
  }

  void _showManualConnectDialog() {
    final ipController = TextEditingController();
    final portController = TextEditingController(text: '3000');

    showDialog(
      context: context,
      builder: (context) => AlertDialog(
        backgroundColor: const Color(0xFF1A237E),
        title: Text(t('manual_connect'), style: const TextStyle(color: Colors.white)),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            TextField(
              controller: ipController,
              style: const TextStyle(color: Colors.white),
              decoration: InputDecoration(
                labelText: t('ip_address'),
                hintText: 'e.g. 192.168.1.10 or https://cloud.com',
                labelStyle: const TextStyle(color: Colors.white70),
                hintStyle: const TextStyle(color: Colors.white30),
                enabledBorder: const UnderlineInputBorder(borderSide: BorderSide(color: Colors.white30)),
              ),
            ),
            TextField(
              controller: portController,
              style: const TextStyle(color: Colors.white),
              decoration: const InputDecoration(
                labelText: 'Port (Optional if URL used)',
                labelStyle: TextStyle(color: Colors.white70),
                enabledBorder: UnderlineInputBorder(borderSide: BorderSide(color: Colors.white30)),
              ),
              keyboardType: TextInputType.number,
            ),
          ],
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: Text(t('cancel'), style: const TextStyle(color: Colors.white70)),
          ),
          ElevatedButton(
            style: ElevatedButton.styleFrom(backgroundColor: Colors.cyan),
            onPressed: () {
              if (ipController.text.isNotEmpty) {
                Navigator.pop(context);
                Navigator.of(context).push(
                  MaterialPageRoute(
                    builder: (context) => LoginScreen(
                      hubIp: ipController.text,
                      hubPort: portController.text,
                    ),
                  ),
                );
              }
            },
            child: Text(t('connect'), style: const TextStyle(color: Colors.white)),
          ),
        ],
      ),
    );
  }

  Future<void> _connectToHub(HubInfo hub) async {
    // Navigate to Login Screen with Hub details
    if (mounted) {
      Navigator.of(context).push(
        MaterialPageRoute(
          builder: (context) => LoginScreen(
            hubIp: hub.ip,
            hubPort: hub.port.toString(),
            hubName: hub.name,
          ),
        ),
      );
    }
  }

  void _showHubSelectionDialog(List<dynamic> hubs) {
    showDialog(
      context: context,
      barrierDismissible: false,
      builder: (context) => AlertDialog(
        backgroundColor: const Color(0xFF1A237E),
        title: const Text('Select Hub', style: TextStyle(color: Colors.white)),
        content: SizedBox(
          width: double.maxFinite,
          child: ListView.builder(
            shrinkWrap: true,
            itemCount: hubs.length,
            itemBuilder: (context, index) {
              final hub = hubs[index];
              return ListTile(
                leading: const Icon(Icons.router, color: Colors.cyan),
                title: Text(hub['name'] ?? 'Unknown Hub', style: const TextStyle(color: Colors.white)),
                subtitle: Text(hub['id'] ?? '', style: const TextStyle(color: Colors.white70, fontSize: 12)),
                onTap: () async {
                  final prefs = await SharedPreferences.getInstance();
                  await prefs.setString('hub_id', hub['id']);
                  await prefs.setString('hub_name', hub['name']);
                  
                  if (mounted) {
                    Navigator.pop(context);
                    Navigator.of(context).pushAndRemoveUntil(
                      MaterialPageRoute(builder: (context) => const MainScreen()),
                      (route) => false,
                    );
                  }
                },
              );
            },
          ),
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final textColor = isDark ? Colors.white : Colors.black87;
    final subTextColor = isDark ? Colors.white70 : Colors.black54;
    final iconColor = isDark ? Colors.white : Colors.black87;
    final iconBgColor = isDark ? Colors.white.withValues(alpha: 0.1) : Colors.black.withValues(alpha: 0.05);

    return Scaffold(
      body: GradientBackground(
        child: Column(
          children: [
            const SizedBox(height: 60),
            // Animated Logo / Icon
            ScaleTransition(
              scale: _pulseAnimation,
              child: Container(
                padding: const EdgeInsets.all(20),
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  color: iconBgColor,
                  boxShadow: [
                    BoxShadow(
                      color: Colors.cyan.withValues(alpha: 0.3),
                      blurRadius: 20,
                      spreadRadius: 5,
                    )
                  ],
                ),
                child: Icon(
                  Icons.home_rounded,
                  size: 60,
                  color: iconColor,
                ),
              ),
            ),
            const SizedBox(height: 20),
            Text(
              'DelovaHome',
              style: TextStyle(
                fontSize: 32,
                fontWeight: FontWeight.bold,
                color: textColor,
                letterSpacing: 1.5,
              ),
            ),
            const SizedBox(height: 10),
            Text(
              _isScanning ? t('searching_hubs') : 'Scan complete',
              style: TextStyle(
                color: subTextColor,
                fontSize: 16,
              ),
            ),
            const SizedBox(height: 40),
            
            // Hub List
            Expanded(
              child: _hubs.isEmpty
                  ? Center(
                      child: _isScanning
                          ? const CircularProgressIndicator(color: Colors.cyan)
                          : Column(
                              mainAxisAlignment: MainAxisAlignment.center,
                              children: [
                                Icon(Icons.wifi_off, color: subTextColor, size: 48),
                                const SizedBox(height: 16),
                                Text(
                                  t('no_results'),
                                  style: TextStyle(color: subTextColor),
                                ),
                                const SizedBox(height: 10),
                                Text(
                                  'Check "Local Network" permission in Settings',
                                  textAlign: TextAlign.center,
                                  style: TextStyle(color: subTextColor, fontSize: 12),
                                ),
                                TextButton(
                                  onPressed: () => Geolocator.openAppSettings(),
                                  child: const Text('Open Settings'),
                                ),
                                TextButton(
                                  onPressed: _startDiscovery,
                                  child: Text(t('retry'), style: const TextStyle(color: Colors.cyan)),
                                ),
                              ],
                            ),
                    )
                  : ListView.builder(
                      padding: const EdgeInsets.symmetric(horizontal: 20),
                      itemCount: _hubs.length,
                      itemBuilder: (context, index) {
                        final hub = _hubs[index];
                        return Padding(
                          padding: const EdgeInsets.only(bottom: 16),
                          child: GlassCard(
                            child: ListTile(
                              contentPadding: const EdgeInsets.all(16),
                              leading: Container(
                                padding: const EdgeInsets.all(10),
                                decoration: BoxDecoration(
                                  color: Colors.cyan.withValues(alpha: 0.2),
                                  shape: BoxShape.circle,
                                ),
                                child: const Icon(Icons.router, color: Colors.white),
                              ),
                              title: Text(
                                hub.name,
                                style: TextStyle(
                                  color: textColor,
                                  fontWeight: FontWeight.bold,
                                  fontSize: 18,
                                ),
                              ),
                              subtitle: Text(
                                '${hub.ip}:${hub.port}',
                                style: TextStyle(color: subTextColor),
                              ),
                              trailing: Icon(Icons.arrow_forward_ios, color: subTextColor),
                              onTap: () => _connectToHub(hub),
                            ),
                          ),
                        );
                      },
                    ),
            ),
            
            // Manual Connect Button
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 10),
              child: Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  ElevatedButton.icon(
                    style: ElevatedButton.styleFrom(
                      backgroundColor: Colors.cyan.withValues(alpha: 0.2),
                      foregroundColor: textColor,
                      padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 12),
                    ),
                    onPressed: _showManualConnectDialog,
                    icon: const Icon(Icons.add_link),
                    label: Text(
                      t('manual_connect'),
                      style: const TextStyle(fontSize: 16, fontWeight: FontWeight.bold),
                    ),
                  ),
                  const SizedBox(width: 10),
                  ElevatedButton.icon(
                    style: ElevatedButton.styleFrom(
                      backgroundColor: Colors.purple.withValues(alpha: 0.2),
                      foregroundColor: textColor,
                      padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 12),
                    ),
                    onPressed: _showCloudLoginDialog,
                    icon: const Icon(Icons.cloud),
                    label: const Text(
                      'Cloud Login',
                      style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold),
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 20),
          ],
        ),
      ),
    );
  }
}

class HubInfo {
  final String name;
  final String ip;
  final int port;
  final String? id;
  
  HubInfo({required this.name, required this.ip, required this.port, this.id});
}
