class Device {
  final String id;
  final String name;
  final String type;
  final String ip;
  final String? room;
  final DeviceStatus status;
  final List<dynamic>? inputs;

  Device({
    required this.id,
    required this.name,
    required this.type,
    required this.ip,
    this.room,
    this.inputs,
    required this.status,
  });

  factory Device.fromJson(Map<String, dynamic> json) {
    return Device(
      id: json['id'] ?? '',
      name: json['name'] ?? 'Unknown',
      type: json['type'] ?? 'unknown',
      ip: json['ip'] ?? '',
      room: json['roomName'] ?? json['room'],
      inputs: json['inputs'],
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
  final String? album;
  final double volume;
  final double brightness;
  final String? color; // Hex color like "#FF0000"
  
  // Extended properties
  final double? temperature;
  final double? targetTemperature;
  final double? humidity;
  final int? battery;
  final bool? isLocked;
  final int? position; // 0-100 for blinds
  final String? mode; // heat, cool, auto, etc.
  final int? fanSpeed;
  final List<dynamic>? inks;
  final String? printerStatus;

  DeviceStatus({
    required this.powerState,
    required this.isOn,
    this.app,
    this.title,
    this.artist,
    this.album,
    required this.volume,
    required this.brightness,
    this.color,
    this.temperature,
    this.targetTemperature,
    this.humidity,
    this.battery,
    this.isLocked,
    this.position,
    this.mode,
    this.fanSpeed,
    this.inks,
    this.printerStatus,
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
      app: json['app'] ?? json['mediaApp'],
      title: json['title'] ?? json['mediaTitle'],
      artist: json['artist'] ?? json['mediaArtist'],
      album: json['album'] ?? json['mediaAlbum'],
      volume: (json['volume'] is int) ? (json['volume'] as int).toDouble() : (json['volume'] ?? 0.0),
      brightness: (json['brightness'] is int) ? (json['brightness'] as int).toDouble() : (json['brightness'] ?? 0.0),
      color: json['color'],
      temperature: json['temperature']?.toDouble(),
      targetTemperature: json['targetTemperature']?.toDouble(),
      humidity: json['humidity']?.toDouble(),
      battery: json['battery'],
      isLocked: json['isLocked'],
      position: json['position'],
      mode: json['mode'],
      fanSpeed: json['fanSpeed'],
      inks: json['inks'],
      printerStatus: json['printerStatus'],
    );
  }
}
