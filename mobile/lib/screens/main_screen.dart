import 'dart:ui' as ui;
import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';
import '../widgets/gradient_background.dart';
import '../utils/app_translations.dart';
import '../services/location_service.dart';
import 'dashboard_tab.dart';
import 'devices_tab.dart';
import 'rooms_tab.dart';
import 'settings_tab.dart';

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
    SettingsTab(),
  ];

  @override
  void initState() {
    super.initState();
    _loadLanguage();
    _locationService.init();
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
    final activeColor = const Color(0xFF3B82F6); // Blue
    final inactiveColor = isDark ? Colors.white70 : const Color(0xFF64748B);
    final navBgColor = isDark ? Colors.black.withValues(alpha: 0.2) : Colors.white.withValues(alpha: 0.7);

    return Scaffold(
      extendBody: true, // Important for glass effect on bottom nav
      body: GradientBackground(
        child: SafeArea(
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
      ),
      bottomNavigationBar: Padding(
        padding: const EdgeInsets.fromLTRB(20, 0, 20, 30),
        child: ClipRRect(
          borderRadius: BorderRadius.circular(30),
          child: BackdropFilter(
            filter: ui.ImageFilter.blur(sigmaX: 10.0, sigmaY: 10.0),
            child: Container(
              decoration: BoxDecoration(
                color: navBgColor,
                borderRadius: BorderRadius.circular(30),
                border: Border.all(color: Colors.white.withValues(alpha: 0.1)),
                boxShadow: [
                  BoxShadow(
                    color: Colors.black.withValues(alpha: 0.2),
                    blurRadius: 20,
                    offset: const Offset(0, 10),
                  ),
                ],
              ),
              child: BottomNavigationBar(
                backgroundColor: Colors.transparent,
                elevation: 0,
                type: BottomNavigationBarType.fixed,
                showSelectedLabels: true,
                showUnselectedLabels: true,
                selectedItemColor: activeColor,
                unselectedItemColor: inactiveColor,
                selectedLabelStyle: const TextStyle(fontSize: 12, fontWeight: FontWeight.w600),
                unselectedLabelStyle: const TextStyle(fontSize: 12, fontWeight: FontWeight.w500),
                currentIndex: _selectedIndex,
                onTap: _onItemTapped,
                items: <BottomNavigationBarItem>[
                  BottomNavigationBarItem(
                    icon: const Icon(Icons.dashboard_outlined),
                    activeIcon: const Icon(Icons.dashboard),
                    label: t('dashboard'),
                  ),
                  BottomNavigationBarItem(
                    icon: const Icon(Icons.devices_outlined),
                    activeIcon: const Icon(Icons.devices),
                    label: t('devices'),
                  ),
                  BottomNavigationBarItem(
                    icon: const Icon(Icons.meeting_room_outlined),
                    activeIcon: const Icon(Icons.meeting_room),
                    label: t('rooms'),
                  ),
                  BottomNavigationBarItem(
                    icon: const Icon(Icons.settings_outlined),
                    activeIcon: const Icon(Icons.settings),
                    label: t('settings'),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}
