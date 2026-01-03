import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';
import '../utils/app_translations.dart';
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
      bottomNavigationBar: Container(
        margin: const EdgeInsets.fromLTRB(
          10,
          0,
          10,
          20,
        ), // Reduced margin to give more space
        decoration: BoxDecoration(
          color: navBarColor,
          borderRadius: BorderRadius.circular(35),
          boxShadow: [
            BoxShadow(
              color: Colors.black.withValues(alpha: 0.1),
              blurRadius: 25,
              offset: const Offset(0, 8),
            ),
          ],
        ),
        child: SafeArea(
          bottom: false, // We handle bottom padding manually via margin/padding
          child: Padding(
            padding: const EdgeInsets.fromLTRB(4, 8, 4, 8), // Reduced padding
            child: Row(
              mainAxisAlignment: MainAxisAlignment.spaceAround,
              children: [
                _buildNavItem(
                  0,
                  Icons.dashboard_outlined,
                  Icons.dashboard,
                  t('dashboard'),
                ),
                _buildNavItem(
                  1,
                  Icons.devices_outlined,
                  Icons.devices,
                  t('devices'),
                ),
                _buildNavItem(
                  2,
                  Icons.meeting_room_outlined,
                  Icons.meeting_room,
                  t('rooms'),
                ),
                _buildNavItem(
                  3,
                  Icons.auto_awesome_outlined,
                  Icons.auto_awesome,
                  t('Automations'),
                ),
                _buildNavItem(
                  4,
                  Icons.settings_outlined,
                  Icons.settings,
                  t('settings'),
                ),
              ],
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
    String label,
  ) {
    final isSelected = _selectedIndex == index;
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final activeColor = const Color(0xFF007AFF);
    final inactiveColor = isDark ? Colors.grey[400] : const Color(0xFF4A4A4A);

    // If screen is small, hide text for non-selected items to prevent overflow
    // With 5 items, we might run out of space.
    // Let's only show text for selected item, or maybe just icon if space is tight.
    // The current implementation only shows text if selected: `if (isSelected) ...[ Text(...) ]`
    // But with 5 items, even that might be too wide on small screens.
    // Let's reduce padding or font size if needed, or use Flexible.

    return Flexible(
      child: GestureDetector(
        onTap: () => _onItemTapped(index),
        behavior: HitTestBehavior.opaque,
        child: AnimatedContainer(
          duration: const Duration(milliseconds: 200),
          curve: Curves.easeInOut,
          padding: const EdgeInsets.symmetric(
            horizontal: 12,
            vertical: 12,
          ), // Reduced horizontal padding
          decoration: BoxDecoration(
            color: isSelected
                ? activeColor.withValues(alpha: 0.12)
                : Colors.transparent,
            borderRadius: BorderRadius.circular(24),
          ),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(
                isSelected ? activeIcon : icon,
                color: isSelected ? activeColor : inactiveColor,
                size: 24,
              ),
              if (isSelected) ...[
                const SizedBox(width: 4), // Reduced spacing
                Flexible(
                  child: Text(
                    label,
                    overflow: TextOverflow.ellipsis,
                    style: TextStyle(
                      color: activeColor,
                      fontWeight: FontWeight.w600,
                      fontSize: 12, // Reduced font size
                    ),
                  ),
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }
}
