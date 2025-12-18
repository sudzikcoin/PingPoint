# PingPoint Driver Mobile App

A React Native/Expo mobile app for PingPoint drivers that provides:
- WebView wrapper for the existing driver web interface
- Background GPS location tracking
- Deep linking support (`pingpoint://driver/<token>`)

## Prerequisites

- Node.js 18+ and npm
- Expo CLI: `npm install -g expo-cli`
- EAS CLI: `npm install -g eas-cli`
- Android Studio (for local development)
- An Expo account (for EAS builds)

## Local Development

### 1. Install Dependencies

```bash
cd apps/driver-mobile
npm install
```

### 2. Configure Environment

Create a `.env` file from the example:

```bash
cp .env.example .env
```

Edit `.env` with your values:

```
EXPO_PUBLIC_WEB_BASE_URL=http://localhost:5000
EXPO_PUBLIC_API_BASE_URL=http://localhost:5000
```

For production, use your deployed URL:

```
EXPO_PUBLIC_WEB_BASE_URL=https://your-app.replit.app
EXPO_PUBLIC_API_BASE_URL=https://your-app.replit.app
```

### 3. Start the Development Server

```bash
npx expo start
```

This will open the Expo dev tools. You can:
- Press `a` to open in Android emulator
- Scan QR code with Expo Go app (limited features)
- Press `w` to open web version

### 4. Test Deep Linking

In Expo dev tools or via terminal:

```bash
# Simulate deep link
npx uri-scheme open "pingpoint://driver/your-test-token" --android
```

## Building for Android

### 1. Login to EAS

```bash
eas login
```

### 2. Configure EAS Project

First time setup:

```bash
eas build:configure
```

Update `app.json` with your EAS project ID.

### 3. Build Preview APK (for testing)

```bash
eas build -p android --profile preview
```

This creates an APK you can install directly on Android devices.

### 4. Build Production AAB (for Google Play)

```bash
eas build -p android --profile production
```

This creates an AAB file for Google Play Store upload.

## Google Play Internal Testing

1. Build the production AAB:
   ```bash
   eas build -p android --profile production
   ```

2. Download the AAB from EAS dashboard

3. Go to [Google Play Console](https://play.google.com/console)

4. Create a new app or select existing

5. Go to **Release > Testing > Internal testing**

6. Create a new release and upload the AAB

7. Add testers by email

8. Share the internal testing link with drivers

## Deep Linking Setup

The app supports the `pingpoint://` URL scheme. When a driver receives an invite link like:

```
pingpoint://driver/drv_abc123def456
```

Opening it will:
1. Launch the PingPoint Driver app
2. Store the driver token
3. Load the driver web interface
4. Start background location tracking (with permission)

### Android Intent Filters

The app is configured to handle:
- `pingpoint://driver/<token>` - Custom scheme
- Future: HTTPS links can be added for universal links

## Background Location Tracking

The app uses Expo Location with Task Manager for background tracking:

- **Accuracy**: Balanced (good accuracy, reasonable battery)
- **Update Interval**: ~20 seconds
- **Distance Filter**: 75 meters
- **Foreground Service**: Android notification shows when tracking

Drivers can pause/resume tracking from the top bar.

### Permissions Required

- **Android**:
  - `ACCESS_FINE_LOCATION`
  - `ACCESS_BACKGROUND_LOCATION`
  - `FOREGROUND_SERVICE`

- **iOS**:
  - `NSLocationWhenInUseUsageDescription`
  - `NSLocationAlwaysAndWhenInUseUsageDescription`

## Project Structure

```
apps/driver-mobile/
├── app/
│   ├── _layout.tsx      # Root layout
│   └── index.tsx        # Main app screen
├── lib/
│   ├── config.ts        # Environment config
│   ├── storage.ts       # AsyncStorage utilities
│   ├── api.ts           # API client
│   └── locationTask.ts  # Background location task
├── assets/              # App icons and splash
├── app.json             # Expo configuration
├── eas.json             # EAS Build configuration
└── package.json
```

## Troubleshooting

### Location not updating

1. Check that background location permission is granted
2. Ensure the driver token is valid
3. Check server logs for ping requests
4. Verify API_BASE_URL is correct

### WebView not loading

1. Check WEB_BASE_URL is accessible
2. Ensure the driver token exists in the database
3. Check for CORS issues (should not affect mobile)

### Deep link not working

1. Ensure app is installed (not Expo Go)
2. Check the URL scheme matches: `pingpoint://`
3. Rebuild the app after changing scheme

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `EXPO_PUBLIC_WEB_BASE_URL` | URL for driver web interface | `http://localhost:5000` |
| `EXPO_PUBLIC_API_BASE_URL` | URL for API endpoints | `http://localhost:5000` |
