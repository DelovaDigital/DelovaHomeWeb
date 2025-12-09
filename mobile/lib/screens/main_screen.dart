import 'dart:ui' as ui;
import 'package:flutter/material.dart';
import '../widgets/gradient_background.dart';
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

  static const List<Widget> _widgetOptions = <Widget>[
    DashboardTab(),
    DevicesTab(),
    RoomsTab(),
    SettingsTab(),
  ];

  void _onItemTapped(int index) {
    setState(() {
      _selectedIndex = index;
    });
  }

  @override
  Widget build(BuildContext context) {
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
      bottomNavigationBar: Container(
        decoration: BoxDecoration(
          color: Colors.black.withValues(alpha: 0.2),
          backgroundBlendMode: BlendMode.srcOver,
        ),
        child: ClipRRect(
          child: BackdropFilter(
            filter: ui.ImageFilter.blur(sigmaX: 10.0, sigmaY: 10.0),
            child: BottomNavigationBar(
              backgroundColor: Colors.white.withValues(alpha: 0.1),
              elevation: 0,
              items: const <BottomNavigationBarItem>[
                BottomNavigationBarItem(
                  icon: Icon(Icons.dashboard_outlined),
                  activeIcon: Icon(Icons.dashboard),
                  label: 'Dashboard',
                ),
                BottomNavigationBarItem(
                  icon: Icon(Icons.devices_outlined),
                  activeIcon: Icon(Icons.devices),
                  label: 'Devices',
                ),
                BottomNavigationBarItem(
                  icon: Icon(Icons.meeting_room_outlined),
                  activeIcon: Icon(Icons.meeting_room),
                  label: 'Rooms',
                ),
                BottomNavigationBarItem(
                  icon: Icon(Icons.settings_outlined),
                  activeIcon: Icon(Icons.settings),
                  label: 'Settings',
                ),
              ],
              currentIndex: _selectedIndex,
              selectedItemColor: Colors.cyanAccent,
              unselectedItemColor: Colors.white70,
              onTap: _onItemTapped,
              type: BottomNavigationBarType.fixed,
              showUnselectedLabels: true,
            ),
          ),
        ),
      ),
    );
  }
}
