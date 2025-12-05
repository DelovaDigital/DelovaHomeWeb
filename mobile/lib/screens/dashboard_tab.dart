import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'dart:convert';
import 'package:http/http.dart' as http;
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

  @override
  void initState() {
    super.initState();
    _fetchStats();
    _fetchWeather();
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
}
