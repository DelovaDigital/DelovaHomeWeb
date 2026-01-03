import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';
import '../utils/app_translations.dart';

class EnergyWidget extends StatefulWidget {
  final Map<String, dynamic> data;

  const EnergyWidget({super.key, required this.data});

  @override
  State<EnergyWidget> createState() => _EnergyWidgetState();
}

class _EnergyWidgetState extends State<EnergyWidget> {
  String _lang = 'nl';

  @override
  void initState() {
    super.initState();
    _loadLanguage();
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

  @override
  Widget build(BuildContext context) {
    final grid = widget.data['grid'] ?? {};
    final solar = widget.data['solar'] ?? {};
    final home = widget.data['home'] ?? {};

    final gridPower = (grid['currentPower'] ?? 0).toDouble();
    final solarPower = (solar['currentPower'] ?? 0).toDouble();
    final usage = (home['currentUsage'] ?? (gridPower + solarPower)).toDouble();

    final isDark = Theme.of(context).brightness == Brightness.dark;
    final textColor = isDark ? Colors.white : Colors.black87;
    final subTextColor = isDark ? Colors.white70 : Colors.black54;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Padding(
          padding: const EdgeInsets.only(bottom: 12.0),
          child: Row(
            children: [
              const Icon(Icons.bolt, color: Colors.yellowAccent, size: 16),
              const SizedBox(width: 8),
              Text(t('energy_monitor'), style: TextStyle(color: subTextColor, fontWeight: FontWeight.bold)),
            ],
          ),
        ),
        Row(
          mainAxisAlignment: MainAxisAlignment.spaceAround,
          children: [
            _buildItem(Icons.home, '${usage.round()} W', t('usage'), textColor),
            _buildItem(Icons.wb_sunny, '${solarPower.round()} W', t('solar'), Colors.greenAccent),
            _buildItem(
              Icons.electrical_services, 
              '${gridPower.abs().round()} W', 
              gridPower > 0 ? t('import') : t('export'), 
              gridPower > 0 ? Colors.redAccent : Colors.greenAccent
            ),
          ],
        ),
      ],
    );
  }

  Widget _buildItem(IconData icon, String value, String label, Color color) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final labelColor = isDark ? Colors.white54 : Colors.black45;

    return Column(
      children: [
        Icon(icon, color: color.withValues(alpha: 0.8), size: 24),
        const SizedBox(height: 4),
        Text(value, style: TextStyle(color: color, fontWeight: FontWeight.bold, fontSize: 16)),
        Text(label, style: TextStyle(color: labelColor, fontSize: 10)),
      ],
    );
  }
}
