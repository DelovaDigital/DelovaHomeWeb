import 'dart:convert';
import 'package:flutter/foundation.dart';
import 'package:http/http.dart' as http;
import 'package:shared_preferences/shared_preferences.dart';
import '../models/device.dart';

class ApiService {
  static const String _port = '3000';

  Future<String> getBaseUrl() async {
    final prefs = await SharedPreferences.getInstance();
    final ip = prefs.getString('hub_ip');
    final port = prefs.getString('hub_port') ?? _port;
    
    if (ip == null) {
      throw Exception('Hub not connected');
    }
    return 'https://$ip:$port';
  }

  Future<Map<String, dynamic>> getSystemInfo() async {
    final baseUrl = await getBaseUrl();
    final response = await http.get(Uri.parse('$baseUrl/api/system/info'));
    if (response.statusCode == 200) {
      return json.decode(response.body);
    } else {
      throw Exception('Failed to load system info');
    }
  }

  Future<void> setHubIp(String ip) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString('hub_ip', ip);
  }

  Future<List<Device>> getDevices() async {
    final baseUrl = await getBaseUrl();
    try {
      final response = await http.get(Uri.parse('$baseUrl/api/devices'));
      if (response.statusCode == 200) {
        final List<dynamic> data = json.decode(response.body);
        return data.map((json) => Device.fromJson(json)).toList();
      } else {
        throw Exception('Failed to load devices');
      }
    } catch (e) {
      throw Exception('Connection error: $e');
    }
  }

  Future<void> sendCommand(String deviceId, String command, [Map<String, dynamic>? params]) async {
    final baseUrl = await getBaseUrl();
    // Corrected URL to match server.js: /api/devices/:id/command
    final url = Uri.parse('$baseUrl/api/devices/$deviceId/command');
    
    // Corrected Body to match server.js expectation: { command, value }
    final body = {
      'command': command,
      'value': params?['value'],
    };

    try {
      await http.post(
        url,
        headers: {'Content-Type': 'application/json'},
        body: json.encode(body),
      );
    } catch (e) {
      debugPrint('Error sending command: $e');
    }
  }

  Future<void> activateScene(String sceneName) async {
    final baseUrl = await getBaseUrl();
    final url = Uri.parse('$baseUrl/api/scenes/$sceneName');
    try {
      await http.post(url);
    } catch (e) {
      debugPrint('Error activating scene: $e');
    }
  }

  Future<Map<String, dynamic>> checkUpdate() async {
    final baseUrl = await getBaseUrl();
    try {
      final response = await http.get(Uri.parse('$baseUrl/api/system/check-update'));
      if (response.statusCode == 200) {
        return json.decode(response.body);
      } else {
        throw Exception('Failed to check for updates');
      }
    } catch (e) {
      throw Exception('Connection error: $e');
    }
  }

  Future<Map<String, dynamic>> updateSystem() async {
    final baseUrl = await getBaseUrl();
    try {
      final response = await http.post(Uri.parse('$baseUrl/api/system/update'));
      if (response.statusCode == 200) {
        return json.decode(response.body);
      } else {
        throw Exception('Failed to update system');
      }
    } catch (e) {
      throw Exception('Connection error: $e');
    }
  }

  Future<List<dynamic>> getSpotifyDevices() async {
    final baseUrl = await getBaseUrl();
    try {
      final response = await http.get(Uri.parse('$baseUrl/api/spotify/devices'));
      if (response.statusCode == 200) {
        return json.decode(response.body);
      } else {
        return [];
      }
    } catch (e) {
      return [];
    }
  }

  Future<Map<String, dynamic>> getSpotifyStatus() async {
    final baseUrl = await getBaseUrl();
    try {
      final response = await http.get(Uri.parse('$baseUrl/api/spotify/status'));
      if (response.statusCode == 200) {
        return json.decode(response.body);
      }
    } catch (e) {
      debugPrint('Error fetching spotify status: $e');
    }
    return {'is_playing': false};
  }

  Future<List<dynamic>> getSpotifyPlaylists() async {
    final baseUrl = await getBaseUrl();
    try {
      final response = await http.get(Uri.parse('$baseUrl/api/spotify/playlists'));
      if (response.statusCode == 200) {
        return json.decode(response.body);
      }
    } catch (e) {
      debugPrint('Error fetching playlists: $e');
    }
    return [];
  }

  Future<List<dynamic>> getSpotifyAlbums() async {
    final baseUrl = await getBaseUrl();
    try {
      final response = await http.get(Uri.parse('$baseUrl/api/spotify/albums'));
      if (response.statusCode == 200) {
        return json.decode(response.body);
      }
    } catch (e) {
      debugPrint('Error fetching albums: $e');
    }
    return [];
  }

  Future<Map<String, dynamic>> searchSpotify(String q) async {
    final baseUrl = await getBaseUrl();
    try {
      final response = await http.get(Uri.parse('$baseUrl/api/spotify/search?q=${Uri.encodeComponent(q)}'));
      if (response.statusCode == 200) {
        return json.decode(response.body);
      }
    } catch (e) {
      debugPrint('Error searching spotify: $e');
    }
    return {'tracks': [], 'artists': []};
  }

  Future<void> spotifyControl(String command, [dynamic value]) async {
    final baseUrl = await getBaseUrl();
    try {
      await http.post(
        Uri.parse('$baseUrl/api/spotify/control'),
        headers: {'Content-Type': 'application/json'},
        body: json.encode({'command': command, 'value': value}),
      );
    } catch (e) {
      debugPrint('Error sending spotify control: $e');
    }
  }

  Future<void> transferSpotifyPlayback(String deviceId) async {
    final baseUrl = await getBaseUrl();
    try {
      await http.post(
        Uri.parse('$baseUrl/api/spotify/control'),
        headers: {'Content-Type': 'application/json'},
        body: json.encode({'command': 'transfer', 'value': deviceId}),
      );
    } catch (e) {
      debugPrint('Error transferring playback: $e');
    }
  }
}
