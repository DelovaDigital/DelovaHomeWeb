import 'dart:io';
import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:nsd/nsd.dart';
import 'package:shared_preferences/shared_preferences.dart';
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
  final List<Service> _hubs = [];
  Discovery? _discovery;
  bool _isScanning = false;
  late AnimationController _pulseController;
  late Animation<double> _pulseAnimation;
  String _lang = 'nl';

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
    _startDiscovery();
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
    setState(() => _isScanning = true);

    try {
      // Search for specific service type first (more reliable)
      _discovery = await startDiscovery('_delovahome._tcp');
      _discovery!.addServiceListener((service, status) {
        if (status == ServiceStatus.found) {
           debugPrint('Found DelovaHome service: ${service.name}');
           setState(() {
              if (!_hubs.any((h) => h.name == service.name)) {
                _hubs.add(service);
              }
            });
        }
      });

      // Also search for _http._tcp as fallback
      final httpDiscovery = await startDiscovery('_http._tcp');
      httpDiscovery.addServiceListener((service, status) {
        if (status == ServiceStatus.found) {
          // debugPrint('Found HTTP service: ${service.name}');
          
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
                labelStyle: const TextStyle(color: Colors.white70),
                enabledBorder: const UnderlineInputBorder(borderSide: BorderSide(color: Colors.white30)),
              ),
            ),
            TextField(
              controller: portController,
              style: const TextStyle(color: Colors.white),
              decoration: const InputDecoration(
                labelText: 'Port',
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
                                hub.name ?? 'Unknown Hub',
                                style: TextStyle(
                                  color: textColor,
                                  fontWeight: FontWeight.bold,
                                  fontSize: 18,
                                ),
                              ),
                              subtitle: Text(
                                '${hub.host}:${hub.port}',
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
              padding: const EdgeInsets.all(20),
              child: TextButton.icon(
                onPressed: _showManualConnectDialog,
                icon: Icon(Icons.add_link, color: subTextColor),
                label: Text(
                  t('manual_connect'),
                  style: TextStyle(color: subTextColor, fontSize: 16),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
