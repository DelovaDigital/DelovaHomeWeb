import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';
import '../utils/app_translations.dart';

class PresenceWidget extends StatefulWidget {
  final Map<String, dynamic> data;

  const PresenceWidget({super.key, required this.data});

  @override
  State<PresenceWidget> createState() => _PresenceWidgetState();
}

class _PresenceWidgetState extends State<PresenceWidget> {
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
    final people = widget.data['people'] as List<dynamic>? ?? [];
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final textColor = isDark ? Colors.white : Colors.black87;
    final subTextColor = isDark ? Colors.white70 : Colors.black54;
    final mutedColor = isDark ? Colors.white54 : Colors.black45;

    if (people.isEmpty) {
      return Center(child: Text(t('no_presence_data'), style: TextStyle(color: mutedColor)));
    }

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Padding(
          padding: const EdgeInsets.only(bottom: 8.0),
          child: Row(
            children: [
              Icon(Icons.people, color: subTextColor, size: 16),
              const SizedBox(width: 8),
              Text(t('presence'), style: TextStyle(color: subTextColor, fontWeight: FontWeight.bold)),
            ],
          ),
        ),
        ...people.map((p) {
          final isHome = p['isHome'] == true;
          return Padding(
            padding: const EdgeInsets.symmetric(vertical: 4.0),
            child: Row(
              children: [
                Container(
                  width: 10,
                  height: 10,
                  decoration: BoxDecoration(
                    color: isHome ? Colors.greenAccent : Colors.redAccent,
                    shape: BoxShape.circle,
                    boxShadow: isHome ? [BoxShadow(color: Colors.greenAccent.withValues(alpha: 0.5), blurRadius: 4)] : [],
                  ),
                ),
                const SizedBox(width: 10),
                Text(p['name'] ?? 'Unknown', style: TextStyle(color: textColor)),
                const Spacer(),
                Text(
                  isHome ? t('home') : t('away'),
                  style: TextStyle(color: textColor.withValues(alpha: 0.6), fontSize: 12),
                ),
              ],
            ),
          );
        }),
      ],
    );
  }
}
