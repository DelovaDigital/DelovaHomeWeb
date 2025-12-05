import 'dart:io';
import 'package:flutter/material.dart';
import 'screens/hub_discovery_screen.dart';

class MyHttpOverrides extends HttpOverrides {
  @override
  HttpClient createHttpClient(SecurityContext? context) {
    return super.createHttpClient(context)
      ..badCertificateCallback = (X509Certificate cert, String host, int port) => true;
  }
}

void main() {
  HttpOverrides.global = MyHttpOverrides();
  runApp(const OmniHomeApp());
}

class OmniHomeApp extends StatelessWidget {
  const OmniHomeApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Delova Home',
      theme: ThemeData(
        primarySwatch: Colors.blue,
        useMaterial3: true,
        brightness: Brightness.dark, // Matching the dark theme of the web app
      ),
      home: const HubDiscoveryScreen(),
    );
  }
}
