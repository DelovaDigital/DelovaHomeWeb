import 'package:flutter/material.dart';
import 'package:geolocator/geolocator.dart';
import '../../services/api_service.dart';
import '../../widgets/glass_card.dart';
import '../../utils/app_translations.dart';
import 'package:shared_preferences/shared_preferences.dart';

class PresenceSettingsScreen extends StatefulWidget {
  const PresenceSettingsScreen({super.key});

  @override
  State<PresenceSettingsScreen> createState() => _PresenceSettingsScreenState();
}

class _PresenceSettingsScreenState extends State<PresenceSettingsScreen> {
  final _apiService = ApiService();
  bool _isLoading = false;
  String _lang = 'nl';
  double _radius = 100;

  @override
  void initState() {
    super.initState();
    _loadLanguage();
    _loadCurrentSettings();
  }

  Future<void> _loadLanguage() async {
    final prefs = await SharedPreferences.getInstance();
    setState(() {
      _lang = prefs.getString('language') ?? 'nl';
    });
  }

  Future<void> _loadCurrentSettings() async {
    try {
      final data = await _apiService.getPresenceData();
      if (data.containsKey('homeLocation')) {
        final home = data['homeLocation'];
        if (mounted && home != null) {
          setState(() {
            _radius = (home['radius'] as num?)?.toDouble() ?? 100.0;
          });
        }
      }
    } catch (e) {
      debugPrint('Error loading presence settings: $e');
    }
  }

  String t(String key) => AppTranslations.get(key, lang: _lang);

  Future<void> _setHomeLocation() async {
    setState(() => _isLoading = true);
    try {
      Position position = await Geolocator.getCurrentPosition(
        locationSettings: const LocationSettings(accuracy: LocationAccuracy.high)
      );
      
      await _apiService.setHomeLocation(position.latitude, position.longitude, _radius);
      
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Home location updated to current location')),
        );
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Error: $e')),
        );
      }
    } finally {
      if (mounted) setState(() => _isLoading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final textColor = isDark ? Colors.white : Colors.black87;

    return Scaffold(
      appBar: AppBar(
        title: Text(t('presence')), // Ensure 'presence' key exists or fallback
        backgroundColor: Colors.transparent,
        elevation: 0,
        iconTheme: IconThemeData(color: textColor),
        titleTextStyle: TextStyle(color: textColor, fontSize: 20, fontWeight: FontWeight.bold),
      ),
      extendBodyBehindAppBar: true,
      body: Container(
        decoration: BoxDecoration(
          gradient: LinearGradient(
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
            colors: isDark 
                ? [const Color(0xFF1E293B), const Color(0xFF0F172A)]
                : [const Color(0xFFF0F9FF), const Color(0xFFE0F2FE)],
          ),
        ),
        child: SafeArea(
          child: Padding(
            padding: const EdgeInsets.all(20.0),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                GlassCard(
                  child: Padding(
                    padding: const EdgeInsets.all(20.0),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          'Home Location',
                          style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold, color: textColor),
                        ),
                        const SizedBox(height: 10),
                        Text(
                          'Set the current location as your home location. This will be used to determine if you are home or away.',
                          style: TextStyle(color: textColor.withValues(alpha: 0.7)),
                        ),
                        const SizedBox(height: 20),
                        Row(
                          children: [
                            Text('Radius: ${_radius.round()}m', style: TextStyle(color: textColor)),
                            Expanded(
                              child: Slider(
                                value: _radius,
                                min: 50,
                                max: 500,
                                divisions: 9,
                                label: '${_radius.round()}m',
                                onChanged: (value) => setState(() => _radius = value),
                              ),
                            ),
                          ],
                        ),
                        const SizedBox(height: 20),
                        SizedBox(
                          width: double.infinity,
                          child: ElevatedButton.icon(
                            onPressed: _isLoading ? null : _setHomeLocation,
                            icon: _isLoading 
                                ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2))
                                : const Icon(Icons.my_location),
                            label: Text(_isLoading ? 'Updating...' : 'Set Current Location as Home'),
                            style: ElevatedButton.styleFrom(
                              padding: const EdgeInsets.symmetric(vertical: 15),
                              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
                            ),
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
