import 'package:delovahome/main.dart';
import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:package_info_plus/package_info_plus.dart';
import '../services/api_service.dart';
import 'hub_discovery_screen.dart';
import 'manage_users_screen.dart';

class SettingsTab extends StatefulWidget {
  const SettingsTab({super.key});

  @override
  State<SettingsTab> createState() => _SettingsTabState();
}

class _SettingsTabState extends State<SettingsTab> {
  final _apiService = ApiService();
  bool _isCheckingUpdate = false;
  
  String _hubIp = 'Unknown';
  String _hubId = 'Unknown';
  String _hubVersion = 'Unknown';
  String _appVersion = 'Unknown';

  @override
  void initState() {
    super.initState();
    _loadInfo();
  }

  Future<void> _loadInfo() async {
    final prefs = await SharedPreferences.getInstance();
    final packageInfo = await PackageInfo.fromPlatform();
    
    setState(() {
      _hubIp = prefs.getString('hub_ip') ?? 'Unknown';
      _hubId = prefs.getString('hub_id') ?? 'Unknown';
      _appVersion = packageInfo.version;
    });

    // Fetch Hub Info from API
    try {
      final info = await _apiService.getSystemInfo();
      if (mounted) {
        setState(() {
          _hubVersion = info['version'] ?? 'Unknown';
          if (info['hubId'] != null) _hubId = info['hubId'];
        });
      }
    } catch (e) {
      debugPrint('Error fetching hub info: $e');
    }
  }

  Future<void> _disconnect() async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.remove('hub_ip');
    await prefs.remove('hub_port');
    await prefs.remove('hub_id');
    
