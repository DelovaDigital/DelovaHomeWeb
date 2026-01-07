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
    final theme = Theme.of(context);
    final mutedColor = theme.disabledColor;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            Row(
              children: [
                Icon(Icons.people_outline, color: theme.colorScheme.primary, size: 20),
                const SizedBox(width: 8),
                Text(t('presence'), style: theme.textTheme.titleMedium?.copyWith(fontWeight: FontWeight.bold)),
              ],
            ),
            if (people.isNotEmpty)
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                decoration: BoxDecoration(
                  color: Colors.green.withValues(alpha: 0.1),
                  borderRadius: BorderRadius.circular(12),
                ),
                child: Text('${people.where((p) => p['isHome'] == true).length} Home', style: const TextStyle(fontSize: 10, color: Colors.green, fontWeight: FontWeight.bold)),
              )
          ],
        ),
        const SizedBox(height: 16),
        
        if (people.isEmpty) 
          Padding(
            padding: const EdgeInsets.symmetric(vertical: 8),
            child: Text(t('no_presence_data'), style: TextStyle(color: mutedColor)),
          )
        else
          ListView.separated(
            shrinkWrap: true,
            physics: const NeverScrollableScrollPhysics(),
            itemCount: people.length,
            separatorBuilder: (c, i) => const SizedBox(height: 8),
            itemBuilder: (context, index) {
              final p = people[index];
              final isHome = p['isHome'] == true;
              return Row(
                children: [
                  Container(
                    width: 32,
                    height: 32,
                    decoration: BoxDecoration(
                      color: isHome ? Colors.green.withValues(alpha: 0.1) : Colors.grey.withValues(alpha: 0.1),
                      shape: BoxShape.circle,
                    ),
                    child: Icon(
                      Icons.person, 
                      size: 18, 
                      color: isHome ? Colors.green : Colors.grey
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Text(
                      p['name'] ?? 'Unknown', 
                      style: theme.textTheme.bodyMedium?.copyWith(
                        fontWeight: isHome ? FontWeight.bold : FontWeight.normal
                      )
                    ),
                  ),
                  Container(
                    width: 8,
                    height: 8,
                    decoration: BoxDecoration(
                      shape: BoxShape.circle,
                      color: isHome ? Colors.green : Colors.red,
                    ),
                  )
                ],
              );
            },
          ),
      ],
    );
  }
}
