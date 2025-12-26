import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';
import '../../widgets/gradient_background.dart';
import '../../widgets/glass_card.dart';

class EnergySettingsScreen extends StatefulWidget {
  const EnergySettingsScreen({super.key});

  @override
  State<EnergySettingsScreen> createState() => _EnergySettingsScreenState();
}

class _EnergySettingsScreenState extends State<EnergySettingsScreen> {
  final _capacityController = TextEditingController();
  bool _hasSolar = false;

  @override
  void initState() {
    super.initState();
    _loadSettings();
  }

  Future<void> _loadSettings() async {
    final prefs = await SharedPreferences.getInstance();
    setState(() {
      _hasSolar = prefs.getBool('has_solar') ?? false;
      _capacityController.text = prefs.getString('solar_capacity') ?? '0';
    });
  }

  Future<void> _saveSettings() async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setBool('has_solar', _hasSolar);
    await prefs.setString('solar_capacity', _capacityController.text);
    
    if (mounted) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Settings Saved')));
      Navigator.pop(context);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      extendBodyBehindAppBar: true,
      appBar: AppBar(
        title: const Text('Energy Configuration', style: TextStyle(color: Colors.white)),
        backgroundColor: Colors.transparent,
        elevation: 0,
        iconTheme: const IconThemeData(color: Colors.white),
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
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      SwitchListTile(
                      title: const Text('Solar Panels Installed', style: TextStyle(color: Colors.white)),
                      value: _hasSolar,
                      onChanged: (val) => setState(() => _hasSolar = val),
                      activeThumbColor: Colors.cyan,
                    ),
                    if (_hasSolar) ...[
                      const SizedBox(height: 16),
                      TextField(
                        controller: _capacityController,
                        style: const TextStyle(color: Colors.white),
                        keyboardType: TextInputType.number,
                        decoration: InputDecoration(
                          labelText: 'Total Capacity (Watts)',
                          labelStyle: const TextStyle(color: Colors.white70),
                          enabledBorder: OutlineInputBorder(
                            borderRadius: BorderRadius.circular(12),
                            borderSide: BorderSide(color: Colors.white.withValues(alpha: 0.3)),
                          ),
                          focusedBorder: OutlineInputBorder(
                            borderRadius: BorderRadius.circular(12),
                            borderSide: const BorderSide(color: Colors.cyan),
                          ),
                          filled: true,
                          fillColor: Colors.white.withValues(alpha: 0.05),
                          suffixText: 'W',
                          suffixStyle: const TextStyle(color: Colors.white),
                        ),
                      ),
                    ],
                    const SizedBox(height: 32),
                    SizedBox(
                      width: double.infinity,
                      child: ElevatedButton(
                        onPressed: _saveSettings,
                        style: ElevatedButton.styleFrom(
                          backgroundColor: Colors.cyan,
                          foregroundColor: Colors.white,
                          padding: const EdgeInsets.symmetric(vertical: 16),
                          shape: RoundedRectangleBorder(
                            borderRadius: BorderRadius.circular(12),
                          ),
                        ),
                        child: const Text('Save Configuration', style: TextStyle(fontSize: 16)),
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
