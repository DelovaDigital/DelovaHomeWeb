import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:package_info_plus/package_info_plus.dart';
import '../services/api_service.dart';
import 'hub_discovery_screen.dart';

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

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.black,
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
            tileColor: Colors.grey[900],
            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
            leading: const Icon(Icons.system_update, color: Colors.blue),
            title: const Text('Check for Updates', style: TextStyle(color: Colors.white)),
            trailing: _isCheckingUpdate 
              ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2))
              : const Icon(Icons.arrow_forward_ios, size: 16, color: Colors.grey),
            onTap: _isCheckingUpdate ? null : _checkForUpdates,
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
