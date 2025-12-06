import 'package:delovahome/main.dart';
import 'package:flutter/material.dart';
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
    appBar: AppBar(
      title: const Text('Delova Home'),
      actions: [
        IconButton(
          icon: const Icon(Icons.brightness_6),
          tooltip: 'Thema wisselen',
          onPressed: () {
            final appState = DelovaHome.of(context);
            appState?.cycleTheme();
          },
        ),
      ],
    ), 
    body: AnimatedSwitcher(
      duration: const Duration(milliseconds: 300),
      transitionBuilder: (child, anim) {
        final offsetAnim = Tween<Offset>(begin: const Offset(0.0, 0.05), end: Offset.zero).animate(anim);
        return SlideTransition(position: offsetAnim, child: FadeTransition(opacity: anim, child: child));
      },
      child: SizedBox(
        key: ValueKey<int>(_selectedIndex),
        width: double.infinity,
        child: _widgetOptions.elementAt(_selectedIndex),
      ),
    ),
      bottomNavigationBar: BottomNavigationBar(
        items: const <BottomNavigationBarItem>[
          BottomNavigationBarItem(
            icon: Icon(Icons.home_outlined),
            label: 'Overzicht',
          ),
          BottomNavigationBarItem(
            icon: Icon(Icons.devices_other),
            label: 'Apparaten',
          ),
          BottomNavigationBarItem(
            icon: Icon(Icons.room_preferences),
            label: 'Ruimtes',
          ),
          BottomNavigationBarItem(
            icon: Icon(Icons.tune),
            label: 'Instellingen',
          ),
        ],
        currentIndex: _selectedIndex,
        selectedItemColor: Colors.blue,
        unselectedItemColor: Colors.grey,
        onTap: _onItemTapped,
        type: BottomNavigationBarType.fixed,
      ),
    );
  }
}
