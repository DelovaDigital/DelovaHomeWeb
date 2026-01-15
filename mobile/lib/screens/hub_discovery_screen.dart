import 'dart:io';
import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:nsd/nsd.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:geolocator/geolocator.dart' hide ServiceStatus; // For openAppSettings
import 'login_screen.dart';
import 'main_screen.dart';
import 'hub_login_screen.dart';
import '../utils/app_translations.dart';

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
    final hubId = prefs.getString('hub_id');
    final cloudToken = prefs.getString('cloud_token');
    // final username = prefs.getString('username'); // Unused

    if (hubIp != null && hubPort != null && userId != null) {
      debugPrint('Found stored credentials. Verifying session...');
      try {
        final client = HttpClient();
        client.badCertificateCallback = (cert, host, port) => true;
        client.connectionTimeout = const Duration(seconds: 5);
        
        String baseUrl;
        if (hubIp.startsWith('http://') || hubIp.startsWith('https://')) {
          baseUrl = hubIp;
        } else {
          baseUrl = 'https://$hubIp:$hubPort';
        }

        final url = Uri.parse('$baseUrl/api/me?userId=$userId');
        final request = await client.getUrl(url);
        
        // Add Cloud Headers if available
        if (cloudToken != null) {
          request.headers.set('Authorization', 'Bearer $cloudToken');
        }
        if (hubId != null) {
          request.headers.set('x-hub-id', hubId);
        }
        // x-delova-username is injected by Cloud Proxy if needed

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

    // Auto-stop after 15 seconds to allow UI to show Retry button
    Future.delayed(const Duration(seconds: 15), () {
      if (mounted && _isScanning) {
        _stopDiscovery();
      }
    });

    // 1. Start UDP Discovery (Fast & Reliable on local subnet)
    _startUDPDiscovery();

    // 2. Start mDNS Discovery (Standard)
    try {
      // Search for specific service type first (more reliable)
      _discovery = await startDiscovery('_delovahome._tcp');
      if (!mounted) return;
      _discovery!.addServiceListener((service, status) {
        if (status == ServiceStatus.found) {
           _addServiceToHubs(service);
        }
      });

      // Also search for _http._tcp as fallback
      final httpDiscovery = await startDiscovery('_http._tcp');
      if (!mounted) return;
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
    final urlController = TextEditingController(text: 'https://87.64.85.182:4000');
    final emailController = TextEditingController();
    final passwordController = TextEditingController();
    bool isLoading = false;

    showDialog(
      context: context,
      builder: (context) => StatefulBuilder(
        builder: (context, setState) {
          return AlertDialog(
            title: Text(t('cloud_login')),
            content: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                Visibility(
                  visible: false,
                  child: TextField(
                    controller: urlController,
                    decoration: InputDecoration(
                      labelText: t('cloud_url'),
                      hintText: 'https://cloud.delovahome.com',
                      border: const OutlineInputBorder(),
                    ),
                  ),
                ),
                TextField(
                  controller: emailController,
                  decoration: InputDecoration(
                    labelText: t('email_or_username'),
                    border: const OutlineInputBorder(),
                    prefixIcon: const Icon(Icons.person),
                  ),
                ),
                const SizedBox(height: 16),
                TextField(
                  controller: passwordController,
                  obscureText: true,
                  decoration: InputDecoration(
                    labelText: t('password'),
                    border: const OutlineInputBorder(),
                    prefixIcon: const Icon(Icons.lock),
                  ),
                ),
                if (isLoading)
                  const Padding(
                    padding: EdgeInsets.only(top: 16.0),
                    child: CircularProgressIndicator(),
                  ),
              ],
            ),
            actions: [
              TextButton(
                onPressed: () => Navigator.pop(context),
                child: Text(t('cancel')),
              ),
              FilledButton(
                onPressed: isLoading ? null : () async {
                  if (urlController.text.isEmpty || emailController.text.isEmpty || passwordController.text.isEmpty) {
                    return;
                  }
                  
                  setState(() => isLoading = true);
                  
                  try {
                    // Construct URL
                    String baseUrl = urlController.text.trim();
                    if (!baseUrl.toLowerCase().startsWith('http')) {
                      baseUrl = 'https://$baseUrl';
                    }
                    // Remove trailing slash
                    if (baseUrl.endsWith('/')) baseUrl = baseUrl.substring(0, baseUrl.length - 1);

                    // Use Cloud Auth Endpoint
                    final url = Uri.parse('$baseUrl/api/auth/login');
                    
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

                    // Check for success (Cloud API uses 'success', Hub uses 'ok')
                    if (response.statusCode == 200 && (data['success'] == true || data['ok'] == true)) {
                      // Login Success
                      final prefs = await SharedPreferences.getInstance();
                      
                      // Store Cloud Token
                      if (data['token'] != null) {
                        await prefs.setString('cloud_token', data['token']);
                      }
                      
                      // Store User Info
                      if (data['user'] != null) {
                          await prefs.setString('username', data['user']['username'] ?? emailController.text);
                          if (data['user']['id'] != null) {
                              await prefs.setString('userId', data['user']['id'].toString());
                          }
                      }

                      // Handle Hub Selection
                      List<dynamic> hubs = [];
                      if (data['user'] != null && data['user']['hubs'] != null) {
                        hubs = data['user']['hubs'];
                      } else if (data['hubs'] != null) {
                          hubs = data['hubs'];
                      }

                      if (context.mounted) {
                        Navigator.pop(context); // Close login dialog
                        
                        if (hubs.isEmpty) {
                          ScaffoldMessenger.of(context).showSnackBar(
                            SnackBar(content: Text(t('no_hubs_linked'))),
                          );
                        } else if (hubs.length == 1) {
                          // Auto-select single hub
                          // BUT we still need to login to the Hub itself!
                          // So we navigate to HubLoginScreen
                          
                          // Construct Proxy URL for Cloud Connection
                          final proxyUrl = '$baseUrl/api/proxy/${hubs[0]['id']}';

                          if (context.mounted) {
                            Navigator.of(context).push(
                              MaterialPageRoute(
                                builder: (context) => HubLoginScreen(
                                  hubIp: proxyUrl,
                                  hubPort: '',
                                  hubId: hubs[0]['id'],
                                  hubName: hubs[0]['name'],
                                  cloudToken: data['token'],
                                ),
                              ),
                            );
                          }
                        } else {
                          // Show Hub Selection Dialog
                          // We need to pass baseUrl to the dialog so it can save it
                          _showHubSelectionDialog(hubs, cloudUrl: baseUrl, cloudToken: data['token']);
                        }
                      }
                    } else {
                      if (context.mounted) {
                        ScaffoldMessenger.of(context).showSnackBar(
                          SnackBar(content: Text(data['error'] ?? data['message'] ?? 'Login failed')),
                        );
                      }
                    }
                  } catch (e) {
                    if (context.mounted) {
                      ScaffoldMessenger.of(context).showSnackBar(
                        SnackBar(content: Text('${t('connection_error')}: $e')),
                      );
                    }
                  } finally {
                    if (mounted) setState(() => isLoading = false);
                  }
                },
                child: const Text('Login'),
              ),
            ],
          );
        }
      ),
    );
  }

  void _connectToCloudHub() {
    // Use the existing Cloud Login Dialog which handles Email/Password -> Hub Selection -> Hub Login
    _showCloudLoginDialog();
  }

  void _showManualConnectDialog() {
    final ipController = TextEditingController();
    final portController = TextEditingController(text: '3000');

    showDialog(
      context: context,
      builder: (context) => AlertDialog(
        title: Text(t('manual_connect')),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            TextField(
              controller: ipController,
              decoration: InputDecoration(
                labelText: t('ip_address'),
                hintText: 'e.g. 192.168.1.10',
                border: const OutlineInputBorder(),
                prefixIcon: const Icon(Icons.lan),
              ),
            ),
            const SizedBox(height: 16),
            TextField(
              controller: portController,
              decoration: const InputDecoration(
                labelText: 'Port',
                border: OutlineInputBorder(),
                prefixIcon: Icon(Icons.numbers),
              ),
              keyboardType: TextInputType.number,
            ),
          ],
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: Text(t('cancel')),
          ),
          FilledButton.tonal(
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
            child: Text(t('connect')),
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

  void _showHubSelectionDialog(List<dynamic> hubs, {String? cloudUrl, String? cloudToken}) {
    showDialog(
      context: context,
      barrierDismissible: false,
      builder: (context) => AlertDialog(
        title: const Text('Select Hub'),
        content: SizedBox(
          width: double.maxFinite,
          child: ListView.builder(
            shrinkWrap: true,
            itemCount: hubs.length,
            itemBuilder: (context, index) {
              final hub = hubs[index];
              return ListTile(
                leading: const Icon(Icons.router),
                title: Text(hub['name'] ?? 'Unknown Hub'),
                subtitle: Text(hub['id'] ?? ''),
                onTap: () async {
                  if (cloudUrl != null && cloudToken != null) {
                      // Cloud Flow: Go to Hub Login
                      Navigator.pop(context);
                      
                      // Construct Proxy URL for Cloud Connection
                      final proxyUrl = '$cloudUrl/api/proxy/${hub['id']}';

                      Navigator.of(context).push(
                        MaterialPageRoute(
                          builder: (context) => HubLoginScreen(
                            hubIp: proxyUrl,
                            hubPort: '',
                            hubId: hub['id'],
                            hubName: hub['name'],
                            cloudToken: cloudToken,
                          ),
                        ),
                      );
                  } else {
                      // Local Flow (Should not happen here usually, but fallback)
                      final prefs = await SharedPreferences.getInstance();
                      await prefs.setString('hub_id', hub['id']);
                      await prefs.setString('hub_name', hub['name']);
                      
                      if (context.mounted) {
                        Navigator.pop(context);
                        Navigator.of(context).pushAndRemoveUntil(
                          MaterialPageRoute(builder: (context) => const MainScreen()),
                          (route) => false,
                        );
                      }
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
    final size = MediaQuery.of(context).size;
    final theme = Theme.of(context);

    return Scaffold(
      body: SafeArea(
        child: Center(
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 600),
            child: Column(
              children: [
                SizedBox(height: size.height * 0.08), // Dynamic top spacing
                // Animated Logo / Icon
                ScaleTransition(
                  scale: _pulseAnimation,
                  child: Container(
                    padding: EdgeInsets.all(size.height * 0.025), // Dynamic padding
                    decoration: BoxDecoration(
                      shape: BoxShape.circle,
                      color: theme.colorScheme.primaryContainer,
                    ),
                    child: Icon(
                      Icons.home_rounded,
                      size: size.height * 0.08, // Dynamic icon size
                      color: theme.colorScheme.onPrimaryContainer,
                    ),
                  ),
                ),
                SizedBox(height: size.height * 0.03),
                Text(
                  'DelovaHome',
                  style: theme.textTheme.headlineLarge?.copyWith(
                    fontWeight: FontWeight.bold,
                    letterSpacing: 1.5,
                  ),
                ),
                const SizedBox(height: 10),
                Text(
                  _isScanning ? t('searching_hubs') : t('scan_complete'),
                  style: theme.textTheme.bodyLarge?.copyWith(
                    color: theme.colorScheme.onSurfaceVariant,
                  ),
                ),
                SizedBox(height: size.height * 0.05),
                
                // Hub List
                Expanded(
                  child: _hubs.isEmpty
                      ? Center(
                          child: _isScanning
                              ? const CircularProgressIndicator()
                              : Column(
                                  mainAxisAlignment: MainAxisAlignment.center,
                                  children: [
                                    Icon(Icons.wifi_off, color: theme.colorScheme.outline, size: 48),
                                    const SizedBox(height: 16),
                                    Text(
                                      t('no_results'),
                                      style: theme.textTheme.bodyLarge?.copyWith(
                                        color: theme.colorScheme.onSurfaceVariant,
                                      ),
                                    ),
                                    const SizedBox(height: 10),
                                    Text(
                                      t('check_permission'),
                                      textAlign: TextAlign.center,
                                      style: theme.textTheme.bodySmall?.copyWith(
                                        color: theme.colorScheme.onSurfaceVariant,
                                      ),
                                    ),
                                    TextButton(
                                      onPressed: () => Geolocator.openAppSettings(),
                                      child: Text(t('open_settings')),
                                    ),
                                    FilledButton.tonal(
                                      onPressed: _startDiscovery,
                                      child: Text(t('retry')),
                                    ),
                                  ],
                                ),
                        )
                      : RefreshIndicator(
                          onRefresh: () async {
                             await _stopDiscovery();
                             _startDiscovery();
                          },
                          child: ListView.builder(
                            physics: const AlwaysScrollableScrollPhysics(),
                            padding: const EdgeInsets.symmetric(horizontal: 20),
                            itemCount: _hubs.length,
                            itemBuilder: (context, index) {
                              final hub = _hubs[index];
                              return Padding(
                              padding: const EdgeInsets.only(bottom: 16),
                              child: Card(
                                child: ListTile(
                                  contentPadding: const EdgeInsets.all(16),
                                  leading: Container(
                                    padding: const EdgeInsets.all(10),
                                    decoration: BoxDecoration(
                                      color: theme.colorScheme.primaryContainer,
                                      shape: BoxShape.circle,
                                    ),
                                    child: Icon(Icons.router, color: theme.colorScheme.onPrimaryContainer),
                                  ),
                                  title: Text(
                                    hub.name,
                                    style: theme.textTheme.titleMedium?.copyWith(
                                      fontWeight: FontWeight.bold,
                                    ),
                                  ),
                                  subtitle: Text(
                                    '${hub.ip}:${hub.port}',
                                    style: theme.textTheme.bodyMedium?.copyWith(
                                      color: theme.colorScheme.onSurfaceVariant,
                                    ),
                                  ),
                                  trailing: const Icon(Icons.arrow_forward_ios, size: 16),
                                  onTap: () => _connectToHub(hub),
                                ),
                              ),
                            );
                          },
                        ),
                ),
              ),
                
                // Manual Connect Button
                Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 10),
                  child: Wrap(
                    alignment: WrapAlignment.center,
                    spacing: 10,
                    runSpacing: 10,
                    children: [
                      FilledButton.icon(
                        onPressed: _connectToCloudHub,
                        icon: const Icon(Icons.cloud),
                        label: const Text('Connect to Cloud'),
                      ),
                      OutlinedButton.icon(
                        onPressed: _showManualConnectDialog,
                        icon: const Icon(Icons.lan),
                        label: const Text('Connect Locally'),
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 20),
              ],
            ),
          ),
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
