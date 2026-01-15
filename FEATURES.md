# DelovaHome Feature Roadmap

This document matches the integration plan for the "All Features" upgrade.

## 1. Presence-based automations
- **Goal**: Improve presence detection (Bluetooth, device ping) and add per-user triggers.
- **Files**: `script/presenceManager.js`, Mobile App.

## 2. Energy monitoring & graphs
- **Goal**: Integrate smart meter / per-device consumption and show history/cost.
- **Files**: `script/energyManager.js`, `web/pages/energy.html`.

## 3. Push notifications & alerts
- **Goal**: Alerts for alarms, offline devices, automation failures.
- **Files**: `Mobile App` (FCM), `script/automationManager.js`.

## 4. Improved device discovery
- **Goal**: Better hub/device discovery UI and retry logic.
- **Files**: `mobile/lib/screens/hub_discovery_screen.dart`, `script/discoveryService.js`.

## 5. Scene scheduling & recurrence
- **Goal**: Rich scheduler (sunrise/sunset, cron) for Scenes.
- **Files**: `script/sceneManager.js`, `web/pages/automations.html`.

## 6. Device health dashboard
- **Goal**: Uptime, last-seen, firmware versions, remediation.
- **Files**: `script/systemMonitor.js`, `web/pages/dashboard.html`.

## 7. Camera & streaming upgrades
- **Goal**: Secure WebRTC, recording clips, motion detection.
- **Files**: `script/cameraStream.js`.

## 8. Automations simulator / dry-run
- **Goal**: Test automations without executing.
- **Files**: `script/logicEngine.js`.

## 9. Role-based access control (RBAC)
- **Goal**: Per-user permissions.
- **Files**: `server.js`, `script/authManager.js`.

## 10. Integration hub / plugin system
- **Goal**: Modular 3rd-party plugin support.
- **Files**: `script/pluginManager.js` (New).

## 11. Voice assistant & local voice
- **Goal**: Alexa/Google integration + local NLP hooks.
- **Files**: `script/voiceManager.js` (New).

## 12. PWA & widgets
- **Goal**: PWA installability, home screen widgets.
- **Files**: `index.html`, `manifest.json`.

## 13. Energy & climate automation ML
- **Goal**: Usage pattern analysis for HVAC optimization.
- **Files**: `script/mlOptimizer.js` (New).

## 14. Backup & cloud sync with encryption
- **Goal**: Encrypted config backup/restore.
- **Files**: `script/backupManager.js` (New).

## 15. Audit logs & automation history
- **Goal**: Execution history and "replay".
- **Files**: `script/auditLogManager.js` (New).
