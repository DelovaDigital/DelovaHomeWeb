import 'package:flutter/material.dart';
import '../services/api_service.dart';

class SettingsTab extends StatefulWidget {
  const SettingsTab({super.key});

  @override
  State<SettingsTab> createState() => _SettingsTabState();
}

class _SettingsTabState extends State<SettingsTab> {
  final _ipController = TextEditingController();
  final _apiService = ApiService();
  bool _isCheckingUpdate = false;
  bool _isUpdating = false;

  @override
  void initState() {
    super.initState();
    _loadIp();
  }

  Future<void> _loadIp() async {
    final url = await _apiService.getBaseUrl();
    final uri = Uri.parse(url);
    _ipController.text = uri.host;
  }

  Future<void> _saveIp() async {
    await _apiService.setHubIp(_ipController.text);
    if (mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Hub IP Saved')),
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
    setState(() => _isUpdating = true);
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
    } finally {
      if (mounted) setState(() => _isUpdating = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.all(16.0),
      child: ListView(
        children: [
          const Text('Connection Settings', style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold)),
          const SizedBox(height: 10),
          TextField(
            controller: _ipController,
            decoration: const InputDecoration(
              labelText: 'Hub IP Address',
              hintText: '192.168.0.xxx',
              border: OutlineInputBorder(),
            ),
            keyboardType: TextInputType.number,
          ),
          const SizedBox(height: 10),
          ElevatedButton(
            onPressed: _saveIp,
            child: const Text('Save IP'),
          ),
          const Divider(height: 40),
          const Text('System Management', style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold)),
          const SizedBox(height: 10),
          ListTile(
            leading: const Icon(Icons.system_update),
            title: const Text('Check for Updates'),
            subtitle: const Text('Check if a new version of Delova Home is available'),
            trailing: _isCheckingUpdate || _isUpdating
                ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2))
                : const Icon(Icons.arrow_forward_ios),
            onTap: (_isCheckingUpdate || _isUpdating) ? null : _checkForUpdates,
          ),
        ],
      ),
    );
  }
}
