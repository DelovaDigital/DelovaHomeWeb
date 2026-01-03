import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';
import '../models/device.dart';
import '../widgets/device_card.dart';
import '../widgets/gradient_background.dart';
import '../widgets/glass_card.dart';
import '../utils/app_translations.dart';

class RoomDetailScreen extends StatefulWidget {
  final String roomName;
  final List<Device> devices;
  final VoidCallback onRefresh;

  const RoomDetailScreen({
    super.key,
    required this.roomName,
    required this.devices,
    required this.onRefresh,
  });

  @override
  State<RoomDetailScreen> createState() => _RoomDetailScreenState();
}

class _RoomDetailScreenState extends State<RoomDetailScreen> {
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
    return Scaffold(
      extendBodyBehindAppBar: true,
      appBar: AppBar(
        title: Text(widget.roomName, style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold)),
        backgroundColor: Colors.transparent,
        elevation: 0,
        iconTheme: const IconThemeData(color: Colors.white),
        centerTitle: true,
      ),
      body: GradientBackground(
        child: SafeArea(
          child: widget.devices.isEmpty
              ? Center(child: Text(t('no_devices_room'), style: const TextStyle(color: Colors.white70)))
              : GridView.builder(
                  padding: const EdgeInsets.all(16),
                  gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
                    crossAxisCount: 2,
                    childAspectRatio: 0.85,
                    crossAxisSpacing: 16,
                    mainAxisSpacing: 16,
                  ),
                  itemCount: widget.devices.length,
                  itemBuilder: (context, index) {
                    return GlassCard(
                      child: DeviceCard(
                        device: widget.devices[index],
                        onRefresh: widget.onRefresh,
                      ),
                    );
                  },
                ),
        ),
      ),
    );
  }
}