    if (mounted) {
      Navigator.of(context).pushReplacement(
        MaterialPageRoute(builder: (context) => const HubDiscoveryScreen()),
      );
    }
  }

  Future<void> _checkForUpdates() async {
    setState(() => _isCheckingUpdate = true);
    try {
      final result = await _apiService.checkUpdate();
      if (mounted) {
        final canUpdate = result['canUpdate'] == true;
        final message = result['message'] ?? '';
        
        showDialog(
          context: context,
          builder: (context) => AlertDialog(
            title: Text(canUpdate ? 'Update Available' : 'System Up to Date'),
            content: Text(canUpdate ? 'A new version is available.\n$message' : 'You are on the latest version.'),
            actions: [
              TextButton(onPressed: () => Navigator.pop(context), child: const Text('Close')),
              if (canUpdate)
                ElevatedButton(
                  onPressed: () {
                    Navigator.pop(context);
                    _performUpdate();
                  },
                  child: const Text('Update Now'),
                ),
            ],
          ),
        );
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Error: $e')));
      }
    } finally {
      if (mounted) setState(() => _isCheckingUpdate = false);
    }
  }

  Future<void> _performUpdate() async {
    try {
      final result = await _apiService.updateSystem();
      if (mounted) {
        showDialog(
          context: context,
          builder: (context) => AlertDialog(
            title: const Text('Update Started'),
            content: Text(result['message'] ?? 'System is updating...'),
            actions: [
              TextButton(onPressed: () => Navigator.pop(context), child: const Text('OK')),
            ],
          ),
        );
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Update Error: $e')));
      }
    }
  }

  void _showAddNasDialog() {
    final nameController = TextEditingController();
    final ipController = TextEditingController();
    final userController = TextEditingController();
    final passController = TextEditingController();
    String type = 'smb';
    bool isLoading = false;
    String status = '';

    showDialog(
      context: context,
      builder: (context) => StatefulBuilder(
        builder: (context, setState) {
          return AlertDialog(
            title: const Text('Add NAS'),
            content: SingleChildScrollView(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  TextField(controller: nameController, decoration: const InputDecoration(labelText: 'Name')),
                  const SizedBox(height: 10),
                  TextField(controller: ipController, decoration: const InputDecoration(labelText: 'IP Address')),
                  const SizedBox(height: 10),
                  DropdownButtonFormField<String>(
                    value: type,
                    items: const [
                      DropdownMenuItem(value: 'smb', child: Text('SMB (Windows/Mac)')),
                      DropdownMenuItem(value: 'nfs', child: Text('NFS (Linux)')),
                    ],
                    onChanged: (v) => setState(() => type = v!),
                    decoration: const InputDecoration(labelText: 'Type'),
                  ),
                  const SizedBox(height: 10),
                  TextField(controller: userController, decoration: const InputDecoration(labelText: 'Username')),
                  const SizedBox(height: 10),
                  TextField(controller: passController, decoration: const InputDecoration(labelText: 'Password'), obscureText: true),
                  const SizedBox(height: 10),
                  if (isLoading) const CircularProgressIndicator()
                  else ElevatedButton(
                    onPressed: () async {
                      if (nameController.text.isEmpty || ipController.text.isEmpty) return;
                      setState(() { isLoading = true; status = 'Adding...'; });
                      try {
                        final data = {
                          'name': nameController.text,
                          'ip': ipController.text,
                          'type': type,
                          'username': userController.text,
                          'password': passController.text,
                        };
                        final res = await _apiService.addNas(data);
                        if (res['ok'] == true) {
                          Navigator.pop(context);
                          ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('NAS Added!')));
                        } else {
                          setState(() { status = 'Error: ${res['message']}'; isLoading = false; });
                        }
                      } catch (e) {
                        setState(() { status = 'Error: $e'; isLoading = false; });
                      }
                    },
                    child: const Text('Add NAS'),
                  ),
                  if (status.isNotEmpty) ...[
                    const SizedBox(height: 10),
                    Text(status, style: TextStyle(color: status.startsWith('Error') ? Colors.red : Colors.blue)),
                  ],
                ],
              ),
            ),
            actions: [
              TextButton(onPressed: () => Navigator.pop(context), child: const Text('Close')),
            ],
          );
        },
      ),
    );
  }

  void _showAndroidTvPairingDialog() {
    final ipController = TextEditingController();
    final pinController = TextEditingController();
    String status = '';
    bool isLoading = false;

    showDialog(
      context: context,
      builder: (context) => StatefulBuilder(
        builder: (context, setState) {
          return AlertDialog(
            title: const Text('Android TV Pairing'),
            content: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                const Text('Enter the IP of the Android TV and the PIN displayed on the screen.'),
                const SizedBox(height: 10),
                TextField(
                  controller: ipController,
                  decoration: const InputDecoration(labelText: 'Android TV IP Address', border: OutlineInputBorder()),
                ),
                const SizedBox(height: 10),
                TextField(
                  controller: pinController,
                  decoration: const InputDecoration(labelText: 'PIN Code', border: OutlineInputBorder()),
                  keyboardType: TextInputType.text,
                ),
                const SizedBox(height: 10),
                if (isLoading) const CircularProgressIndicator()
                else ElevatedButton(
                  onPressed: () async {
                    if (ipController.text.isEmpty || pinController.text.isEmpty) return;
                    setState(() { isLoading = true; status = 'Submitting...'; });
                    try {
                      final res = await _apiService.pairDevice(ipController.text, pinController.text);
                      if (res['success'] == true) {
                        Navigator.pop(context);
                        ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Pairing Submitted!')));
                      } else {
                        setState(() { status = 'Error: ${res['error'] ?? 'Unknown error'}'; isLoading = false; });
                      }
                    } catch (e) {
                      setState(() { status = 'Error: $e'; isLoading = false; });
                    }
                  },
                  child: const Text('Pair Device'),
                ),
                if (status.isNotEmpty) ...[
                  const SizedBox(height: 10),
                  Text(status, style: TextStyle(color: status.startsWith('Error') ? Colors.red : Colors.blue)),
                ],
              ],
            ),
            actions: [
              TextButton(onPressed: () => Navigator.pop(context), child: const Text('Close')),
            ],
          );
        },
      ),
    );
  }

  void _showAppleTvPairingDialog() {
    final ipController = TextEditingController();
    final pinController = TextEditingController();
    String status = '';
    bool isStep2 = false;
    bool isLoading = false;

    showDialog(
      context: context,
      builder: (context) => StatefulBuilder(
        builder: (context, setState) {
          return AlertDialog(
            title: const Text('Apple TV Pairing'),
            content: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                if (!isStep2) ...[
                  TextField(
                    controller: ipController,
                    decoration: const InputDecoration(labelText: 'Apple TV IP Address', border: OutlineInputBorder()),
                  ),
                  const SizedBox(height: 10),
                  if (isLoading) const CircularProgressIndicator()
                  else ElevatedButton(
                    onPressed: () async {
                      if (ipController.text.isEmpty) return;
                      setState(() { isLoading = true; status = 'Connecting...'; });
                      try {
                        final res = await _apiService.startPairing(ipController.text);
                        if (res['ok'] == true && res['status'] == 'waiting_for_pin') {
                          setState(() { isStep2 = true; status = 'Enter PIN shown on TV'; isLoading = false; });
                        } else {
                          setState(() { status = 'Error: ${res['message']}'; isLoading = false; });
                        }
                      } catch (e) {
                        setState(() { status = 'Error: $e'; isLoading = false; });
                      }
                    },
                    child: const Text('Start Pairing'),
                  ),
                ] else ...[
                  TextField(
                    controller: pinController,
                    decoration: const InputDecoration(labelText: 'PIN Code', border: OutlineInputBorder()),
                    keyboardType: TextInputType.number,
                  ),
                  const SizedBox(height: 10),
                  if (isLoading) const CircularProgressIndicator()
                  else ElevatedButton(
                    onPressed: () async {
                      if (pinController.text.isEmpty) return;
                      setState(() { isLoading = true; status = 'Verifying PIN...'; });
                      try {
                        final res = await _apiService.submitPairingPin(pinController.text);
                        if (res['ok'] == true) {
                          Navigator.pop(context);
                          ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Pairing Successful!')));
                        } else {
                          setState(() { status = 'Error: ${res['message']}'; isLoading = false; });
                        }
                      } catch (e) {
                        setState(() { status = 'Error: $e'; isLoading = false; });
                      }
                    },
                    child: const Text('Submit PIN'),
                  ),
                ],
                if (status.isNotEmpty) ...[
                  const SizedBox(height: 10),
                  Text(status, style: TextStyle(color: status.startsWith('Error') ? Colors.red : Colors.blue)),
                ],
              ],
            ),
            actions: [
              TextButton(onPressed: () => Navigator.pop(context), child: const Text('Close')),
            ],
          );
        },
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final appState = DelovaHome.of(context);
    final currentTheme = appState?.themeModeValue ?? ThemeMode.system;

    return Scaffold(
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          const Text(
            'Account & Hub',
            style: TextStyle(color: Colors.grey, fontSize: 14, fontWeight: FontWeight.bold),
          ),
          const SizedBox(height: 10),
          _buildInfoCard('Connected Hub', _hubIp, Icons.router),
          _buildInfoCard('Hub ID', _hubId, Icons.fingerprint),
          _buildInfoCard('Hub Version', _hubVersion, Icons.info_outline),
          _buildInfoCard('App Version', _appVersion, Icons.mobile_friendly),
          
          const SizedBox(height: 20),
          ElevatedButton.icon(
            icon: const Icon(Icons.logout),
            label: const Text('Disconnect / Switch Hub'),
            style: ElevatedButton.styleFrom(
              backgroundColor: Colors.red[900],
              foregroundColor: Colors.white,
            ),
            onPressed: _disconnect,
          ),

          const SizedBox(height: 30),
          const Text(
            'System Management',
            style: TextStyle(color: Colors.grey, fontSize: 14, fontWeight: FontWeight.bold),
          ),
          const SizedBox(height: 10),
          ListTile(
            tileColor: Theme.of(context).cardColor,
            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
            leading: const Icon(Icons.brightness_6, color: Colors.amber),
            title: const Text('Thema', style: TextStyle(color: Colors.white)),
            subtitle: Text(currentTheme == ThemeMode.system ? 'Systeem' : (currentTheme == ThemeMode.dark ? 'Donker' : 'Licht'), style: const TextStyle(color: Colors.grey)),
            trailing: const Icon(Icons.arrow_forward_ios, size: 16, color: Colors.grey),
            onTap: () async {
              final choice = await showDialog<ThemeMode>(
                context: context,
                builder: (context) => SimpleDialog(
                  title: const Text('Kies thema'),
                  children: [
                    SimpleDialogOption(onPressed: () => Navigator.pop(context, ThemeMode.system), child: const Text('Systeem')),
                    SimpleDialogOption(onPressed: () => Navigator.pop(context, ThemeMode.dark), child: const Text('Donker')),
                    SimpleDialogOption(onPressed: () => Navigator.pop(context, ThemeMode.light), child: const Text('Licht')),
                  ],
                ),
              );

              if (choice != null) {
                await appState?.setThemeMode(choice);
                if (mounted) setState(() {});
              }
            },
          ),
          const SizedBox(height: 10),
          ListTile(
            tileColor: Colors.grey[900],
            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
            leading: const Icon(Icons.people, color: Colors.green),
            title: const Text('Manage Users', style: TextStyle(color: Colors.white)),
            trailing: const Icon(Icons.arrow_forward_ios, size: 16, color: Colors.grey),
            onTap: () {
              Navigator.of(context).push(
                MaterialPageRoute(builder: (context) => const ManageUsersScreen()),
              );
            },
          ),
          const SizedBox(height: 10),
          ListTile(
            tileColor: Colors.grey[900],
            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
            leading: const Icon(Icons.system_update, color: Colors.blue),
            title: const Text('Check for Updates', style: TextStyle(color: Colors.white)),
            trailing: _isCheckingUpdate 
              ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2))
              : const Icon(Icons.arrow_forward_ios, size: 16, color: Colors.grey),
            onTap: _isCheckingUpdate ? null : _checkForUpdates,
          ),
          const SizedBox(height: 10),
          ListTile(
            tileColor: Colors.grey[900],
            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
            leading: const Icon(Icons.tv, color: Colors.grey),
            title: const Text('Pair Apple TV', style: TextStyle(color: Colors.white)),
            trailing: const Icon(Icons.arrow_forward_ios, size: 16, color: Colors.grey),
            onTap: _showAppleTvPairingDialog,
          ),
          const SizedBox(height: 10),
          ListTile(
            tileColor: Colors.grey[900],
            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
            leading: const Icon(Icons.tv, color: Colors.green),
            title: const Text('Pair Android TV', style: TextStyle(color: Colors.white)),
            trailing: const Icon(Icons.arrow_forward_ios, size: 16, color: Colors.grey),
            onTap: _showAndroidTvPairingDialog,
          ),
          const SizedBox(height: 10),
          ListTile(
            tileColor: Colors.grey[900],
            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
            leading: const Icon(Icons.storage, color: Colors.orange),
            title: const Text('Add NAS', style: TextStyle(color: Colors.white)),
            trailing: const Icon(Icons.arrow_forward_ios, size: 16, color: Colors.grey),
            onTap: _showAddNasDialog,
          ),
        ],
      ),
    );
  }

  Widget _buildInfoCard(String title, String value, IconData icon) {
    return Card(
      color: Colors.grey[900],
      margin: const EdgeInsets.only(bottom: 8),
      child: ListTile(
        leading: Icon(icon, color: Colors.amber),
        title: Text(title, style: const TextStyle(color: Colors.grey, fontSize: 12)),
        subtitle: Text(value, style: const TextStyle(color: Colors.white, fontSize: 16)),
      ),
    );
  }
}
