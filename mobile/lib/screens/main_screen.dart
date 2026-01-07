import 'dart:ui';
import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';
import '../utils/app_translations.dart';
import '../services/api_service.dart';
import '../services/location_service.dart';
import 'dashboard_tab.dart';
import 'devices_tab.dart';
import 'rooms_tab.dart';
import 'settings_tab.dart';
import 'automations_tab.dart';

class MainScreen extends StatefulWidget {
  const MainScreen({super.key});

  @override
  State<MainScreen> createState() => _MainScreenState();
}

class _MainScreenState extends State<MainScreen> {
  int _selectedIndex = 0;
  String _lang = 'nl';
  final LocationService _locationService = LocationService();

  static const List<Widget> _widgetOptions = <Widget>[
    DashboardTab(),
    DevicesTab(),
    RoomsTab(),
    AutomationsTab(),
    SettingsTab(),
  ];

  @override
  void initState() {
    super.initState();
    _loadLanguage();
    _fetchRemoteLocales();
    _locationService.init();
  }

  Future<void> _fetchRemoteLocales() async {
    try {
      final translations = await ApiService().fetchLocales();
      if (translations != null) {
        AppTranslations.update(translations);
        if (mounted) setState(() {});
      }
    } catch (e) {
      debugPrint('Error fetching locales: $e');
    }
  }

  @override
  void dispose() {
    _locationService.dispose();
    super.dispose();
  }

  Future<void> _loadLanguage() async {
    final prefs = await SharedPreferences.getInstance();
    setState(() {
      _lang = prefs.getString('language') ?? 'nl';
    });
  }

  String t(String key) => AppTranslations.get(key, lang: _lang);

  void _onItemTapped(int index) {
    setState(() {
      _selectedIndex = index;
    });
  }

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final bgColor = isDark ? const Color(0xFF121212) : const Color(0xFFF5F5F7);
    final navBarColor = isDark ? const Color(0xFF1E1E1E) : Colors.white;

    return Scaffold(
      backgroundColor: bgColor,
      extendBody: true,
      body: SafeArea(
        bottom: false,
        child: AnimatedSwitcher(
          duration: const Duration(milliseconds: 300),
          transitionBuilder: (child, anim) {
            return FadeTransition(opacity: anim, child: child);
          },
          child: KeyedSubtree(
            key: ValueKey<int>(_selectedIndex),
            child: _widgetOptions.elementAt(_selectedIndex),
          ),
        ),
      ),
      bottomNavigationBar: Padding(
        padding: const EdgeInsets.fromLTRB(16, 0, 16, 30),
        child: ClipRRect(
          borderRadius: BorderRadius.circular(30),
          child: BackdropFilter(
            filter: ImageFilter.blur(sigmaX: 10, sigmaY: 10),
            child: Container(
              height: 70,
              decoration: BoxDecoration(
                color: navBarColor.withValues(alpha: isDark ? 0.7 : 0.8),
                borderRadius: BorderRadius.circular(30),
                border: Border.all(
                  color: isDark ? Colors.white.withValues(alpha: 0.1) : Colors.black.withValues(alpha: 0.05), 
                  width: 1
                ),
                boxShadow: [
                  BoxShadow(
                    color: Colors.black.withValues(alpha: 0.1),
                    blurRadius: 20,
                    offset: const Offset(0, 10),
                  ),
                ],
              ),
              child: Row(
                mainAxisAlignment: MainAxisAlignment.spaceEvenly,
                children: [
                  _buildNavItem(0, Icons.dashboard_outlined, Icons.dashboard_rounded, t('dashboard')),
                  _buildNavItem(1, Icons.devices_outlined, Icons.devices_rounded, t('devices')),
                  _buildNavItem(2, Icons.meeting_room_outlined, Icons.meeting_room_rounded, t('rooms')),
                  _buildNavItem(3, Icons.auto_awesome_outlined, Icons.auto_awesome, t('Automations')),
                  _buildNavItem(4, Icons.settings_outlined, Icons.settings_rounded, t('settings')),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }

  Widget _buildNavItem(
    int index,
    IconData icon,
    IconData activeIcon,
    String? label,
  ) {
    final isSelected = _selectedIndex == index;
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final activeColor = isDark ? const Color(0xFF64B5F6) : const Color(0xFF007AFF);
    final inactiveColor = isDark ? Colors.white54 : Colors.black54;

    return GestureDetector(
      onTap: () => _onItemTapped(index),
      behavior: HitTestBehavior.opaque,
      child: Column(
        mainAxisSize: MainAxisSize.min,
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          AnimatedContainer(
            duration: const Duration(milliseconds: 300),
            curve: Curves.easeOutBack,
            padding: EdgeInsets.all(isSelected ? 10 : 8),
            decoration: BoxDecoration(
              color: isSelected ? activeColor.withValues(alpha: 0.15) : Colors.transparent,
              borderRadius: BorderRadius.circular(16),
            ),
            child: Icon(
              isSelected ? activeIcon : icon,
              color: isSelected ? activeColor : inactiveColor,
              size: isSelected ? 26 : 24,
            ),
          ),
          if (isSelected)
            Container(
              margin: const EdgeInsets.only(top: 4),
              width: 4,
              height: 4,
              decoration: BoxDecoration(
                color: activeColor,
                shape: BoxShape.circle,
              ),
            )
        ],
      ),
    );
  }
}
