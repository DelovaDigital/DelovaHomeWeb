import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'dart:async';
import 'dart:convert';
import 'package:http/http.dart' as http;
import 'package:url_launcher/url_launcher.dart';
import '../services/api_service.dart';
import '../models/device.dart';
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
  bool _isLoading = true;
  List<Device> _favoriteDevices = [];
  Map<String, dynamic>? _weatherData;
  Map<String, dynamic>? _spotifyStatus;
  bool _spotifyLoading = false;
  Timer? _spotifyTimer;

  @override
  void initState() {
    super.initState();
    _fetchStats();
    _fetchWeather();
    _fetchSpotifyStatus();
    // Periodically refresh Spotify status so UI stays live
    _spotifyTimer = Timer.periodic(const Duration(seconds: 5), (_) {
      _fetchSpotifyStatus();
    });
  }

  Future<void> _fetchSpotifyStatus() async {
    try {
      final status = await _apiService.getSpotifyStatus();
      if (mounted) setState(() => _spotifyStatus = status);
    } catch (e) {
      debugPrint('Spotify status error: $e');
    }
  }

  @override
  void dispose() {
    _spotifyTimer?.cancel();
    super.dispose();
  }

  Future<void> _openSpotifyLogin() async {
    try {
      final baseUrl = await _apiService.getBaseUrl();
      final url = Uri.parse('$baseUrl/api/spotify/login');
      if (await canLaunchUrl(url)) {
        await launchUrl(url, mode: LaunchMode.externalApplication);
      } else {
        ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Cannot open browser')));
      }
    } catch (e) {
      debugPrint('Open spotify login error: $e');
    }
  }

  Future<void> _showSpotifyDevicesDialog() async {
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
                  Navigator.of(context).pop();
                  await _apiService.transferSpotifyPlayback(d['id']);
                  ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Transferred to ${d['name']}')));
                },
              );
            },
          ),
        ),
      ),
    );
  }

  Future<void> _showSpotifyMusicPicker() async {
    setState(() => _spotifyLoading = true);
    final playlists = await _apiService.getSpotifyPlaylists();
    final albums = await _apiService.getSpotifyAlbums();
    setState(() => _spotifyLoading = false);

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
                            Navigator.of(context).pop();
                            await _apiService.spotifyControl('play_context', p['uri']);
                            ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Playing ${p['name']}')));
                            _fetchSpotifyStatus();
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
                            Navigator.of(context).pop();
                            await _apiService.spotifyControl('play_context', a['uri']);
                            ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Playing ${a['name']}')));
                            _fetchSpotifyStatus();
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
    // Using Open-Meteo API (Free, no key required)
    // Defaulting to a generic location (London) if no GPS. 
    // In a real app, use geolocator package.
    try {
      final response = await http.get(Uri.parse(
          'https://api.open-meteo.com/v1/forecast?latitude=51.5074&longitude=-0.1278&current_weather=true'));
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
          // Simple "Favorites" logic: First 3 active devices, or just first 3 devices
          _favoriteDevices = devices.where((d) => d.status.powerState == 'on').take(3).toList();
          if (_favoriteDevices.isEmpty) {
             _favoriteDevices = devices.take(3).toList();
          }
          _isLoading = false;
        });
      }
    } catch (e) {
      if (mounted) {
        setState(() {
          _isLoading = false;
        });
      }
    }
  }

  Future<void> _activateScene(String sceneName) async {
    setState(() => _isLoading = true);
    try {
      await _apiService.activateScene(sceneName);
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Scene activated: $sceneName')),
        );
        _fetchStats(); // Refresh status
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Failed to activate scene: $e')),
        );
      }
    } finally {
      if (mounted) setState(() => _isLoading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final now = DateTime.now();
    final dateStr = DateFormat('EEEE, d MMMM').format(now);

    return RefreshIndicator(
      onRefresh: () async {
        await _fetchStats();
        await _fetchWeather();
      },
      child: SingleChildScrollView(
        physics: const AlwaysScrollableScrollPhysics(),
        padding: const EdgeInsets.all(16.0),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Header
            Text(
              'Welcome Home',
              style: Theme.of(context).textTheme.headlineMedium?.copyWith(fontWeight: FontWeight.bold),
            ),
            Text(
              dateStr,
              style: Theme.of(context).textTheme.titleMedium?.copyWith(color: Colors.grey),
            ),
            const SizedBox(height: 20),

            // Weather & Status Row
            Row(
              children: [
                Expanded(
                  child: _buildStatusCard(
                    icon: Icons.devices,
                    title: 'System',
                    subtitle: '$_activeDevices / $_totalDevices Active',
                    color: Colors.blue,
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: _buildStatusCard(
                    icon: _weatherData != null ? _getWeatherIcon(_weatherData!['weathercode']) : Icons.cloud,
                    title: 'Weather',
                    subtitle: _weatherData != null ? '${_weatherData!['temperature']}°C' : 'Loading...',
                    color: Colors.orange,
                  ),
                ),
              ],
            ),
            const SizedBox(height: 24),

            // Quick Actions
            const Text('Quick Actions', style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold)),
            const SizedBox(height: 12),
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                _buildQuickAction(Icons.lightbulb_outline, 'All Off', () => _activateScene('all_off')),
                _buildQuickAction(Icons.movie_creation_outlined, 'Movie', () => _activateScene('movie')),
                _buildQuickAction(Icons.bedtime_outlined, 'Night', () => _activateScene('night')),
                _buildQuickAction(Icons.exit_to_app, 'Away', () => _activateScene('away')),
              ],
            ),
            const SizedBox(height: 24),

            // Spotify
            const Text('Spotify', style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold)),
            const SizedBox(height: 12),
            _buildSpotifyCard(),
            const SizedBox(height: 24),

            // Favorites / Active Devices
            if (_favoriteDevices.isNotEmpty) ...[
              const Text('Favorites', style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold)),
              const SizedBox(height: 12),
              ListView.builder(
                shrinkWrap: true,
                physics: const NeverScrollableScrollPhysics(),
                itemCount: _favoriteDevices.length,
                itemBuilder: (context, index) {
                  return DeviceCard(
                    device: _favoriteDevices[index],
                    onRefresh: _fetchStats,
                  );
                },
              ),
            ],
          ],
        ),
      ),
    );
  }

  Widget _buildStatusCard({required IconData icon, required String title, required String subtitle, required Color color}) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Colors.grey[900],
        borderRadius: BorderRadius.circular(16),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(icon, color: color, size: 32),
          const SizedBox(height: 12),
          Text(title, style: const TextStyle(color: Colors.grey, fontSize: 14)),
          const SizedBox(height: 4),
          Text(subtitle, style: const TextStyle(color: Colors.white, fontSize: 18, fontWeight: FontWeight.bold)),
        ],
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
              color: Colors.grey[900],
              shape: BoxShape.circle,
            ),
            child: Icon(icon, color: Colors.white),
          ),
        ),
        const SizedBox(height: 8),
        Text(label, style: const TextStyle(color: Colors.grey, fontSize: 12)),
      ],
    );
  }

  IconData _getWeatherIcon(int? code) {
    if (code == null) return Icons.cloud;
    if (code == 0) return Icons.wb_sunny;
    if (code < 3) return Icons.wb_cloudy;
    if (code < 50) return Icons.foggy;
    if (code < 70) return Icons.grain; // Rain
    if (code < 80) return Icons.ac_unit; // Snow
    return Icons.thunderstorm;
  }

  Widget _buildSpotifyCard() {
    final isPlaying = _spotifyStatus?['is_playing'] == true;
    final item = _spotifyStatus != null && _spotifyStatus!['item'] != null ? _spotifyStatus!['item']['name'] : 'Not playing';
    final albumImages = _spotifyStatus != null && _spotifyStatus!['item'] != null && _spotifyStatus!['item']['album'] != null
      ? _spotifyStatus!['item']['album']['images'] as List<dynamic>?
      : null;
    final artwork = (albumImages != null && albumImages.isNotEmpty) ? albumImages[0]['url'] : null;
    final progress = (_spotifyStatus != null && _spotifyStatus!['progress_ms'] != null && _spotifyStatus!['item'] != null && _spotifyStatus!['item']['duration_ms'] != null)
      ? (_spotifyStatus!['progress_ms'] as num) / (_spotifyStatus!['item']['duration_ms'] as num)
      : 0.0;

    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Colors.grey[900],
        borderRadius: BorderRadius.circular(12),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              const Icon(Icons.music_note, color: Color(0xFF1DB954), size: 36),
              const SizedBox(width: 12),
              artwork != null
                  ? Image.network(artwork, width: 64, height: 64, fit: BoxFit.cover)
                  : Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          const Text('Spotify', style: TextStyle(color: Colors.white, fontSize: 16, fontWeight: FontWeight.bold)),
                          const SizedBox(height: 4),
                          Text(item, style: const TextStyle(color: Colors.grey)),
                        ],
                      ),
                    ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Text('Spotify', style: TextStyle(color: Colors.white, fontSize: 16, fontWeight: FontWeight.bold)),
                    const SizedBox(height: 4),
                    Text(item, style: const TextStyle(color: Colors.grey)),
                    const SizedBox(height: 8),
                    LinearProgressIndicator(
                      value: progress.clamp(0.0, 1.0),
                      backgroundColor: Colors.grey[800],
                      valueColor: AlwaysStoppedAnimation<Color>(Colors.green),
                    ),
                  ],
                ),
              ),
              ElevatedButton(
                onPressed: _openSpotifyLogin,
                child: const Text('Connect'),
                style: ElevatedButton.styleFrom(backgroundColor: Colors.green),
              ),
            ],
          ),
          const SizedBox(height: 12),
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
                  Row(
                children: [
                  IconButton(
                    onPressed: () async { await _apiService.spotifyControl('previous'); _fetchSpotifyStatus(); },
                    icon: const Icon(Icons.skip_previous),
                    color: Colors.white,
                  ),
                  IconButton(
                    onPressed: () async {
                      if (isPlaying) await _apiService.spotifyControl('pause');
                      else await _apiService.spotifyControl('play');
                      _fetchSpotifyStatus();
                    Row(
                    icon: Icon(isPlaying ? Icons.pause : Icons.play_arrow),
                    color: Colors.white,
                  ),
                  IconButton(
                    onPressed: () async { await _apiService.spotifyControl('next'); _fetchSpotifyStatus(); },
                    const SizedBox(width: 8),
                    TextButton(
                      onPressed: () async {
                        final q = await _showSpotifySearchDialog();
                        if (q != null && q.isNotEmpty) {
                          final results = await _apiService.searchSpotify(q);
                          if (!mounted) return;
                          _showSpotifySearchResults(results);
                        }
                      },
                      child: const Text('Search'),
                    ),
                    icon: const Icon(Icons.skip_next),
                    color: Colors.white,
                  ),
                ],
              ),
              Row(
                children: [
                  TextButton(
                    onPressed: _showSpotifyMusicPicker,
                    child: const Text('Choose Music'),
                  ),
                  const SizedBox(width: 8),
                  TextButton(
                    onPressed: _showSpotifyDevicesDialog,
                    child: const Text('Choose Device'),
                  ),
                ],
              )
            ],
          )
        ],
      ),
    );
  }
}
