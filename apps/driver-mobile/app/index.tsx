import { useEffect, useState, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Linking,
  Alert,
} from 'react-native';
import { WebView } from 'react-native-webview';
import * as ExpoLinking from 'expo-linking';
import { SafeAreaView } from 'react-native-safe-area-context';
import { WEB_BASE_URL } from '@/lib/config';
import { getStoredToken, setStoredToken } from '@/lib/storage';
import {
  startLocationTracking,
  stopLocationTracking,
  isTrackingActive,
  requestLocationPermissions,
} from '@/lib/locationTask';

export default function DriverApp() {
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [tracking, setTracking] = useState(false);
  const [webViewKey, setWebViewKey] = useState(0);
  const webViewRef = useRef<WebView>(null);

  const parseToken = useCallback((url: string): string | null => {
    try {
      const parsed = ExpoLinking.parse(url);
      if (parsed.path) {
        const match = parsed.path.match(/^driver\/(.+)$/);
        if (match) {
          return match[1];
        }
      }
      if (parsed.queryParams?.token) {
        return parsed.queryParams.token as string;
      }
    } catch {}
    return null;
  }, []);

  const handleDeepLink = useCallback(
    async (url: string) => {
      const parsedToken = parseToken(url);
      if (parsedToken) {
        await setStoredToken(parsedToken);
        setToken(parsedToken);
        setWebViewKey((k) => k + 1);
      }
    },
    [parseToken]
  );

  useEffect(() => {
    const init = async () => {
      const storedToken = await getStoredToken();
      if (storedToken) {
        setToken(storedToken);
      }

      const initialUrl = await ExpoLinking.getInitialURL();
      if (initialUrl) {
        await handleDeepLink(initialUrl);
      }

      const isActive = await isTrackingActive();
      setTracking(isActive);

      setLoading(false);
    };

    init();

    const subscription = ExpoLinking.addEventListener('url', (event) => {
      handleDeepLink(event.url);
    });

    return () => {
      subscription.remove();
    };
  }, [handleDeepLink]);

  const toggleTracking = async () => {
    if (tracking) {
      await stopLocationTracking();
      setTracking(false);
    } else {
      const hasPermission = await requestLocationPermissions();
      if (!hasPermission) {
        Alert.alert(
          'Permission Required',
          'Background location access is required for tracking. Please enable it in Settings.',
          [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Open Settings', onPress: () => Linking.openSettings() },
          ]
        );
        return;
      }

      const started = await startLocationTracking();
      setTracking(started);

      if (!started) {
        Alert.alert('Error', 'Failed to start location tracking. Please try again.');
      }
    }
  };

  const handleWebViewBack = () => {
    webViewRef.current?.goBack();
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#9b59b6" />
          <Text style={styles.loadingText}>Loading...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!token) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.waitingContainer}>
          <Text style={styles.waitingTitle}>PingPoint Driver</Text>
          <Text style={styles.waitingText}>Waiting for invite link...</Text>
          <Text style={styles.instructionText}>
            Open the driver invite link from your dispatcher to get started.
          </Text>
          <View style={styles.linkPreview}>
            <Text style={styles.linkText}>pingpoint://driver/your-token</Text>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  const webUrl = `${WEB_BASE_URL}/driver/${token}`;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.topBar}>
        <TouchableOpacity onPress={handleWebViewBack} style={styles.backButton}>
          <Text style={styles.backText}>‹ Back</Text>
        </TouchableOpacity>

        <View style={styles.statusContainer}>
          <View style={[styles.statusDot, tracking ? styles.statusOn : styles.statusOff]} />
          <Text style={styles.statusText}>{tracking ? 'Tracking ON' : 'Tracking OFF'}</Text>
        </View>

        <TouchableOpacity
          onPress={toggleTracking}
          style={[styles.trackingButton, tracking ? styles.pauseButton : styles.resumeButton]}
        >
          <Text style={styles.trackingButtonText}>{tracking ? 'Pause' : 'Resume'}</Text>
        </TouchableOpacity>
      </View>

      <WebView
        key={webViewKey}
        ref={webViewRef}
        source={{ uri: webUrl }}
        style={styles.webView}
        startInLoadingState
        renderLoading={() => (
          <View style={styles.webViewLoading}>
            <ActivityIndicator size="large" color="#9b59b6" />
          </View>
        )}
        onError={(syntheticEvent) => {
          console.error('WebView error:', syntheticEvent.nativeEvent);
        }}
        javaScriptEnabled
        domStorageEnabled
        allowsBackForwardNavigationGestures
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1a1a2e',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 12,
    color: '#a0a0a0',
    fontSize: 16,
  },
  waitingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  waitingTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#9b59b6',
    marginBottom: 16,
  },
  waitingText: {
    fontSize: 20,
    color: '#ffffff',
    marginBottom: 12,
  },
  instructionText: {
    fontSize: 14,
    color: '#a0a0a0',
    textAlign: 'center',
    marginBottom: 24,
    lineHeight: 22,
  },
  linkPreview: {
    backgroundColor: '#2a2a4e',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#3a3a6e',
  },
  linkText: {
    color: '#9b59b6',
    fontFamily: 'monospace',
    fontSize: 12,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#2a2a4e',
    borderBottomWidth: 1,
    borderBottomColor: '#3a3a6e',
  },
  backButton: {
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  backText: {
    color: '#9b59b6',
    fontSize: 16,
    fontWeight: '500',
  },
  statusContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statusDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginRight: 6,
  },
  statusOn: {
    backgroundColor: '#2ecc71',
  },
  statusOff: {
    backgroundColor: '#e74c3c',
  },
  statusText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '500',
  },
  trackingButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 4,
  },
  pauseButton: {
    backgroundColor: '#e74c3c',
  },
  resumeButton: {
    backgroundColor: '#2ecc71',
  },
  trackingButtonText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '600',
  },
  webView: {
    flex: 1,
    backgroundColor: '#1a1a2e',
  },
  webViewLoading: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#1a1a2e',
  },
});
