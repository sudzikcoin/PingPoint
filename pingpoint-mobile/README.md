# PingPoint Mobile

React Native Expo app for PingPoint logistics tracking platform.

## Setup

1. Install dependencies:
```bash
cd pingpoint-mobile
npm install
```

2. Configure API URL:
Edit `src/lib/api.ts` and set `API_BASE_URL` to your backend URL.

3. Start development:
```bash
npm start
```

## Building APK

1. Install EAS CLI:
```bash
npm install -g eas-cli
```

2. Login to Expo:
```bash
eas login
```

3. Configure your project ID in `app.json` under `extra.eas.projectId`

4. Build APK:
```bash
eas build --platform android --profile preview
```

## Features

- **Login Screen**: Email-based magic link authentication
- **Dashboard**: View all loads with status
- **Load Details**: Detailed load info with stops
- **Live Tracking**: Real-time location tracking

## Project Structure

```
pingpoint-mobile/
├── App.tsx              # Main app entry
├── src/
│   ├── components/      # Reusable UI components
│   ├── lib/
│   │   ├── api.ts       # API client (ported from web)
│   │   ├── theme.ts     # Colors and styling
│   │   └── queryClient.ts
│   ├── navigation/
│   │   └── AppNavigator.tsx
│   └── screens/
│       ├── LoginScreen.tsx
│       ├── DashboardScreen.tsx
│       ├── LoadDetailsScreen.tsx
│       └── TrackingScreen.tsx
├── app.json             # Expo config
├── eas.json             # EAS Build config
└── package.json
```
