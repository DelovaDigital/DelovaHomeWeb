import 'dart:convert';
import 'package:http/http.dart' as http;
import 'package:shared_preferences/shared_preferences.dart';
import '../models/device.dart';

class ApiService {
  static const String _defaultIp = '192.168.0.216';
  static const String _port = '3000';

  Future<String> getBaseUrl() async {
    final prefs = await SharedPreferences.getInstance();
    final ip = prefs.getString('hub_ip') ?? _defaultIp;
    return 'https://$ip:$_port';
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
    final url = Uri.parse('$baseUrl/api/device/$command');
    
    final body = {
      'id': deviceId,
      ...?params,
    };

    try {
      await http.post(
        url,
        headers: {'Content-Type': 'application/json'},
        body: json.encode(body),
      );
    } catch (e) {
      print('Error sending command: $e');
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
}
