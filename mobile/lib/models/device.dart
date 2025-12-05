class Device {
  final String id;
  final String name;
  final String type;
  final String ip;
  final String? room;
  final DeviceStatus status;

  Device({
    required this.id,
    required this.name,
    required this.type,
    required this.ip,
    this.room,
    required this.status,
  });

  factory Device.fromJson(Map<String, dynamic> json) {
    return Device(
      id: json['id'] ?? '',
      name: json['name'] ?? 'Unknown',
      type: json['type'] ?? 'unknown',
      ip: json['ip'] ?? '',
      room: json['room'],
      status: DeviceStatus.fromJson(json['state'] ?? json['status'] ?? {}),
    );
  }
}

class DeviceStatus {
  final String powerState; // 'on' or 'off' usually, but sometimes boolean in JS
  final bool isOn;
  final String? app;
  final String? title;
  final String? artist;
  final double volume;
  final double brightness;

  DeviceStatus({
    required this.powerState,
    required this.isOn,
    this.app,
    this.title,
    this.artist,
    required this.volume,
    required this.brightness,
  });

  factory DeviceStatus.fromJson(Map<String, dynamic> json) {
    // Handle 'on' being boolean or string
    bool isOn = false;
    if (json['on'] is bool) {
      isOn = json['on'];
    } else if (json['on'] is String) {
      isOn = json['on'] == 'on' || json['on'] == 'true';
    }

    return DeviceStatus(
      powerState: isOn ? 'on' : 'off',
      isOn: isOn,
      app: json['app'],
      title: json['title'],
      artist: json['artist'],
      volume: (json['volume'] ?? 0).toDouble(),
      brightness: (json['brightness'] ?? 0).toDouble(),
    );
  }
}
