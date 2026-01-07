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
    final theme = Theme.of(context);

    // Energy Logic
    final isProducing = gridPower < 0;
    
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            Icon(Icons.bolt_rounded, color: Colors.amber, size: 24),
            const SizedBox(width: 8),
            Text(t('energy_monitor'), style: theme.textTheme.titleMedium?.copyWith(fontWeight: FontWeight.bold)),
          ],
        ),
        const SizedBox(height: 16),
        Row(
          mainAxisAlignment: MainAxisAlignment.spaceAround,
          children: [
            _buildModernItem(Icons.home_rounded, '${usage.round()} W', t('usage'), Colors.blue),
            _buildModernItem(Icons.wb_sunny_rounded, '${solarPower.round()} W', t('solar'), Colors.amber),
            _buildModernItem(
              isProducing ? Icons.upload_rounded : Icons.download_rounded, 
              '${gridPower.abs().round()} W', 
              isProducing ? t('export') : t('import'), 
              isProducing ? Colors.green : Colors.purpleAccent
            ),
          ],
        ),
      ],
    );
  }

  Widget _buildModernItem(IconData icon, String value, String label, Color color) {
    final theme = Theme.of(context);
    return Column(
      children: [
        Container(
          padding: const EdgeInsets.all(12),
          decoration: BoxDecoration(
            color: color.withValues(alpha: 0.1),
            shape: BoxShape.circle,
          ),
          child: Icon(icon, color: color, size: 24),
        ),
        const SizedBox(height: 8),
        Text(value, style: theme.textTheme.titleMedium?.copyWith(fontWeight: FontWeight.bold)),
        Text(label, style: theme.textTheme.bodySmall?.copyWith(color: theme.colorScheme.onSurfaceVariant)),
      ],
    );
  }
}
