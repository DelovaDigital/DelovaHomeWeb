import 'dart:async';
import 'package:flutter/foundation.dart';
import 'package:geolocator/geolocator.dart';
import 'package:workmanager/workmanager.dart';
import 'api_service.dart';

@pragma('vm:entry-point')
void callbackDispatcher() {
  Workmanager().executeTask((task, inputData) async {
    if (task == 'backgroundLocationUpdate') {
      try {
        final apiService = ApiService();
        // We need to ensure we have permissions, but in background we assume we do.
        // Note: On Android, this might require "Background Location" permission if running when app is closed.
        
        Position position = await Geolocator.getCurrentPosition(
          locationSettings: const LocationSettings(accuracy: LocationAccuracy.high)
        );
        
        await apiService.updateLocation(position.latitude, position.longitude);
        debugPrint('Background Location updated: ${position.latitude}, ${position.longitude}');
      } catch (e) {
        debugPrint('Error in background location task: $e');
        return Future.value(false);
      }
    }
    return Future.value(true);
  });
}

class LocationService {
  final ApiService _apiService = ApiService();
  Timer? _timer;

  Future<void> init() async {
    bool serviceEnabled;
    LocationPermission permission;

    // Test if location services are enabled.
    serviceEnabled = await Geolocator.isLocationServiceEnabled();
    if (!serviceEnabled) {
      debugPrint('Location services are disabled.');
      return;
    }

    permission = await Geolocator.checkPermission();
    if (permission == LocationPermission.denied) {
      permission = await Geolocator.requestPermission();
      if (permission == LocationPermission.denied) {
        debugPrint('Location permissions are denied');
        return;
      }
    }
    
    if (permission == LocationPermission.deniedForever) {
      debugPrint('Location permissions are permanently denied, we cannot request permissions.');
      return;
    } 

    // Initialize Workmanager for background tasks
    await Workmanager().initialize(
      callbackDispatcher,
    );

    // Register periodic task (every 15 minutes is the minimum for Android WorkManager, 
    // but on iOS it's up to the OS. We request 15 mins).
    // The user asked for 10, but Android minimum is 15. We'll set frequency to 15 minutes.
    await Workmanager().registerPeriodicTask(
      "1",
      "backgroundLocationUpdate",
      frequency: const Duration(minutes: 15),
      constraints: Constraints(
        networkType: NetworkType.connected,
      ),
    );

    // Start listening for location updates or periodic updates (Foreground)
    _startLocationUpdates();
  }

  void _startLocationUpdates() {
    // Update location every 5 minutes
    _timer = Timer.periodic(const Duration(minutes: 5), (timer) async {
      await _updateLocation();
    });
    
    // Also update immediately
    _updateLocation();
  }

  void dispose() {
    _timer?.cancel();
  }

  Future<void> _updateLocation() async {
    try {
      Position position = await Geolocator.getCurrentPosition(
        locationSettings: const LocationSettings(accuracy: LocationAccuracy.high)
      );
      
      await _apiService.updateLocation(position.latitude, position.longitude);
      debugPrint('Location updated: ${position.latitude}, ${position.longitude}');
    } catch (e) {
      debugPrint('Error getting location: $e');
    }
  }
}
