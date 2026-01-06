import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'dart:async';
import 'dart:convert';
import 'package:http/http.dart' as http;
import 'package:shared_preferences/shared_preferences.dart';
import 'spotify_login_screen.dart';
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
    int _totalDevices = 0;
    List<Device> _favoriteDevices = [];
    Map<String, dynamic>? _weatherData;
    Map<String, dynamic>? _spotifyStatus;
    Map<String, dynamic>? _energyData;
    Map<String, dynamic>? _presenceData;
    bool _spotifyAvailable = false;
    String? _spotifyDeviceName;
    Timer? _spotifyTimer;
    Timer? _energyTimer;
    Timer? _presenceTimer;
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
      _spotifyTimer = Timer.periodic(const Duration(seconds: 5), (_) {
        _fetchSpotifyStatus();
        _fetchSpotifyMe();
      });
      _energyTimer = Timer.periodic(const Duration(seconds: 5), (_) => _fetchEnergyData());
      _presenceTimer = Timer.periodic(const Duration(seconds: 10), (_) => _fetchPresenceData());
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
      super.dispose();
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

    Future<void> _openSpotifyLogin() async {
      try {
        final baseUrl = await _apiService.getBaseUrl();
        final prefs = await SharedPreferences.getInstance();
        final userId = prefs.getString('userId');
        final username = prefs.getString('username');
        
        String uriString = '$baseUrl/api/spotify/login';
        final params = <String>[];
        if (userId != null) params.add('userId=$userId');
        if (username != null) params.add('username=$username');
        
        if (params.isNotEmpty) {
          uriString += '?${params.join('&')}';
        }

        final headers = await _apiService.getHeaders();

        if (mounted) {
          await Navigator.push(
            context,
            MaterialPageRoute(
              builder: (context) => SpotifyLoginScreen(
                url: uriString,
                headers: headers,
              ),
            ),
          );
          // Refresh status after return
          _fetchSpotifyStatus();
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
                                    await _apiService.transferSpotifyPlayback(d['id']);
                                    if (!context.mounted) return;
                                    Navigator.of(context).pop();
                                    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Transferred to ${d['name']}')));
                                    // small delay to let transfer happen then refresh
                                    await Future.delayed(const Duration(milliseconds: 500));
                                    await _fetchSpotifyStatus();
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
            title: Text(t('choose_music'), style: const TextStyle(color: Colors.white)),
            content: SizedBox(
              width: double.maxFinite,
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  TabBar(tabs: [Tab(text: t('playlists')), Tab(text: t('albums'))]),
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


    @override
    Widget build(BuildContext context) {
      final now = DateTime.now();
      final dateStr = DateFormat('EEEE d MMMM', _lang).format(now);
      final isDark = Theme.of(context).brightness == Brightness.dark;
      final textColor = isDark ? Colors.white : Colors.black87;
      final subTextColor = isDark ? Colors.white70 : Colors.black54;

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
              Card(
                child: Padding(
                  padding: const EdgeInsets.symmetric(vertical: 12.0, horizontal: 16.0),
                  child: Column(
                    children: [
                      Row(
                        children: [
                          Expanded(
                            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                              Text(t('welcome_home'), style: Theme.of(context).textTheme.headlineSmall?.copyWith(fontWeight: FontWeight.bold, color: textColor)),
                              const SizedBox(height: 4),
                              Text(dateStr, style: Theme.of(context).textTheme.bodyMedium?.copyWith(color: subTextColor)),
                            ]),
                          ),
                          IconButton(
                            tooltip: 'Ververs',
                            onPressed: () async { await _fetchStats(); await _fetchWeather(); },
                            icon: Icon(Icons.refresh, color: textColor),
                          ),
                        ],
                      ),
                      const SizedBox(height: 12),
                      const AIAssistantWidget(),
                    ],
                  ),
                ),
              ),
              const SizedBox(height: 16),
              
              // Presence & Energy Row
              Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  // Presence
                  Expanded(
                    child: Card(
                      child: Padding(
                        padding: const EdgeInsets.all(12.0),
                        child: _presenceData != null 
                          ? PresenceWidget(data: _presenceData!)
                          : const Center(child: CircularProgressIndicator(color: Colors.white)),
                      ),
                    ),
                  ),
                  const SizedBox(width: 16),
                  // Energy
                  Expanded(
                    child: Card(
                      child: Padding(
                        padding: const EdgeInsets.all(12.0),
                        child: _energyData != null 
                          ? EnergyWidget(data: _energyData!)
                          : const Center(child: CircularProgressIndicator(color: Colors.white)),
                      ),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 16),
              const SizedBox(height: 16),
              
              // Spotify Card
              if (_spotifyStatus != null && _spotifyStatus!['is_playing'] == true)
                Container(
                  margin: const EdgeInsets.only(bottom: 20),
                  padding: const EdgeInsets.all(20),
                  decoration: BoxDecoration(
                    gradient: LinearGradient(
                      colors: [Colors.green.shade800, Colors.black],
                      begin: Alignment.topLeft,
                      end: Alignment.bottomRight,
                    ),
                    borderRadius: BorderRadius.circular(24),
                    boxShadow: [
                      BoxShadow(
                        color: Colors.green.withValues(alpha: 0.3),
                        blurRadius: 20,
                        offset: const Offset(0, 10),
                      ),
                    ],
                  ),
                  child: Column(
                    children: [
                      Row(
                        children: [
                          Container(
                            padding: const EdgeInsets.all(8),
                            decoration: BoxDecoration(color: Colors.black26, borderRadius: BorderRadius.circular(12)),
                            child: const Icon(Icons.music_note, color: Colors.greenAccent, size: 20),
                          ),
                          const SizedBox(width: 12),
                          const Text('Now Playing', style: TextStyle(color: Colors.white70, fontWeight: FontWeight.w600, fontSize: 14)),
                          const Spacer(),
                          IconButton(
                            icon: const Icon(Icons.speaker_group_outlined, color: Colors.white70),
                            onPressed: _showSpotifyDevicesDialog,
                            tooltip: 'Connect Device',
                          ),
                        ],
                      ),
                      const SizedBox(height: 20),
                      GestureDetector(
                        onTap: () {
                           showModalBottomSheet(
                             context: context,
                             backgroundColor: Colors.grey[900],
                             builder: (context) {
                               return Wrap(
                                 children: [
                                   ListTile(
                                     leading: const Icon(Icons.search, color: Colors.white),
                                     title: const Text('Search Music', style: TextStyle(color: Colors.white)),
                                     onTap: () async {
                                        Navigator.pop(context);
                                        final q = await _showSpotifySearchDialog();
                                        if (q != null && q.isNotEmpty) {
                                          final res = await _apiService.searchSpotify(q);
                                          if (mounted) _showSpotifySearchResults(res);
                                        }
                                     },
                                   ),
                                   ListTile(
                                     leading: const Icon(Icons.playlist_play, color: Colors.white),
                                     title: const Text('Your Playlists', style: TextStyle(color: Colors.white)),
                                     onTap: () {
                                       Navigator.pop(context);
                                       _showSpotifyLibraryDialog('playlists');
                                     },
                                   ),
                                   ListTile(
                                      leading: const Icon(Icons.album, color: Colors.white),
                                      title: const Text('Your Albums', style: TextStyle(color: Colors.white)),
                                      onTap: () {
                                        Navigator.pop(context);
                                        _showSpotifyLibraryDialog('albums');
                                      },
                                   ),
                                 ]
                               );
                             }
                           );
                        },
                        child: Row(
                        children: [
                          Hero(
                            tag: 'spotify_art',
                            child: ClipRRect(
                              borderRadius: BorderRadius.circular(16),
                              child: _spotifyStatus!['item'] != null && _spotifyStatus!['item']['album'] != null && _spotifyStatus!['item']['album']['images'].isNotEmpty
                                  ? Image.network(
                                      _spotifyStatus!['item']['album']['images'][0]['url'],
                                      width: 80,
                                      height: 80,
                                      fit: BoxFit.cover,
                                    )
                                  : Container(
                                      width: 80,
                                      height: 80,
                                      color: Colors.white10,
                                      child: const Icon(Icons.music_note, color: Colors.white54, size: 40),
                                    ),
                            ),
                          ),
                          const SizedBox(width: 16),
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(
                                  _spotifyStatus!['item'] != null ? _spotifyStatus!['item']['name'] : t('unknown_title'),
                                  style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 18),
                                  maxLines: 1,
                                  overflow: TextOverflow.ellipsis,
                                ),
                                const SizedBox(height: 6),
                                Text(
                                  _spotifyStatus!['item'] != null ? _spotifyStatus!['item']['artists'][0]['name'] : t('unknown_artist'),
                                  style: const TextStyle(color: Colors.white70, fontSize: 15),
                                  maxLines: 1,
                                  overflow: TextOverflow.ellipsis,
                                ),
                              ],
                            ),
                          ),
                          const Icon(Icons.expand_more, color: Colors.white54),
                        ],
                      ),
                      ),
                      const SizedBox(height: 24),
                      // Progress Bar placeholder (visual only for now)
                      ClipRRect(
                        borderRadius: BorderRadius.circular(4),
                        child: LinearProgressIndicator(
                          value: 0.3, // TODO: Make dynamic
                          backgroundColor: Colors.white12,
                          valueColor: AlwaysStoppedAnimation<Color>(Colors.greenAccent),
                          minHeight: 4,
                        ),
                      ),
                      const SizedBox(height: 20),
                      Row(
                        mainAxisAlignment: MainAxisAlignment.spaceEvenly,
                        children: [
                          IconButton(
                            icon: const Icon(Icons.skip_previous_rounded, color: Colors.white, size: 36),
                            onPressed: () async {
                              await _apiService.spotifyControl('previous');
                              await _fetchSpotifyStatus();
                            },
                          ),
                          Container(
                            decoration: const BoxDecoration(shape: BoxShape.circle, color: Colors.white),
                            child: IconButton(
                              icon: Icon(
                                _spotifyStatus!['is_playing'] ? Icons.pause_rounded : Icons.play_arrow_rounded,
                                color: Colors.black,
                                size: 32,
                              ),
                              padding: const EdgeInsets.all(12),
                              onPressed: () async {
                                await _apiService.spotifyControl(_spotifyStatus!['is_playing'] ? 'pause' : 'play');
                                await _fetchSpotifyStatus();
                              },
                            ),
                          ),
                          IconButton(
                            icon: const Icon(Icons.skip_next_rounded, color: Colors.white, size: 36),
                            onPressed: () async {
                              await _apiService.spotifyControl('next');
                              await _fetchSpotifyStatus();
                            },
                          ),
                        ],
                      ),
                    ],
                  ),
                )

              else
                Container(
                  margin: const EdgeInsets.only(bottom: 20),
                  child: Card(
                    child: ListTile(
                      leading: const Icon(Icons.music_note, color: Colors.green),
                      title: Text('Spotify', style: TextStyle(color: textColor)),
                      subtitle: Text(_spotifyAvailable ? 'Ready to play on $_spotifyDeviceName\nTap to search' : 'Tap to connect Spotify', style: TextStyle(color: subTextColor)),
                      trailing: Icon(Icons.chevron_right, color: subTextColor),
                      onTap: () async {
                        if (_spotifyAvailable) {
                          // Show options to Search or Pick Playlist
                           showModalBottomSheet(
                             context: context,
                             backgroundColor: Colors.grey[900],
                             builder: (context) {
                               return Wrap(
                                 children: [
                                   ListTile(
                                     leading: const Icon(Icons.search, color: Colors.white),
                                     title: const Text('Search Music', style: TextStyle(color: Colors.white)),
                                     onTap: () async {
                                        Navigator.pop(context);
                                        final q = await _showSpotifySearchDialog();
                                        if (q != null && q.isNotEmpty) {
                                          final res = await _apiService.searchSpotify(q);
                                          if (mounted) _showSpotifySearchResults(res);
                                        }
                                     },
                                   ),
                                   ListTile(
                                     leading: const Icon(Icons.playlist_play, color: Colors.white),
                                     title: const Text('Your Playlists', style: TextStyle(color: Colors.white)),
                                     onTap: () {
                                       Navigator.pop(context);
                                       _showSpotifyLibraryDialog('playlists');
                                     },
                                   ),
                                   ListTile(
                                      leading: const Icon(Icons.album, color: Colors.white),
                                      title: const Text('Your Albums', style: TextStyle(color: Colors.white)),
                                      onTap: () {
                                        Navigator.pop(context);
                                        _showSpotifyLibraryDialog('albums');
                                      },
                                   ),
                                 ]
                               );
                             }
                           );
                        } else {
                          _openSpotifyLogin();
                        }
                      },
                    ),
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
              Text('Snelkoppelingen', style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold, color: textColor)),
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
              /*
              Text('Spotify', style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold, color: textColor)),
              const SizedBox(height: 12),
              */
              /*
              _buildSpotifyCard(),
              const SizedBox(height: 24),
              */
              if (_favoriteDevices.isNotEmpty) ...[
                Text('Favorieten', style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold, color: textColor)),
                const SizedBox(height: 12),
                ListView.builder(
                  shrinkWrap: true,
                  physics: const NeverScrollableScrollPhysics(),
                  itemCount: _favoriteDevices.length,
                  itemBuilder: (context, index) {
                    return Padding(
                      padding: const EdgeInsets.only(bottom: 8.0),
                      child: DeviceCard(device: _favoriteDevices[index], onRefresh: _fetchStats),
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
    final cardColor = theme.colorScheme.surfaceContainer;

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

    Widget _buildQuickAction(IconData icon, String label, VoidCallback onTap) {
      final theme = Theme.of(context);
      
      return Expanded(
        child: GestureDetector(
          onTap: onTap,
          child: Column(
            children: [
              Container(
                width: 60,
                height: 60,
                decoration: BoxDecoration(
                  color: theme.colorScheme.surfaceContainerHighest,
                  borderRadius: BorderRadius.circular(20),
                ),
                child: Icon(icon, color: theme.colorScheme.onSurfaceVariant, size: 26),
              ),
              const SizedBox(height: 8),
              Text(
                label, 
                style: TextStyle(
                  color: theme.colorScheme.onSurface, 
                  fontSize: 12, 
                  fontWeight: FontWeight.w500
                ),
                textAlign: TextAlign.center,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
              )
            ],
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

    Widget _buildSpotifyCard() {
      final isDark = Theme.of(context).brightness == Brightness.dark;
      final textColor = isDark ? Colors.white : Colors.black87;
      final subTextColor = isDark ? Colors.white70 : Colors.black54;
      final iconColor = isDark ? Colors.white : Colors.black87;
      final iconBgColor = isDark ? Colors.white.withValues(alpha: 0.1) : Colors.black.withValues(alpha: 0.05);

      final isPlaying = _spotifyStatus?['is_playing'] == true;
      final item = _spotifyStatus != null && _spotifyStatus!['item'] != null ? _spotifyStatus!['item']['name'] : 'Not playing';
      final albumImages = _spotifyStatus != null && _spotifyStatus!['item'] != null && _spotifyStatus!['item']['album'] != null ? _spotifyStatus!['item']['album']['images'] as List<dynamic>? : null;
      final artwork = (albumImages != null && albumImages.isNotEmpty) ? albumImages[0]['url'] : null;
      final progress = (_spotifyStatus != null && _spotifyStatus!['progress_ms'] != null && _spotifyStatus!['item'] != null && _spotifyStatus!['item']['duration_ms'] != null) ? (_spotifyStatus!['progress_ms'] as num) / (_spotifyStatus!['item']['duration_ms'] as num) : 0.0;

      return Card(
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
                          color: iconBgColor,
                          borderRadius: BorderRadius.circular(8),
                        ),
                        child: Icon(Icons.music_off, color: subTextColor),
                      ),
              ),
              const SizedBox(width: 12),
              Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text('Spotify', style: TextStyle(color: textColor, fontSize: 16, fontWeight: FontWeight.bold)),
                const SizedBox(height: 4),
                AnimatedSwitcher(
                  duration: const Duration(milliseconds: 250),
                  child: Text(item, key: ValueKey<String>(item), style: TextStyle(color: subTextColor), maxLines: 1, overflow: TextOverflow.ellipsis),
                ),
                const SizedBox(height: 8),
                TweenAnimationBuilder<double>(
                  tween: Tween<double>(begin: 0.0, end: progress.clamp(0.0, 1.0)),
                  duration: const Duration(milliseconds: 300),
                  builder: (context, value, child) {
                    return LinearProgressIndicator(value: value, backgroundColor: isDark ? Colors.white10 : Colors.black12, valueColor: const AlwaysStoppedAnimation<Color>(Colors.green));
                  },
                ),
                const SizedBox(height: 6),
                if (_spotifyAvailable && _spotifyDeviceName != null)
                  Text('Apparaat: $_spotifyDeviceName', style: TextStyle(color: subTextColor, fontSize: 12))
              ])),
              const SizedBox(width: 8),
              if (!_spotifyAvailable)
                ElevatedButton(onPressed: _openSpotifyLogin, style: ElevatedButton.styleFrom(backgroundColor: Colors.green), child: const Text('Verbinden'))
              else
                IconButton(
                  icon: Icon(Icons.refresh, color: subTextColor),
                  onPressed: () async { await _fetchSpotifyMe(); if (mounted) {
                    ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Spotify beschikbaar')));
                  } },
                )
            ]),
            const SizedBox(height: 12),
            Column(children: [
              Row(mainAxisAlignment: MainAxisAlignment.center, children: [
                IconButton(onPressed: _spotifyAvailable ? () async { await _apiService.spotifyControl('previous'); await _fetchSpotifyStatus(); } : null, icon: const Icon(Icons.skip_previous), color: iconColor),
                IconButton(
                  onPressed: _spotifyAvailable ? () async { if (isPlaying) {
                    await _apiService.spotifyControl('pause');
                  } else {
                    await _apiService.spotifyControl('play');
                  } await _fetchSpotifyStatus(); } : null,
                  icon: AnimatedSwitcher(
                    duration: const Duration(milliseconds: 200),
                    transitionBuilder: (child, anim) => ScaleTransition(scale: anim, child: child),
                    child: Icon(isPlaying ? Icons.pause : Icons.play_arrow, key: ValueKey<bool>(isPlaying), color: iconColor, size: 32),
                  ),
                ),
                IconButton(onPressed: _spotifyAvailable ? () async { await _apiService.spotifyControl('next'); await _fetchSpotifyStatus(); } : null, icon: const Icon(Icons.skip_next), color: iconColor),
              ]),
              const SizedBox(height: 8),
              Row(mainAxisAlignment: MainAxisAlignment.center, children: [
                TextButton(onPressed: _spotifyAvailable ? _showSpotifyMusicPicker : null, child: Text('Kies muziek', style: TextStyle(color: subTextColor))),
                const SizedBox(width: 8),
                TextButton(onPressed: _spotifyAvailable ? () async { final q = await _showSpotifySearchDialog(); if (q != null && q.isNotEmpty) { final results = await _apiService.searchSpotify(q); if (!mounted) return; _showSpotifySearchResults(results); } } : null, child: Text('Zoeken', style: TextStyle(color: subTextColor))),
                const SizedBox(width: 8),
                TextButton(onPressed: _spotifyAvailable ? _showSpotifyDevicesDialog : null, child: Text('Kies apparaat', style: TextStyle(color: subTextColor))),
              ])
            ])
          ]),
        ),
      );
    }
  }
