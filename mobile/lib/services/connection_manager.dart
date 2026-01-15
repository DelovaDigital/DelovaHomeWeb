import 'package:http/http.dart' as http;

// Auto-generated helper for cloud connection switching
class ConnectionManager {
    
    // Simple latency check
    static Future<bool> isLocalAvailable(String ip) async {
       try {
          final uri = Uri.parse(ip.startsWith('http') ? '$ip/api/health' : 'https://$ip:3000/api/health');
          final response = await http.get(uri).timeout(const Duration(seconds: 2));
          return response.statusCode == 200;
       } catch (e) {
          return false;
       }
    }
}
