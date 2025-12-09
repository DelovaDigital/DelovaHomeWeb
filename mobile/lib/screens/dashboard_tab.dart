import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'dart:async';
import 'dart:convert';
import 'package:http/http.dart' as http;
import 'package:shared_preferences/shared_preferences.dart';
import 'package:url_launcher/url_launcher.dart';
import '../services/api_service.dart';
import '../models/device.dart';
import '../widgets/glass_card.dart';
import '../widgets/device_card.dart';

  class DashboardTab extends StatefulWidget {
    const DashboardTab({super.key});

    @override
    State<DashboardTab> createState() => _DashboardTabState();
  }

  class _DashboardTabState extends State<DashboardTab> {
    final ApiService _apiService = ApiService();
    int _activeDevices = 0;
    int _totalDevices = 0;
    List<Device> _favoriteDevices = [];
    Map<String, dynamic>? _weatherData;
    Map<String, dynamic>? _spotifyStatus;
    Map<String, dynamic>? _energyData;
    bool _spotifyAvailable = false;
    String? _spotifyDeviceName;
    Timer? _spotifyTimer;
    Timer? _energyTimer;
    // Local theme override for this tab: null = system, true = dark, false = light
    bool? _forceDark;

    @override
    void initState() {
      super.initState();
      _fetchStats();
      _fetchWeather();
      _fetchSpotifyStatus();
      _fetchSpotifyMe();
      _fetchEnergyData();
      _spotifyTimer = Timer.periodic(const Duration(seconds: 5), (_) {
        _fetchSpotifyStatus();
        _fetchSpotifyMe();
      });
      _energyTimer = Timer.periodic(const Duration(seconds: 5), (_) => _fetchEnergyData());
    }

    @override
    void dispose() {
      _spotifyTimer?.cancel();
      _energyTimer?.cancel();
      super.dispose();
    }

    Future<void> _fetchEnergyData() async {
      // TODO: Implement API endpoint for energy data
      // For now, we'll simulate it or wait for WebSocket implementation
      // final data = await _apiService.getEnergyData();
      // if (mounted) setState(() => _energyData = data);
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

    Future<void> _openSpotifyLogin() async {
      try {
        final baseUrl = await _apiService.getBaseUrl();
        final prefs = await SharedPreferences.getInstance();
        final userId = prefs.getString('userId');
        final uriString = userId != null ? '$baseUrl/api/spotify/login?userId=$userId' : '$baseUrl/api/spotify/login';
        final url = Uri.parse(uriString);
        if (await canLaunchUrl(url)) {
          await launchUrl(url, mode: LaunchMode.externalApplication);
        } else {
          if (mounted) {
            ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Cannot open browser')));
          }
        }
      } catch (e) {
        debugPrint('Open spotify login error: $e');
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

    Future<void> _showSpotifyDevicesDialog() async {
      try {
        final devices = await _apiService.getSpotifyDevices();
        if (!mounted) return;
        showDialog(
          context: context,
          builder: (context) => AlertDialog(
            backgroundColor: Colors.grey[900],
            title: const Text('Select Spotify Device', style: TextStyle(color: Colors.white)),
            content: SizedBox(
              width: double.maxFinite,
              child: ListView.builder(
                shrinkWrap: true,
                itemCount: devices.length,
                itemBuilder: (context, index) {
                  final d = devices[index];
                  return ListTile(
                    title: Text(d['name'] ?? 'Unknown', style: const TextStyle(color: Colors.white)),
                    subtitle: Text(d['type'] ?? '', style: const TextStyle(color: Colors.grey)),
                      onTap: () async {
                        await _apiService.transferSpotifyPlayback(d['id']);
                        if (!context.mounted) return;
                        Navigator.of(context).pop();
                        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Transferred to ${d['name']}')));
                      },
                      trailing: IconButton(
                        icon: const Icon(Icons.speaker, color: Colors.white),
                        onPressed: () async {
                          // Play current Spotify track on a Sonos device
                          try {
                            final messenger = ScaffoldMessenger.of(context);
                            var status = _spotifyStatus;
                            if (status == null) {
                              status = await _apiService.getSpotifyStatus();
                              if (!mounted) return;
                              setState(() => _spotifyStatus = status);
                            }

                            String? playUri;
                            playUri = status['item'] != null ? status['item']['uri'] : null;
                            playUri ??= status['context'] != null ? status['context']['uri'] : null;
                          
                            if (playUri == null) {
                              messenger.showSnackBar(const SnackBar(content: Text('No current Spotify track to play on Sonos')));
                              return;
                            }

                            final sonos = await _apiService.getSonosDevices();
                            if (sonos.isEmpty) {
                              messenger.showSnackBar(const SnackBar(content: Text('No Sonos devices found')));
                              return;
                            }

                            if (!mounted) return;
                            final chosen = await showDialog<Map<String, dynamic>?>(
                              context: context,
                              builder: (ctx) => AlertDialog(
                                backgroundColor: Colors.grey[900],
                                title: const Text('Choose Sonos Device', style: TextStyle(color: Colors.white)),
                                content: SizedBox(
                                  width: double.maxFinite,
                                  child: ListView.builder(
                                    shrinkWrap: true,
                                    itemCount: sonos.length,
                                    itemBuilder: (c, i) {
                                      final s = sonos[i];
                                      return ListTile(
                                        title: Text(s['name'] ?? 'Unknown', style: const TextStyle(color: Colors.white)),
                                        onTap: () => Navigator.of(ctx).pop(s),
                                      );
                                    },
                                  ),
                                ),
                              ),
                            );

                            if (chosen == null) return;

                            final ok = await _apiService.playOnSonos(chosen['uuid'] ?? chosen['uuid'], playUri);
                            if (!context.mounted) return;
                            if (ok) {
                              ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Started playing on ${chosen['name']}')));
                            } else {
                              ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Failed to start Sonos playback')));
                            }
                          } catch (e) {
                            debugPrint('Error playing on Sonos: $e');
                            if (mounted) ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Error starting Sonos playback')));
                          }
                        },
                      ),
                  );
                },
              ),
            ),
          ),
        );
      } catch (e) {
        debugPrint('Error fetching devices: $e');
      }
    }

    Future<void> _showSpotifyMusicPicker() async {
      final playlists = await _apiService.getSpotifyPlaylists();
      final albums = await _apiService.getSpotifyAlbums();

      if (!mounted) return;
      showDialog(
        context: context,
        builder: (context) => DefaultTabController(
          length: 2,
          child: AlertDialog(
            backgroundColor: Colors.grey[900],
            title: const Text('Choose Music', style: TextStyle(color: Colors.white)),
            content: SizedBox(
              width: double.maxFinite,
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  const TabBar(tabs: [Tab(text: 'Playlists'), Tab(text: 'Albums')]),
                  SizedBox(
                    height: 300,
                    child: TabBarView(children: [
                      ListView.builder(
                        itemCount: playlists.length,
                        itemBuilder: (context, i) {
                          final p = playlists[i];
                          return ListTile(
                            leading: p['images'] != null && p['images'].isNotEmpty
                                ? Image.network(p['images'][0]['url'], width: 48, height: 48, fit: BoxFit.cover)
                                : const SizedBox(width: 48, height: 48),
                            title: Text(p['name'] ?? '', style: const TextStyle(color: Colors.white)),
                            subtitle: Text(p['owner']?['display_name'] ?? '', style: const TextStyle(color: Colors.grey)),
                            onTap: () async {
                              await _apiService.spotifyControl('play_context', p['uri']);
                              if (!context.mounted) return;
                              Navigator.of(context).pop();
                              ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Playing ${p['name']}')));
                              await _fetchSpotifyStatus();
                            },
                          );
                        },
                      ),
                      ListView.builder(
                        itemCount: albums.length,
                        itemBuilder: (context, i) {
                          final a = albums[i];
                          return ListTile(
                            leading: a['images'] != null && a['images'].isNotEmpty
                                ? Image.network(a['images'][0]['url'], width: 48, height: 48, fit: BoxFit.cover)
                                : const SizedBox(width: 48, height: 48),
                            title: Text(a['name'] ?? '', style: const TextStyle(color: Colors.white)),
                            subtitle: Text((a['artists'] != null && a['artists'].isNotEmpty) ? a['artists'][0]['name'] : '', style: const TextStyle(color: Colors.grey)),
                            onTap: () async {
                              await _apiService.spotifyControl('play_context', a['uri']);
                              if (!context.mounted) return;
                              Navigator.of(context).pop();
                              ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Playing ${a['name']}')));
                              await _fetchSpotifyStatus();
                            },
                          );
                        },
                      ),
                    ]),
                  )
                ],
              ),
            ),
          ),
        ),
      );
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
            _totalDevices = devices.length;
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

    Widget _buildEnergyStat(String label, String value, IconData icon) {
      return Column(
        children: [
          Icon(icon, color: Colors.white70, size: 24),
          const SizedBox(height: 4),
          Text(value, style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 16)),
          Text(label, style: const TextStyle(color: Colors.white60, fontSize: 12)),
        ],
      );
    }

    @override
    Widget build(BuildContext context) {
      final now = DateTime.now();
      final dateStr = DateFormat('EEEE d MMMM', 'nl').format(now);

      return RefreshIndicator(
        onRefresh: () async {
          await _fetchStats();
          await _fetchWeather();
        },
        child: SingleChildScrollView(
          physics: const AlwaysScrollableScrollPhysics(),
          padding: const EdgeInsets.fromLTRB(16, 16, 16, 100), // Extra padding at bottom for nav bar
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              // Topbar / Navigation
              GlassCard(
                child: Padding(
                  padding: const EdgeInsets.symmetric(vertical: 12.0, horizontal: 16.0),
                  child: Row(
                    children: [
                      Expanded(
                        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                          Text('Welkom Thuis', style: Theme.of(context).textTheme.headlineSmall?.copyWith(fontWeight: FontWeight.bold, color: Colors.white)),
                          const SizedBox(height: 4),
                          Text(dateStr, style: Theme.of(context).textTheme.bodyMedium?.copyWith(color: Colors.white70)),
                        ]),
                      ),
                      IconButton(
                        tooltip: 'Ververs',
                        onPressed: () async { await _fetchStats(); await _fetchWeather(); },
                        icon: const Icon(Icons.refresh, color: Colors.white),
                      ),
                    ],
                  ),
                ),
              ),
              const SizedBox(height: 16),
              
              // Energy Card
              if (_energyData != null)
                Container(
                  margin: const EdgeInsets.only(bottom: 20),
                  padding: const EdgeInsets.all(16),
                  decoration: BoxDecoration(
                    gradient: LinearGradient(
                      colors: [Colors.orange.shade900.withValues(alpha: 0.8), Colors.orange.shade700.withValues(alpha: 0.8)],
                      begin: Alignment.topLeft,
                      end: Alignment.bottomRight,
                    ),
                    borderRadius: BorderRadius.circular(16),
                    border: Border.all(color: Colors.white.withValues(alpha: 0.2)),
                  ),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Row(
                        children: [
                          Icon(Icons.solar_power, color: Colors.white),
                          SizedBox(width: 8),
                          Text('Energy Monitor', style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 16)),
                        ],
                      ),
                      const SizedBox(height: 16),
                      Row(
                        mainAxisAlignment: MainAxisAlignment.spaceAround,
                        children: [
                          _buildEnergyStat('Solar', '${_energyData?['solar']?['currentPower'] ?? 0} W', Icons.wb_sunny),
                          _buildEnergyStat('Grid', '${_energyData?['grid']?['currentPower'] ?? 0} W', Icons.electrical_services),
                          _buildEnergyStat('Home', '${_energyData?['home']?['currentUsage'] ?? 0} W', Icons.home),
                        ],
                      ),
                    ],
                  ),
                ),

              const SizedBox(height: 20),
              Row(
                children: [
                  Expanded(
                    child: _buildStatusCard(
                      icon: Icons.devices,
                      title: 'System',
                      subtitle: '$_activeDevices / $_totalDevices Active',
                      color: Colors.cyanAccent,
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: _buildStatusCard(
                      icon: _weatherData != null ? _getWeatherIcon(_weatherData!['weathercode']) : Icons.cloud,
                      title: 'Weather',
                      subtitle: _weatherData != null ? '${_weatherData!['temperature']}°C' : 'Loading...',
                      color: Colors.orangeAccent,
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 24),
              const Text('Snelkoppelingen', style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold, color: Colors.white)),
              const SizedBox(height: 12),
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                    _buildQuickAction(Icons.lightbulb_outline, 'Alles Uit', () => _turnOffLightsOnly()),
                    _buildQuickAction(Icons.movie_creation_outlined, 'Film', () => _activateScene('movie')),
                    _buildQuickAction(Icons.bedtime_outlined, 'Nacht', () => _activateScene('night')),
                    _buildQuickAction(Icons.exit_to_app, 'Afwezig', () => _activateScene('away')),
                ],
              ),
              const SizedBox(height: 24),
              const Text('Spotify', style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold, color: Colors.white)),
              const SizedBox(height: 12),
              _buildSpotifyCard(),
              const SizedBox(height: 24),
              if (_favoriteDevices.isNotEmpty) ...[
                const Text('Favorieten', style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold, color: Colors.white)),
                const SizedBox(height: 12),
                ListView.builder(
                  shrinkWrap: true,
                  physics: const NeverScrollableScrollPhysics(),
                  itemCount: _favoriteDevices.length,
                  itemBuilder: (context, index) {
                    // TODO: Update DeviceCard to be glassmorphic or wrap it
                    return Padding(
                      padding: const EdgeInsets.only(bottom: 8.0),
                      child: GlassCard(
                        child: DeviceCard(device: _favoriteDevices[index], onRefresh: _fetchStats),
                      ),
                    );
                  },
                ),
              ],
            ],
          ),
        ),
      );
    }

    Future<void> _turnOffLightsOnly() async {
      try {
        final devices = await _apiService.getDevices();
        final lights = devices.where((d) {
          final t = d.type.toLowerCase();
          return t.contains('light') || t.contains('yeelight') || t.contains('hue') || t.contains('lamp') || t.contains('zigbee');
        }).toList();

        for (final d in lights) {
          try {
            await _apiService.sendCommand(d.id, 'set_power', {'value': 'off'});
          } catch (e) {
            debugPrint('Failed to turn off ${d.name}: $e');
          }
        }

        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Lampen uitgeschakeld')));
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
      return GlassCard(
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Icon(icon, color: color, size: 32),
            const SizedBox(height: 12),
            Text(title, style: const TextStyle(color: Colors.white70, fontSize: 14)),
            const SizedBox(height: 4),
            Text(subtitle, style: const TextStyle(color: Colors.white, fontSize: 18, fontWeight: FontWeight.bold))
          ]),
        ),
      );
    }

            Widget _buildQuickAction(IconData icon, String label, VoidCallback onTap) {
      return Column(
        children: [
          InkWell(
            onTap: onTap,
            borderRadius: BorderRadius.circular(20),
            child: Container(
              width: 60,
              height: 60,
              decoration: BoxDecoration(
                color: Colors.white.withValues(alpha: 0.1),
                shape: BoxShape.circle,
                border: Border.all(color: Colors.white.withValues(alpha: 0.2)),
              ),
              child: Icon(icon, color: Colors.white),
            ),
          ),
          const SizedBox(height: 8),
          Text(label, style: const TextStyle(color: Colors.white70, fontSize: 12))
        ],
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

    Widget _buildSpotifyCard() {
      final isPlaying = _spotifyStatus?['is_playing'] == true;
      final item = _spotifyStatus != null && _spotifyStatus!['item'] != null ? _spotifyStatus!['item']['name'] : 'Not playing';
      final albumImages = _spotifyStatus != null && _spotifyStatus!['item'] != null && _spotifyStatus!['item']['album'] != null ? _spotifyStatus!['item']['album']['images'] as List<dynamic>? : null;
      final artwork = (albumImages != null && albumImages.isNotEmpty) ? albumImages[0]['url'] : null;
      final progress = (_spotifyStatus != null && _spotifyStatus!['progress_ms'] != null && _spotifyStatus!['item'] != null && _spotifyStatus!['item']['duration_ms'] != null) ? (_spotifyStatus!['progress_ms'] as num) / (_spotifyStatus!['item']['duration_ms'] as num) : 0.0;

      return GlassCard(
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Row(children: [
              const Icon(Icons.music_note, color: Color(0xFF1DB954), size: 36),
              const SizedBox(width: 12),
              AnimatedSwitcher(
                duration: const Duration(milliseconds: 350),
                child: artwork != null
                    ? ClipRRect(
                        borderRadius: BorderRadius.circular(8),
                        child: Image.network(artwork, key: ValueKey<String>(artwork), width: 64, height: 64, fit: BoxFit.cover),
                      )
                    : Container(
                        key: const ValueKey('no_art'),
                        width: 64,
                        height: 64,
                        decoration: BoxDecoration(
                          color: Colors.white.withValues(alpha: 0.1),
                          borderRadius: BorderRadius.circular(8),
                        ),
                        child: const Icon(Icons.music_off, color: Colors.white54),
                      ),
              ),
              const SizedBox(width: 12),
              Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                const Text('Spotify', style: TextStyle(color: Colors.white, fontSize: 16, fontWeight: FontWeight.bold)),
                const SizedBox(height: 4),
                AnimatedSwitcher(
                  duration: const Duration(milliseconds: 250),
                  child: Text(item, key: ValueKey<String>(item), style: const TextStyle(color: Colors.white70), maxLines: 1, overflow: TextOverflow.ellipsis),
                ),
                const SizedBox(height: 8),
                TweenAnimationBuilder<double>(
                  tween: Tween<double>(begin: 0.0, end: progress.clamp(0.0, 1.0)),
                  duration: const Duration(milliseconds: 300),
                  builder: (context, value, child) {
                    return LinearProgressIndicator(value: value, backgroundColor: Colors.white10, valueColor: const AlwaysStoppedAnimation<Color>(Colors.green));
                  },
                ),
                const SizedBox(height: 6),
                if (_spotifyAvailable && _spotifyDeviceName != null)
                  Text('Apparaat: $_spotifyDeviceName', style: const TextStyle(color: Colors.white54, fontSize: 12))
              ])),
              const SizedBox(width: 8),
              if (!_spotifyAvailable)
                ElevatedButton(onPressed: _openSpotifyLogin, style: ElevatedButton.styleFrom(backgroundColor: Colors.green), child: const Text('Verbinden'))
              else
                IconButton(
                  icon: const Icon(Icons.refresh, color: Colors.white70),
                  onPressed: () async { await _fetchSpotifyMe(); if (mounted) {
                    ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Spotify beschikbaar')));
                  } },
                )
            ]),
            const SizedBox(height: 12),
            Column(children: [
              Row(mainAxisAlignment: MainAxisAlignment.center, children: [
                IconButton(onPressed: _spotifyAvailable ? () async { await _apiService.spotifyControl('previous'); await _fetchSpotifyStatus(); } : null, icon: const Icon(Icons.skip_previous), color: Colors.white),
                IconButton(
                  onPressed: _spotifyAvailable ? () async { if (isPlaying) {
                    await _apiService.spotifyControl('pause');
                  } else {
                    await _apiService.spotifyControl('play');
                  } await _fetchSpotifyStatus(); } : null,
                  icon: AnimatedSwitcher(
                    duration: const Duration(milliseconds: 200),
                    transitionBuilder: (child, anim) => ScaleTransition(scale: anim, child: child),
                    child: Icon(isPlaying ? Icons.pause : Icons.play_arrow, key: ValueKey<bool>(isPlaying), color: Colors.white, size: 32),
                  ),
                ),
                IconButton(onPressed: _spotifyAvailable ? () async { await _apiService.spotifyControl('next'); await _fetchSpotifyStatus(); } : null, icon: const Icon(Icons.skip_next), color: Colors.white),
              ]),
              const SizedBox(height: 8),
              Row(mainAxisAlignment: MainAxisAlignment.center, children: [
                TextButton(onPressed: _spotifyAvailable ? _showSpotifyMusicPicker : null, child: const Text('Kies muziek', style: TextStyle(color: Colors.white70))),
                const SizedBox(width: 8),
                TextButton(onPressed: _spotifyAvailable ? () async { final q = await _showSpotifySearchDialog(); if (q != null && q.isNotEmpty) { final results = await _apiService.searchSpotify(q); if (!mounted) return; _showSpotifySearchResults(results); } } : null, child: const Text('Zoeken', style: TextStyle(color: Colors.white70))),
                const SizedBox(width: 8),
                TextButton(onPressed: _spotifyAvailable ? _showSpotifyDevicesDialog : null, child: const Text('Kies apparaat', style: TextStyle(color: Colors.white70))),
              ])
            ])
          ]),
        ),
      );
    }
  }
