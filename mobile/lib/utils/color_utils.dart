import 'dart:math';
import 'package:flutter/material.dart';

class ColorUtils {
  static Color generateColor(String str) {
    if (str.isEmpty) return Colors.blue;
    
    int hash = 0;
    for (int i = 0; i < str.length; i++) {
      hash = str.codeUnitAt(i) + ((hash << 5) - hash);
    }
    
    // JS: Math.floor(Math.abs((Math.sin(hash) * 16777215)) % 16777215)
    final val = (sin(hash) * 16777215).abs() % 16777215;
    final hex = val.toInt();
    
    // Ensure full opacity
    return Color(0xFF000000 | hex); 
  }
}
