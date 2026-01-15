import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'dart:async';
import 'dart:convert';
import 'package:http/http.dart' as http;
import 'package:shared_preferences/shared_preferences.dart';

import '../services/api_service.dart';
import '../models/device.dart';
import '../widgets/device_card.dart';
import '../widgets/ai_assistant_widget.dart';
import '../widgets/presence_widget.dart';
import '../widgets/energy_widget.dart';

import '../utils/app_translations.dart';

  class DashboardTab extends StatefulWidget {
    const DashboardTab({super.key});

    @override
    State<DashboardTab> createState() => _DashboardTabState();
  }

  class _DashboardTabState extends State<DashboardTab> {
    final ApiService _apiService = ApiService();
    int _activeDevices = 0;
    List<Device> _favoriteDevices = [];
    Map<String, dynamic>? _weatherData;
    Map<String, dynamic>? _spotifyStatus;
    Map<String, dynamic>? _energyData;
    Map<String, dynamic>? _presenceData;
    bool _spotifyAvailable = false;
    String? _spotifyDeviceName;
    List<dynamic> _sonosDevices = [];
    final Map<String, dynamic> _sonosStates = {};
    String? _activeSonosUuid;
    Timer? _spotifyTimer;
    Timer? _energyTimer;
    Timer? _presenceTimer;
    Timer? _sonosTimer;
    Timer? _statsTimer;
    Timer? _weatherTimer;
    String _lang = 'nl';

    @override
    void initState() {
      super.initState();
      _loadLanguage();
      _fetchStats();
      _fetchWeather();
      _fetchSpotifyStatus();
      _fetchSpotifyMe();
      _fetchEnergyData();
      _fetchPresenceData();
      _fetchSonosDevices();
      _spotifyTimer = Timer.periodic(const Duration(seconds: 5), (_) {
        _fetchSpotifyStatus();
        _fetchSpotifyMe();
      });
      _energyTimer = Timer.periodic(const Duration(seconds: 5), (_) => _fetchEnergyData());
      _presenceTimer = Timer.periodic(const Duration(seconds: 10), (_) => _fetchPresenceData());
      _sonosTimer = Timer.periodic(const Duration(seconds: 3), (_) => _fetchSonosStates());
      // Stats refer to active devices count etc.
      _statsTimer = Timer.periodic(const Duration(seconds: 10), (_) => _fetchStats());
      // Weather updates less frequently
      _weatherTimer = Timer.periodic(const Duration(minutes: 10), (_) => _fetchWeather());
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
      _spotifyTimer?.cancel();
      _energyTimer?.cancel();
      _presenceTimer?.cancel();
      _sonosTimer?.cancel();
      _statsTimer?.cancel();
      _weatherTimer?.cancel();
      super.dispose();
    }

    Future<void> _fetchSonosDevices() async {
      try {
        final devices = await _apiService.getSonosDevices();
        if (mounted) {
          setState(() {
            _sonosDevices = devices;
            if (_activeSonosUuid == null && _sonosDevices.isNotEmpty) {
              _activeSonosUuid = _sonosDevices.first['uuid'];
            }
          });
          _fetchSonosStates();
        }
      } catch (e) {
        debugPrint('Sonos devices error: $e');
      }
    }

    Future<void> _fetchSonosStates() async {
      if (_sonosDevices.isEmpty) return;
      
      // Parallelize fetching to prevent one slow device blocking updates
      final futures = _sonosDevices.map((device) async {
        try {
          final uuid = device['uuid'];
          final state = await _apiService.getSonosPlaybackState(uuid);
          return MapEntry(uuid, state);
        } catch (e) {
          return null;
        }
      });

      final results = await Future.wait(futures);
      
      if (mounted) {
         setState(() {
           for (final entry in results) {
             if (entry != null) {
               _sonosStates[entry.key] = entry.value;
             }
           }
           
           // Auto-switch active sonos if playing and current is stopped
           // Check if we found a new playing device while current one is not playing
           bool currentPlaying = false;
           if (_activeSonosUuid != null) {
              final activeState = _sonosStates[_activeSonosUuid];
              if (activeState != null && activeState['status'] == 'PLAYING') {
                currentPlaying = true;
              }
           }
           
           if (!currentPlaying) {
              for (final entry in results) {
                 if (entry != null && entry.value['status'] == 'PLAYING') {
                    _activeSonosUuid = entry.key; // Switch to the playing device
                    break;
                 }
              }
           }
         });
      }
    }

    Future<void> _fetchEnergyData() async {
      try {
        final data = await _apiService.getEnergyData();
        if (mounted) setState(() => _energyData = data);
      } catch (e) {
        debugPrint('Energy data error: $e');
      }
    }

    Future<void> _fetchPresenceData() async {
      try {
        final data = await _apiService.getPresenceData();
        if (mounted) setState(() => _presenceData = data);
      } catch (e) {
        debugPrint('Presence data error: $e');
      }
    }

    Future<void> _fetchSpotifyStatus() async {
      try {
        final status = await _apiService.getSpotifyStatus();
        if (mounted) {
          setState(() => _spotifyStatus = status);
        }
      } catch (e) {
        debugPrint('Spotify status error: $e');
        if (mounted) {
          setState(() => _spotifyStatus = {'is_playing': false});
        }
      }
    }

    Future<void> _fetchSpotifyMe() async {
      try {
        final me = await _apiService.getSpotifyMe();
        if (mounted) {
          setState(() {
            _spotifyAvailable = me['available'] == true;
            _spotifyDeviceName = me['device'] != null ? me['device']['name'] : null;
          });
        }
      } catch (e) {
        debugPrint('Spotify me error: $e');
        if (mounted) { setState(() { _spotifyAvailable = false; _spotifyDeviceName = null; }); }
      }
    }



    Future<String?> _showSpotifySearchDialog() async {
      final controller = TextEditingController();
      final result = await showDialog<String?>(
        context: context,
        builder: (context) => AlertDialog(
          backgroundColor: Colors.grey[900],
          title: const Text('Search Spotify', style: TextStyle(color: Colors.white)),
          content: TextField(
            controller: controller,
            style: const TextStyle(color: Colors.white),
            decoration: const InputDecoration(hintText: 'Search for tracks or artists', hintStyle: TextStyle(color: Colors.grey)),
          ),
          actions: [
            TextButton(onPressed: () => Navigator.of(context).pop(), child: const Text('Cancel')),
            TextButton(onPressed: () => Navigator.of(context).pop(controller.text.trim()), child: const Text('Search')),
          ],
        ),
      );
      return result;
    }

    void _showSpotifySearchResults(Map<String, dynamic> results) {
      final tracks = results['tracks'] as List<dynamic>? ?? [];
      final artists = results['artists'] as List<dynamic>? ?? [];

      showDialog(
        context: context,
        builder: (context) => AlertDialog(
          backgroundColor: Colors.grey[900],
          title: const Text('Search Results', style: TextStyle(color: Colors.white)),
          content: SizedBox(
            width: double.maxFinite,
            child: ListView(
              shrinkWrap: true,
              children: [
                if (tracks.isNotEmpty) ...[
                  const Text('Tracks', style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold)),
                  const SizedBox(height: 8),
                  ...tracks.map((t) {
                    return ListTile(
                      leading: (t['album'] != null && t['album']['images'] != null && (t['album']['images'] as List).isNotEmpty)
                          ? Image.network(t['album']['images'][0]['url'], width: 48, height: 48, fit: BoxFit.cover)
                          : const SizedBox(width: 48, height: 48),
                      title: Text(t['name'] ?? '', style: const TextStyle(color: Colors.white)),
                      subtitle: Text((t['artists'] != null && (t['artists'] as List).isNotEmpty) ? t['artists'][0]['name'] : '', style: const TextStyle(color: Colors.grey)),
                      onTap: () async {
                        final uri = t['uri'];
                        if (uri != null) {
                          await _apiService.spotifyControl('play_uris', [uri]);
                          if (!context.mounted) return;
                          Navigator.of(context).pop();
                          ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Playing ${t['name']}')));
                          await _fetchSpotifyStatus();
                        }
                      },
                    );
                  })
                ],
                if (artists.isNotEmpty) ...[
                  const SizedBox(height: 12),
                  const Text('Artists', style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold)),
                  const SizedBox(height: 8),
                  ...artists.map((a) {
                    return ListTile(
                      title: Text(a['name'] ?? '', style: const TextStyle(color: Colors.white)),
                      subtitle: Text(a['type'] ?? '', style: const TextStyle(color: Colors.grey)),
                      onTap: () async {
                        final uri = a['uri'];
                        if (uri != null) {
                          await _apiService.spotifyControl('play_context', uri);
                          if (!context.mounted) return;
                          Navigator.of(context).pop();
                          ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Playing ${a['name']}')));
                          await _fetchSpotifyStatus();
                        }
                      },
                    );
                  })
                ],
                if (tracks.isEmpty && artists.isEmpty)
                  const Text('No results', style: TextStyle(color: Colors.grey)),
              ],
            ),
          ),
        ),
      );
    }

    Future<void> _showSpotifyLibraryDialog(String type) async {
      try {
        final items = type == 'playlists' ? await _apiService.getSpotifyPlaylists() : await _apiService.getSpotifyAlbums();
        if (!mounted) return;
        showDialog(
          context: context,
          builder: (context) => AlertDialog(
            backgroundColor: Colors.grey[900],
            title: Text(type == 'playlists' ? 'Your Playlists' : 'Your Albums', style: const TextStyle(color: Colors.white)),
            content: SizedBox(
              width: double.maxFinite,
              child: ListView.builder(
                shrinkWrap: true,
                itemCount: items.length,
                itemBuilder: (context, index) {
                  final item = items[index];
                  // Handle different structure for playlists vs albums
                  final images = item['images'] as List?;
                  final name = item['name'] as String?;
                  String subtitle = '';
                  
                  if (type == 'playlists') {
                     subtitle = '${item['tracks']['total']} tracks';
                  } else if (item['artists'] != null && (item['artists'] as List).isNotEmpty) {
                     subtitle = item['artists'][0]['name'];
                  }

                  return ListTile(
                    leading: (images != null && images.isNotEmpty)
                      ? Image.network(images[0]['url'], width: 48, height: 48, fit: BoxFit.cover)
                      : const SizedBox(width: 48, height: 48),
                    title: Text(name ?? 'Unknown', style: const TextStyle(color: Colors.white)),
                    subtitle: Text(subtitle, style: const TextStyle(color: Colors.grey)),
                    onTap: () async {
                      final uri = item['uri'];
                      await _apiService.spotifyControl('play_context', uri);
                      if (!context.mounted) return;
                      Navigator.of(context).pop();
                      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Playing ${name ?? 'Music'}'))); 
                      await _fetchSpotifyStatus();
                    },
                  );
                },
              ),
            ),
          ),
        );
      } catch (e) {
        debugPrint('Library error: $e');
      }
    }

    Future<void> _showSpotifyDevicesDialog() async {
      try {
        final devices = await _apiService.getSpotifyDevices();
        if (!mounted) return;
        showDialog(
          context: context,
          builder: (context) {
             return StatefulBuilder(
               builder: (context, setState) {
                  return AlertDialog(
                    backgroundColor: Colors.grey[900],
                    title: Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        Text(t('select_device'), style: const TextStyle(color: Colors.white)),
                        IconButton(
                          icon: const Icon(Icons.refresh, color: Colors.white),
                          onPressed: () async {
                              Navigator.pop(context);
                              _showSpotifyDevicesDialog();
                          },
                        )
                      ],
                    ),
                    content: SizedBox(
                      width: double.maxFinite,
                      child: devices.isEmpty 
                        ? const Padding(
                            padding: EdgeInsets.symmetric(vertical: 20),
                            child: Text('No devices found.', style: TextStyle(color: Colors.white70), textAlign: TextAlign.center),
                          )
                        : ListView.builder(
                            shrinkWrap: true,
                            itemCount: devices.length,
                            itemBuilder: (context, index) {
                              final d = devices[index];
                              final isActive = d['is_active'] == true;
                              return ListTile(
                                leading: Icon(
                                  d['type'] == 'Computer' ? Icons.computer : 
                                  d['type'] == 'Smartphone' ? Icons.smartphone : 
                                  d['type'] == 'CastAudio' || d['is_cast'] == true ? Icons.cast :
                                  d['type'] == 'sonos' ? Icons.speaker : Icons.speaker_group,
                                  color: isActive ? Colors.green : Colors.white54
                                ),
                                title: Text(d['name'] ?? 'Unknown', style: TextStyle(color: isActive ? Colors.green : Colors.white, fontWeight: isActive ? FontWeight.bold : FontWeight.normal)),
                                subtitle: Text(d['type'] ?? '', style: const TextStyle(color: Colors.grey)),
                                  onTap: () async {
                                    final success = await _apiService.transferSpotifyPlayback(d['id']);
                                    if (!context.mounted) return;
                                    Navigator.of(context).pop();
                                    if (success) {
                                      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Transferred to ${d['name']}'), backgroundColor: Colors.green));
                                      await Future.delayed(const Duration(milliseconds: 500));
                                      await _fetchSpotifyStatus();
                                    } else {
                                      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Failed to transfer to ${d['name']}'), backgroundColor: Colors.red));
                                    }
                                  },
                              );
                            }
                          ),
                    ),
                  );
               }
             );
          }
        );
      } catch (e) {
        debugPrint('Error fetching devices: $e');
      }
    }



    Future<void> _fetchWeather() async {
      try {
        final response = await http.get(Uri.parse('https://api.open-meteo.com/v1/forecast?latitude=51.5074&longitude=-0.1278&current_weather=true'));
        if (response.statusCode == 200) {
          final data = json.decode(response.body);
          if (mounted) {
            setState(() {
              _weatherData = data['current_weather'];
            });
          }
        }
      } catch (e) {
        debugPrint('Weather fetch error: $e');
      }
    }

    Future<void> _fetchStats() async {
      try {
        final devices = await _apiService.getDevices();
        if (mounted) {
          setState(() {
            _activeDevices = devices.where((d) => d.status.powerState == 'on' || d.status.powerState == 'playing').length;
            _favoriteDevices = devices.where((d) => d.status.powerState == 'on').take(3).toList();
            if (_favoriteDevices.isEmpty) {
              _favoriteDevices = devices.take(3).toList();
            }
          });
        }
      } catch (e) {
        if (mounted) {
          setState(() {
          });
        }
      }
    }

    Future<void> _activateScene(String sceneName) async {
      try {
        await _apiService.activateScene(sceneName);
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Scene activated: $sceneName')));
          _fetchStats();
        }
      } catch (e) {
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Failed to activate scene: $e')));
        }
      } finally {
        if (mounted) {
          setState(() {});
        }
      }
    }


    @override
    Widget build(BuildContext context) {
      final now = DateTime.now();
      final dateStr = DateFormat('EEEE d MMMM', _lang).format(now);

      final theme = Theme.of(context);
      final textColor = theme.colorScheme.onSurface;
      final subTextColor = theme.colorScheme.onSurfaceVariant;

      return Scaffold(
        backgroundColor: theme.scaffoldBackgroundColor,
        body: RefreshIndicator(
          displacement: 40,
          onRefresh: () async {
            await _fetchStats();
            await _fetchWeather();
          },
          child: CustomScrollView(
            physics: const AlwaysScrollableScrollPhysics(),
            slivers: [
              // 1. Modern Header with Greetings & Date
              SliverToBoxAdapter(
                child: Padding(
                  padding: const EdgeInsets.fromLTRB(20, 60, 20, 20),
                  child: Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            t('welcome_home'), 
                            style: theme.textTheme.headlineMedium?.copyWith(
                              fontWeight: FontWeight.bold,
                              color: textColor,
                              height: 1.1,
                            )
                          ),
                          const SizedBox(height: 4),
                          Text(
                            dateStr[0].toUpperCase() + dateStr.substring(1), 
                            style: theme.textTheme.bodyLarge?.copyWith(
                              color: subTextColor,
                              fontWeight: FontWeight.w500
                            )
                          ),
                        ],
                      ),
                      CircleAvatar(
                        backgroundColor: theme.colorScheme.surfaceContainerHighest,
                        child: IconButton(
                          icon: const Icon(Icons.notifications_none_rounded),
                          color: theme.colorScheme.onSurfaceVariant,
                          onPressed: () {
                             // Notification center not implemented yet
                             ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Geen nieuwe meldingen')));
                          },
                        ),
                      )
                    ],
                  ),
                ),
              ),

              // 2. AI Assistant (Full Width)
              SliverToBoxAdapter(
                child: Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 0),
                  child: const AIAssistantWidget(),
                ),
              ),

              const SliverToBoxAdapter(child: SizedBox(height: 16)),

              // 2.1 Energy Widget (Full Width if data available)
              if (_energyData != null)
                SliverToBoxAdapter(
                  child: Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 8),
                    child: EnergyWidget(data: _energyData!),
                  ),
                ),

              // 2.2 Presence Widget (Full Width if data available)
              if (_presenceData != null && _presenceData!.isNotEmpty)
                SliverToBoxAdapter(
                  child: Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 8),
                    child: PresenceWidget(data: _presenceData!),
                  ),
                ),

              const SliverToBoxAdapter(child: SizedBox(height: 16)),

              // 3. Quick Stats (Weather, System)
              SliverToBoxAdapter(
                child: Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 20),
                  child: Row(
                    children: [
                      Expanded(
                        child: _buildStatusCard(
                          icon: _weatherData != null ? _getWeatherIcon(_weatherData!['weathercode']) : Icons.cloud_outlined,
                          title: 'Weather',
                          subtitle: _weatherData != null ? '${_weatherData!['temperature']}°C' : '--',
                          color: Colors.orange,
                        ),
                      ),
                      const SizedBox(width: 12),
                      Expanded(
                        child: _buildStatusCard(
                          icon: Icons.hub_outlined,
                          title: 'System',
                          subtitle: '$_activeDevices Active',
                          color: Colors.blueAccent,
                        ),
                      ),
                    ],
                  ),
                ),
              ),

              const SliverToBoxAdapter(child: SizedBox(height: 24)),
              
              // 4. Presence & Energy (Full Width Cards)
              SliverToBoxAdapter(
                child: Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 20),
                  child: Column(
                    children: [
                       // Presence
                       Card(
                         margin: const EdgeInsets.only(bottom: 16),
                         child: Padding(
                           padding: const EdgeInsets.all(16.0),
                           child: _presenceData != null 
                             ? PresenceWidget(data: _presenceData!)
                             : const Center(child: LinearProgressIndicator()),
                         ),
                       ),
                       // Energy
                       Card(
                         margin: EdgeInsets.zero,
                         child: Padding(
                           padding: const EdgeInsets.all(16.0),
                           child: _energyData != null 
                             ? EnergyWidget(data: _energyData!)
                             : const Center(child: LinearProgressIndicator()),
                         ),
                       )
                    ],
                  ),
                ),
              ),

              const SliverToBoxAdapter(child: SizedBox(height: 24)),

              // 5. Scenes (Horizontal Scroll)
              SliverToBoxAdapter(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Padding(
                      padding: const EdgeInsets.symmetric(horizontal: 20),
                      child: Text(
                        'Quick Scenes', 
                        style: theme.textTheme.titleMedium?.copyWith(fontWeight: FontWeight.bold)
                      ),
                    ),
                    const SizedBox(height: 12),
                    SingleChildScrollView(
                      scrollDirection: Axis.horizontal,
                      padding: const EdgeInsets.symmetric(horizontal: 20),
                      child: Row(
                        children: [
                          _buildSceneChip(Icons.movie_filter_rounded, 'Film', Colors.indigoAccent, () => _activateScene('movie')),
                          const SizedBox(width: 12),
                          _buildSceneChip(Icons.bedtime_rounded, 'Nacht', Colors.deepPurpleAccent, () => _activateScene('night')),
                          const SizedBox(width: 12),
                          _buildSceneChip(Icons.door_back_door_outlined, 'Afwezig', Colors.amber[800]!, () => _activateScene('away')),
                          const SizedBox(width: 12),
                          _buildSceneChip(Icons.wb_sunny_rounded, 'Ochtend', Colors.orangeAccent, () => _activateScene('day')),
                          const SizedBox(width: 12),
                           _buildSceneChip(Icons.power_settings_new_rounded, 'Alles Uit', Colors.redAccent, () => _turnOffLightsOnly()),
                        ],
                      ),
                    ),
                  ],
                ),
              ),

              const SliverToBoxAdapter(child: SizedBox(height: 24)),

              // 6. Spotify (Media)
              SliverToBoxAdapter(
                child: Padding(
                   padding: const EdgeInsets.symmetric(horizontal: 20),
                   child: Column(
                     children: [
                        _buildSpotifySection(),
                        if (_sonosDevices.isNotEmpty) ...[
                          const SizedBox(height: 24),
                          _buildSonosSection(),
                        ]
                     ],
                   )
                ),
              ),

              const SliverToBoxAdapter(child: SizedBox(height: 24)),
              
              // 7. Favorites (Grid like)
              if (_favoriteDevices.isNotEmpty) ...[
                SliverToBoxAdapter(
                  child: Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 0),
                    child: Text('Favorieten', style: theme.textTheme.titleMedium?.copyWith(fontWeight: FontWeight.bold)),
                  ),
                ),
                SliverPadding(
                  padding: const EdgeInsets.all(20),
                  sliver: SliverList(
                    delegate: SliverChildBuilderDelegate(
                      (context, index) {
                        return Padding(
                          padding: const EdgeInsets.only(bottom: 12),
                          child: DeviceCard(device: _favoriteDevices[index], onRefresh: _fetchStats),
                        );
                      },
                      childCount: _favoriteDevices.length,
                    ),
                  ),
                ),
              ],
              
              // Bottom spacing
              const SliverToBoxAdapter(child: SizedBox(height: 100)),
            ],
          ),
        ),
      );
    }

    Widget _buildSceneChip(IconData icon, String label, Color color, VoidCallback onTap) {
      final theme = Theme.of(context);
      final isDark = theme.brightness == Brightness.dark;
      
      return Material(
        color: Colors.transparent,
        child: InkWell(
          onTap: onTap,
          borderRadius: BorderRadius.circular(20),
          child: Container(
             padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 12),
             decoration: BoxDecoration(
               color: isDark ? color.withValues(alpha: 0.2) : color.withValues(alpha: 0.1),
               borderRadius: BorderRadius.circular(20),
               border: Border.all(color: color.withValues(alpha: 0.3), width: 1),
             ),
             child: Row(
               children: [
                 Icon(icon, size: 20, color: color),
                 const SizedBox(width: 8),
                 Text(label, style: TextStyle(color: isDark? Colors.white : Colors.black87, fontWeight: FontWeight.w600)),
               ],
             ),
          ),
        ),
      );
    }


    Future<void> _turnOffLightsOnly() async {
      try {
        final devices = await _apiService.getDevices();
        // Expanded list of keywords to match more devices
        final lights = devices.where((d) {
          final t = d.type.toLowerCase();
          final n = d.name.toLowerCase();
          return t.contains('light') || t.contains('yeelight') || t.contains('hue') || t.contains('lamp') || t.contains('zigbee') ||
                 n.contains('light') || n.contains('lamp') || n.contains('spot') || n.contains('led');
        }).toList();

        int successCount = 0;
        for (final d in lights) {
          try {
            // Try 'set_power' first, then 'turn_off' if applicable
            await _apiService.sendCommand(d.id, 'set_power', {'value': 'off'});
            successCount++;
          } catch (e) {
            debugPrint('Failed to turn off ${d.name}: $e');
          }
        }

        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('$successCount lampen uitgeschakeld')));
          _fetchStats();
        }
      } catch (e) {
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Fout bij uitschakelen lampen: $e')));
        }
      } finally {
        if (mounted) {
          setState(() {});
        }
      }
    }
    Widget _buildStatusCard({required IconData icon, required String title, required String subtitle, required Color color}) {
    final theme = Theme.of(context);
    final textColor = theme.colorScheme.onSurface;
    final cardColor = theme.colorScheme.surface;

    return AspectRatio(
      aspectRatio: 1, // Square shape
      child: Card(
        color: cardColor,
        elevation: 0,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(24)), // More rounded
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start, 
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Container(
                decoration: BoxDecoration(
                  color: color.withValues(alpha: 0.15),
                  shape: BoxShape.circle,
                ),
                padding: const EdgeInsets.all(10),
                child: Icon(icon, color: color, size: 28),
              ),
              Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(title, style: TextStyle(color: theme.colorScheme.onSurfaceVariant, fontSize: 13, fontWeight: FontWeight.w500)),
                  const SizedBox(height: 4),
                  Text(subtitle, style: TextStyle(color: textColor, fontSize: 16, fontWeight: FontWeight.w700), maxLines: 1, overflow: TextOverflow.ellipsis),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }



    IconData _getWeatherIcon(int? code) {
      if (code == null) {
        return Icons.cloud;
      }
      if (code == 0) {
        return Icons.wb_sunny;
      }
      if (code < 3) {
        return Icons.wb_cloudy;
      }
      if (code < 50) {
        return Icons.foggy;
      }
      if (code < 70) {
        return Icons.grain;
      }
      if (code < 80) {
        return Icons.ac_unit;
      }
      return Icons.thunderstorm;
    }

    Widget _buildSpotifySection() {
      final isPlaying = _spotifyStatus?['is_playing'] == true;
      final track = _spotifyStatus != null && _spotifyStatus!['item'] != null ? _spotifyStatus!['item']['name'] : null;
      final artist = _spotifyStatus != null && _spotifyStatus!['item'] != null && _spotifyStatus!['item']['artists'] != null ? _spotifyStatus!['item']['artists'][0]['name'] : null;
      final albumImages = _spotifyStatus != null && _spotifyStatus!['item'] != null && _spotifyStatus!['item']['album'] != null ? _spotifyStatus!['item']['album']['images'] as List<dynamic>? : null;
      final artwork = (albumImages != null && albumImages.isNotEmpty) ? albumImages[0]['url'] : null;

      return Card(
        margin: const EdgeInsets.only(bottom: 20),
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              // Header with Icon and Device Selector
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Row(
                    children: [
                      Icon(Icons.music_note, color: Colors.green, size: 24),
                      const SizedBox(width: 8),
                      Text('Spotify', style: Theme.of(context).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.bold)),
                    ],
                  ),
                  IconButton(
                    icon: const Icon(Icons.speaker_group_outlined),
                    tooltip: 'Select Device',
                    onPressed: _showSpotifyDevicesDialog,
                  ),
                ],
              ),
              const SizedBox(height: 16),
              
              // Key Content
              if (isPlaying && track != null)
                Row(
                  children: [
                    if (artwork != null)
                      ClipRRect(
                        borderRadius: BorderRadius.circular(12),
                        child: Image.network(artwork, width: 64, height: 64, fit: BoxFit.cover),
                      )
                    else
                      Container(
                        width: 64, 
                        height: 64, 
                        decoration: BoxDecoration(color: Colors.grey.withValues(alpha: 0.1), borderRadius: BorderRadius.circular(12)),
                        child: const Icon(Icons.music_note, color: Colors.grey),
                      ),
                    const SizedBox(width: 16),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(track, style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 16), maxLines: 1, overflow: TextOverflow.ellipsis),
                          const SizedBox(height: 4),
                          Text(artist ?? 'Unknown Artist', style: const TextStyle(fontSize: 14, color: Colors.grey), maxLines: 1, overflow: TextOverflow.ellipsis),
                          if (_spotifyDeviceName != null)
                            Padding(
                              padding: const EdgeInsets.only(top: 4),
                              child: Row(
                                children: [
                                  const Icon(Icons.speaker, size: 12, color: Colors.green),
                                  const SizedBox(width: 4),
                                  Expanded(child: Text(_spotifyDeviceName!, style: const TextStyle(fontSize: 12, color: Colors.green), maxLines: 1, overflow: TextOverflow.ellipsis)),
                                ],
                              ),
                            ),
                        ],
                      ),
                    ),
                  ],
                )
              else
                // Idle State
                Container(
                  padding: const EdgeInsets.symmetric(vertical: 12),
                  alignment: Alignment.center,
                  child: Column(
                    children: [
                      Text('Nothing playing', style: Theme.of(context).textTheme.bodyLarge?.copyWith(color: Colors.grey)),
                      if (_spotifyAvailable)
                        Padding(
                          padding: const EdgeInsets.only(top: 8.0),
                          child: Text(_spotifyDeviceName != null ? 'Ready on $_spotifyDeviceName' : 'Select a device to start', style: TextStyle(fontSize: 12, color: Colors.green)),
                        ),
                    ],
                  ),
                ),

              const SizedBox(height: 16),

              // Controls Grid
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceEvenly,
                children: [
                   IconButton(
                     icon: const Icon(Icons.skip_previous_rounded, size: 32),
                     onPressed: _spotifyAvailable ? () async { await _apiService.spotifyControl('previous'); await _fetchSpotifyStatus(); } : null,
                   ),
                   Container(
                     decoration: BoxDecoration(color: Theme.of(context).colorScheme.primaryContainer, shape: BoxShape.circle),
                     child: IconButton(
                       icon: Icon(isPlaying ? Icons.pause_rounded : Icons.play_arrow_rounded, size: 32, color: Theme.of(context).colorScheme.onPrimaryContainer),
                       onPressed: _spotifyAvailable ? () async { 
                         await _apiService.spotifyControl(isPlaying ? 'pause' : 'play'); 
                         await _fetchSpotifyStatus(); 
                       } : null,
                     ),
                   ),
                   IconButton(
                     icon: const Icon(Icons.skip_next_rounded, size: 32),
                     onPressed: _spotifyAvailable ? () async { await _apiService.spotifyControl('next'); await _fetchSpotifyStatus(); } : null,
                   ),
                ],
              ),
              
              const SizedBox(height: 12),
              const Divider(),
              
              // Secondary Actions
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceEvenly,
                children: [
                  TextButton.icon(
                    icon: const Icon(Icons.search, size: 18),
                    label: Text(t('search')),
                    onPressed: _spotifyAvailable ? () async {
                       final q = await _showSpotifySearchDialog();
                       if (q != null && q.isNotEmpty) {
                         final results = await _apiService.searchSpotify(q); 
                         if (!mounted) return; 
                         _showSpotifySearchResults(results);
                       }
                    } : null,
                  ),
                  TextButton.icon(
                    icon: const Icon(Icons.library_music, size: 18),
                    label: Text(t('library')),
                    onPressed: _spotifyAvailable ? () { _showSpotifyLibraryDialog('playlists'); } : null,
                  ),
                ],
              )
            ],
          ),
        ),
      );
    }

    Widget _buildSonosSection() {
      // Logic for active device
      final activeDevice = _activeSonosUuid != null && _sonosDevices.isNotEmpty
          ? _sonosDevices.firstWhere((d) => d['uuid'] == _activeSonosUuid, orElse: () => null) 
          : null;
      
      final state = (_activeSonosUuid != null ? _sonosStates[_activeSonosUuid] : null) ?? {};
      final isPlaying = state['status'] == 'PLAYING' || state['status'] == 'TRANSITIONING';
      final track = state['track']?['title'];
      final artist = state['track']?['artist'];
      
      // If activeDevice provided name but track title is missing, likely not playing music or radio
      
      return Card(
        margin: const EdgeInsets.only(bottom: 20),
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              // Header
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Row(
                    children: [
                      const Icon(Icons.speaker, color: Colors.orange, size: 24),
                      const SizedBox(width: 8),
                      Text('Sonos', style: Theme.of(context).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.bold)),
                    ],
                  ),
                  IconButton(
                    icon: const Icon(Icons.speaker_group),
                    tooltip: 'Select Sonos Device',
                    onPressed: _showSonosDevicesDialog,
                  ),
                ],
              ),
              const SizedBox(height: 16),
              
              // Key Content
              if (activeDevice != null) ...[
                 Row(
                  children: [
                    Container(
                      width: 64, 
                      height: 64, 
                      decoration: BoxDecoration(color: Colors.orange.withValues(alpha: 0.1), borderRadius: BorderRadius.circular(12)),
                      alignment: Alignment.center,
                      child: const Icon(Icons.music_note, color: Colors.orange),
                    ),
                    const SizedBox(width: 16),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(track ?? 'Ready', style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 16), maxLines: 1, overflow: TextOverflow.ellipsis),
                          const SizedBox(height: 4),
                          Text(artist ?? activeDevice['name'] ?? 'Unknown', style: const TextStyle(fontSize: 14, color: Colors.grey), maxLines: 1, overflow: TextOverflow.ellipsis),
                        ],
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 16),
                
                // Controls
                 Row(
                  mainAxisAlignment: MainAxisAlignment.spaceEvenly,
                  children: [
                     IconButton(
                       icon: const Icon(Icons.skip_previous_rounded, size: 32),
                       onPressed: () => _apiService.sonosControl(activeDevice['uuid'], 'previous'),
                     ),
                     Container(
                       decoration: BoxDecoration(color: Theme.of(context).colorScheme.primaryContainer, shape: BoxShape.circle),
                       child: IconButton(
                         icon: Icon(isPlaying ? Icons.pause_rounded : Icons.play_arrow_rounded, size: 32, color: Theme.of(context).colorScheme.onPrimaryContainer),
                         onPressed: () async {
                              final cmd = isPlaying ? 'pause' : 'play';
                              await _apiService.sonosControl(activeDevice['uuid'], cmd);
                              // Optimistic update
                              setState(() {
                                 _sonosStates[activeDevice['uuid']] = { ...state, 'status': isPlaying ? 'STOPPED' : 'PLAYING' };
                              });
                         },
                       ),
                     ),
                     IconButton(
                       icon: const Icon(Icons.skip_next_rounded, size: 32),
                       onPressed: () => _apiService.sonosControl(activeDevice['uuid'], 'next'),
                     ),
                  ],
                ),
                
                // Volume Slider (Simple)
                if (state.containsKey('volume') || true) ...[
                    const SizedBox(height: 10),
                    Row(
                        children: [
                            const Icon(Icons.volume_down, size: 20, color: Colors.grey),
                            Expanded(child: Slider(
                                value: (state['volume'] ?? 20).toDouble(),
                                min: 0,
                                max: 100,
                                onChanged: (val) {
                                    // Debounce or just set
                                    _apiService.sonosControl(activeDevice['uuid'], 'set_volume', val.toInt());
                                    setState(() {
                                         _sonosStates[activeDevice['uuid']] = { ...state, 'volume': val.toInt() };
                                    });
                                }
                            )),
                            const Icon(Icons.volume_up, size: 20, color: Colors.grey),
                        ]
                    )
                ]
                
              ] else 
                 const Center(child: Padding(
                   padding: EdgeInsets.all(16.0),
                   child: Text('No Sonos device selected'),
                 )),
              
            ],
          ),
        ),
      );
    }
    
    Future<void> _showSonosDevicesDialog() async {
        if (_sonosDevices.isEmpty) {
            await _fetchSonosDevices();
        }
        if (!mounted) return;
        
        showDialog(
          context: context,
          builder: (context) {
             return AlertDialog(
                backgroundColor: Colors.grey[900],
                title: const Text('Select Sonos Device', style: TextStyle(color: Colors.white)),
                content: SizedBox(
                   width: double.maxFinite,
                   child: ListView.builder(
                      shrinkWrap: true,
                      itemCount: _sonosDevices.length,
                      itemBuilder: (context, index) {
                         final d = _sonosDevices[index];
                         final isSelected = d['uuid'] == _activeSonosUuid;
                         return ListTile(
                            leading: Icon(Icons.speaker, color: isSelected ? Colors.orange : Colors.white54),
                            title: Text(d['name'] ?? 'Unknown', style: TextStyle(color: isSelected ? Colors.orange : Colors.white)),
                            onTap: () {
                               setState(() {
                                  _activeSonosUuid = d['uuid'];
                               });
                               Navigator.pop(context);
                               _fetchSonosStates();
                            },
                         );
                      }
                   ),
                ),
             );
          }
        );
    }
  }
