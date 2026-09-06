# VEX 1239E Driver Hub Tracker

A lightweight Capacitor Android dashboard for displaying live VEX Robotics competition information on a REV Robotics Driver Hub.

The app is designed for a 5.5-inch landscape display and currently tracks team **1239E** through the VEX Events API v2.

## Features

- Automatically finds the team’s most relevant event:
  - an event currently in progress;
  - an event starting soon; or
  - the most recent completed event.
- Displays the next match and remaining matches for the team.
- Shows the next-match alliance, with team 1239E highlighted.
- Lists upcoming matches in the team’s queue.
- Displays tournament and division context.
- Shows current qualification rank and skills rank.
- Estimates the best- and worst-case qualification rank based on remaining matches.
- Refreshes automatically every 30 seconds, with a manual refresh button.
- Uses native Capacitor HTTP requests on Android to avoid browser CORS limitations.
- Uses a dark, high-contrast interface optimized for Driver Hub use.

## Project structure

```text
public/
├── index.html       # Dashboard UI
└── script.js        # API integration, match processing, and UI updates

android/             # Capacitor Android platform project
capacitor.config.json
package.json
```

## Requirements

- Node.js and npm
- Android SDK and build tools
- Java Development Kit compatible with the installed Android Gradle plugin
- A REV Robotics Driver Hub for installation
- Network access on the Driver Hub for live API requests

## Local development

Install the project dependencies:

```bash
npm install
```

The dashboard is a static web app in `public/`. For Android builds, use Capacitor to copy the web assets into the native project:

```bash
npx cap copy
```

After changing files in `public/`, run `npx cap copy` again before rebuilding the APK.

## Build the Android APK

If the Android platform has not been generated yet:

```bash
npx cap add android
```

Build a debug APK on Windows:

```powershell
npx cap copy
cd android
.\gradlew.bat assembleDebug
```

The APK is generated at:

```text
android/app/build/outputs/apk/debug/app-debug.apk
```

## Install on a Driver Hub

With the Driver Hub connected over USB and USB debugging enabled, install the APK with ADB:

```powershell
adb devices
adb install -r android\app\build\outputs\apk\debug\app-debug.apk
```

If the app is already installed, the `-r` option updates it while preserving the existing installation.

The Android manifest is configured for internet access and landscape orientation.

## Changing the tracked team

The tracked team is configured near the top of `public/script.js`:

```javascript
const TEAM_NUMBER = '1239E';
```

Change that value, copy the web assets, and rebuild the APK.

## VEX Events API

The application reads event, team, division, match, ranking, and skills data from the [VEX Events API v2](https://www.robotevents.com/api/v2).

API credentials should be kept out of public repositories. For a production deployment, use a small trusted backend or another secure credential-injection strategy instead of committing a bearer token in client-side JavaScript.

## Troubleshooting

### `Failed to fetch`

Confirm that the Driver Hub has network access and that the VEX Events API is reachable. Rebuild after any changes to the API integration.

### `Team not found in any division for the event`

The selected event may not contain the team in its match data yet, or the event may use a different division structure. Verify the team number and event data in the VEX Events system.

### The app shows stale data

Tap **Refresh** and confirm the Driver Hub is online. The app also refreshes automatically every 30 seconds.

## License

This project is provided for use by VEX Robotics teams. Add a project-specific license before redistributing it publicly.
