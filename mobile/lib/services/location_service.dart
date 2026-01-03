import 'dart:async';
import 'package:flutter/foundation.dart';
import 'package:geolocator/geolocator.dart';
import 'api_service.dart';

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

    // Start listening for location updates or periodic updates
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
        desiredAccuracy: LocationAccuracy.high
      );
      
      await _apiService.updateLocation(position.latitude, position.longitude);
      debugPrint('Location updated: ${position.latitude}, ${position.longitude}');
    } catch (e) {
      debugPrint('Error getting location: $e');
    }
  }
}
