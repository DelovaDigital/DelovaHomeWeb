import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';
import '../../services/api_service.dart';
import '../../widgets/gradient_background.dart';
import '../../widgets/glass_card.dart';

class KnxSettingsScreen extends StatefulWidget {
  const KnxSettingsScreen({super.key});

  @override
  State<KnxSettingsScreen> createState() => _KnxSettingsScreenState();
}

class _KnxSettingsScreenState extends State<KnxSettingsScreen> {
  final _ipController = TextEditingController();
  final _portController = TextEditingController(text: '3671');
  final _physAddrController = TextEditingController(text: '1.1.128');
  bool _isLoading = false;

  @override
  void initState() {
    super.initState();
    _loadSettings();
  }

  Future<void> _loadSettings() async {
    final prefs = await SharedPreferences.getInstance();
    setState(() {
      _ipController.text = prefs.getString('knx_ip') ?? '';
      _portController.text = prefs.getString('knx_port') ?? '3671';
      _physAddrController.text = prefs.getString('knx_phys_addr') ?? '1.1.128';
    });
  }

  Future<void> _saveSettings() async {
    setState(() => _isLoading = true);
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString('knx_ip', _ipController.text);
    await prefs.setString('knx_port', _portController.text);
    await prefs.setString('knx_phys_addr', _physAddrController.text);
    
    try {
      await ApiService().updateKnxConfig(
        _ipController.text,
        _portController.text,
        _physAddrController.text,
      );
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Backend update failed: $e')));
      }
    }
    
    if (mounted) {
      setState(() => _isLoading = false);
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Settings Saved')));
      Navigator.pop(context);
    }
  }

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final textColor = isDark ? Colors.white : Colors.black87;
    final subTextColor = isDark ? Colors.white70 : Colors.black54;
    final borderColor = isDark ? Colors.white.withValues(alpha: 0.3) : Colors.black.withValues(alpha: 0.2);
    final fillColor = isDark ? Colors.white.withValues(alpha: 0.05) : Colors.black.withValues(alpha: 0.05);

    return Scaffold(
      extendBodyBehindAppBar: true,
      appBar: AppBar(
        title: Text('KNX Configuration', style: TextStyle(color: textColor)),
        backgroundColor: Colors.transparent,
        elevation: 0,
        iconTheme: IconThemeData(color: textColor),
      ),
      body: GradientBackground(
        child: SafeArea(
          child: Padding(
            padding: const EdgeInsets.all(16.0),
            child: GlassCard(
              child: Padding(
                padding: const EdgeInsets.all(16.0),
                child: SingleChildScrollView(
                  child: Column(
                    children: [
                      Text(
                        'Configure your KNX IP Interface or Router connection details.',
                        style: TextStyle(color: subTextColor),
                      ),
                      const SizedBox(height: 20),
                      TextField(
                        controller: _ipController,
                        style: TextStyle(color: textColor),
                        decoration: InputDecoration(
                          labelText: 'Gateway IP Address',
                          labelStyle: TextStyle(color: subTextColor),
                          enabledBorder: OutlineInputBorder(
                            borderRadius: BorderRadius.circular(12),
                            borderSide: BorderSide(color: borderColor),
                          ),
                          focusedBorder: OutlineInputBorder(
                            borderRadius: BorderRadius.circular(12),
                            borderSide: const BorderSide(color: Colors.cyan),
                          ),
                          filled: true,
                          fillColor: fillColor,
                        ),
                      ),
                      const SizedBox(height: 16),
                      TextField(
                        controller: _portController,
                        style: TextStyle(color: textColor),
                        keyboardType: TextInputType.number,
                        decoration: InputDecoration(
                          labelText: 'Port (Default: 3671)',
                          labelStyle: TextStyle(color: subTextColor),
                          enabledBorder: OutlineInputBorder(
                            borderRadius: BorderRadius.circular(12),
                            borderSide: BorderSide(color: borderColor),
                          ),
                          focusedBorder: OutlineInputBorder(
                            borderRadius: BorderRadius.circular(12),
                            borderSide: const BorderSide(color: Colors.cyan),
                          ),
                          filled: true,
                          fillColor: fillColor,
                        ),
                      ),
                      const SizedBox(height: 16),
                      TextField(
                        controller: _physAddrController,
                        style: TextStyle(color: textColor),
                        decoration: InputDecoration(
                          labelText: 'Client Physical Address',
                          labelStyle: TextStyle(color: subTextColor),
                          enabledBorder: OutlineInputBorder(
                            borderRadius: BorderRadius.circular(12),
                            borderSide: BorderSide(color: borderColor),
                          ),
                          focusedBorder: OutlineInputBorder(
                            borderRadius: BorderRadius.circular(12),
                            borderSide: const BorderSide(color: Colors.cyan),
                          ),
                          filled: true,
                          fillColor: fillColor,
                        ),
                      ),
                      const SizedBox(height: 32),
                      SizedBox(
                        width: double.infinity,
                        child: ElevatedButton(
                          onPressed: _isLoading ? null : _saveSettings,
                          style: ElevatedButton.styleFrom(
                            backgroundColor: Colors.cyan,
                            foregroundColor: Colors.white,
                            padding: const EdgeInsets.symmetric(vertical: 16),
                            shape: RoundedRectangleBorder(
                              borderRadius: BorderRadius.circular(12),
                            ),
                          ),
                          child: _isLoading 
                            ? const CircularProgressIndicator(color: Colors.white) 
                            : const Text('Save Configuration', style: TextStyle(fontSize: 16)),
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}
