import 'dart:async';
import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';
import '../models/device.dart';
import '../services/api_service.dart';
import '../utils/app_translations.dart';
import 'room_detail_screen.dart';

class RoomsTab extends StatefulWidget {
  const RoomsTab({super.key});

  @override
  State<RoomsTab> createState() => _RoomsTabState();
}

class _RoomsTabState extends State<RoomsTab> {
  final ApiService _apiService = ApiService();
  Map<String, List<Device>> _rooms = {};
  bool _isLoading = true;
  String? _error;
  Timer? _timer;
  String _lang = 'nl';

  @override
  void initState() {
    super.initState();
    _loadLanguage();
    _fetchDevices();
    _timer = Timer.periodic(const Duration(seconds: 5), (timer) {
      _fetchDevices(silent: true);
    });
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
  void dispose() {
    _timer?.cancel();
    super.dispose();
  }

  Future<void> _fetchDevices({bool silent = false}) async {
    if (!silent) {
      setState(() {
        _isLoading = true;
        _error = null;
      });
    }

    try {
      final devices = await _apiService.getDevices();
      final Map<String, List<Device>> grouped = {};
      
      for (var device in devices) {
        final room = device.room ?? 'Unassigned';
        if (!grouped.containsKey(room)) {
          grouped[room] = [];
        }
        grouped[room]!.add(device);
      }

      if (mounted) {
        setState(() {
          _rooms = grouped;
          _isLoading = false;
        });
      }
    } catch (e) {
      if (mounted) {
        setState(() {
          if (!silent) _error = e.toString();
          _isLoading = false;
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_isLoading) {
      return const Center(child: CircularProgressIndicator());
    }

    if (_error != null) {
      return Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Text('${t('error')}: $_error', style: TextStyle(color: Theme.of(context).colorScheme.error)),
            const SizedBox(height: 16),
            FilledButton.tonal(
              onPressed: () => _fetchDevices(),
              child: Text(t('retry')),
            ),
          ],
        ),
      );
    }

    return Scaffold(
      body: RefreshIndicator(
        onRefresh: () => _fetchDevices(),
        child: CustomScrollView(
          slivers: [
            SliverAppBar.large(
              title: Text(t('rooms')),
              centerTitle: false,
            ),
            
            _rooms.isEmpty
                ? SliverFillRemaining(
                    child: Center(
                      child: Text(
                        t('no_rooms'),
                        style: TextStyle(color: Theme.of(context).colorScheme.onSurfaceVariant),
                      ),
                    ),
                  )
                : SliverPadding(
                    padding: const EdgeInsets.all(16),
                    sliver: SliverGrid(
                      gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
                        crossAxisCount: 2,
                        childAspectRatio: 1.0,
                        crossAxisSpacing: 16,
                        mainAxisSpacing: 16,
                      ),
                      delegate: SliverChildBuilderDelegate(
                        (context, index) {
                          final roomName = _rooms.keys.elementAt(index);
                          final devices = _rooms[roomName]!;
                          final displayRoomName = roomName == 'Unassigned' ? t('unassigned') : roomName;
                          final theme = Theme.of(context);
                          
                          return GestureDetector(
                            onTap: () {
                              Navigator.push(
                                context,
                                MaterialPageRoute(
                                  builder: (context) => RoomDetailScreen(
                                    roomName: roomName,
                                    devices: devices,
                                    onRefresh: () => _fetchDevices(),
                                  ),
                                ),
                              );
                            },
                            child: Card(
                              elevation: 0,
                              color: theme.colorScheme.surfaceContainer,
                              child: Padding(
                                padding: const EdgeInsets.all(16),
                                child: Column(
                                  mainAxisAlignment: MainAxisAlignment.center,
                                  children: [
                                    Container(
                                      padding: const EdgeInsets.all(16),
                                      decoration: BoxDecoration(
                                        color: theme.colorScheme.primaryContainer,
                                        shape: BoxShape.circle,
                                      ),
                                      child: Icon(
                                        _getRoomIcon(roomName),
                                        size: 32,
                                        color: theme.colorScheme.onPrimaryContainer,
                                      ),
                                    ),
                                    const SizedBox(height: 16),
                                    Text(
                                      displayRoomName,
                                      style: theme.textTheme.titleMedium?.copyWith(
                                        fontWeight: FontWeight.bold,
                                      ),
                                      textAlign: TextAlign.center,
                                      maxLines: 1,
                                      overflow: TextOverflow.ellipsis,
                                    ),
                                    const SizedBox(height: 4),
                                    Text(
                                      '${devices.length} ${t('devices_count')}',
                                      style: theme.textTheme.bodyMedium?.copyWith(
                                        color: theme.colorScheme.onSurfaceVariant,
                                      ),
                                    ),
                                  ],
                                ),
                              ),
                            ),
                          );
                        },
                        childCount: _rooms.length,
                      ),
                    ),
            ),
             const SliverToBoxAdapter(child: SizedBox(height: 100)),
          ],
        ),
      ),
    );
  }

  IconData _getRoomIcon(String roomName) {
    final name = roomName.toLowerCase();
    if (name.contains('living') || name.contains('woon')) return Icons.weekend;
    if (name.contains('kitchen') || name.contains('keuken')) return Icons.kitchen;
    if (name.contains('bed') || name.contains('slaap')) return Icons.bed;
    if (name.contains('bath') || name.contains('bad')) return Icons.bathtub;
    if (name.contains('office') || name.contains('kantoor') || name.contains('desk')) return Icons.work;
    if (name.contains('garage')) return Icons.garage;
    if (name.contains('garden') || name.contains('tuin')) return Icons.yard;
    if (name.contains('dining') || name.contains('eet')) return Icons.dining;
    if (name.contains('hall') || name.contains('gang')) return Icons.door_sliding;
    return Icons.meeting_room;
  }
}
