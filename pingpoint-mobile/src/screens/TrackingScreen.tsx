import React from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { useRoute, RouteProp } from '@react-navigation/native';
import { useQuery } from '@tanstack/react-query';
import { colors, spacing } from '../lib/theme';
import { api } from '../lib/api';
import { RootStackParamList } from '../navigation/AppNavigator';

type RouteProps = RouteProp<RootStackParamList, 'Tracking'>;

export default function TrackingScreen() {
  const route = useRoute<RouteProps>();
  const { token } = route.params;

  const { data, isLoading, error, refetch, isRefetching } = useQuery({
    queryKey: ['tracking', token],
    queryFn: () => api.track.getByToken(token),
    refetchInterval: 30000,
  });

  if (isLoading && !isRefetching) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={styles.loadingText}>Loading tracking data...</Text>
      </View>
    );
  }

  if (error || !data) {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorText}>Tracking data not available</Text>
      </View>
    );
  }

  const { load, lastPing, pings } = data;

  return (
    <ScrollView 
      style={styles.container}
      refreshControl={
        <RefreshControl
          refreshing={isRefetching}
          onRefresh={refetch}
          tintColor={colors.primary}
        />
      }
    >
      <View style={styles.header}>
        <Text style={styles.loadNumber}>{load.loadNumber}</Text>
        <View style={styles.statusBadge}>
          <Text style={styles.statusText}>{load.status}</Text>
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Current Location</Text>
        <View style={styles.card}>
          {lastPing ? (
            <>
              <View style={styles.locationIcon}>
                <Text style={styles.locationEmoji}>📍</Text>
              </View>
              <Text style={styles.coordinates}>
                {lastPing.lat.toFixed(6)}, {lastPing.lng.toFixed(6)}
              </Text>
              <Text style={styles.timestamp}>
                Last update: {new Date(lastPing.timestamp).toLocaleString()}
              </Text>
            </>
          ) : (
            <Text style={styles.noData}>No location data available yet</Text>
          )}
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Route</Text>
        <View style={styles.card}>
          <View style={styles.routeContainer}>
            <View style={styles.routePoint}>
              <View style={[styles.dot, { backgroundColor: colors.success }]} />
              <View style={styles.routeInfo}>
                <Text style={styles.routeLabel}>Origin</Text>
                <Text style={styles.routeText}>
                  {load.pickupCity && load.pickupState 
                    ? `${load.pickupCity}, ${load.pickupState}` 
                    : 'Not specified'}
                </Text>
              </View>
            </View>
            
            <View style={styles.routeLine} />
            
            <View style={styles.routePoint}>
              <View style={[styles.dot, { backgroundColor: colors.error }]} />
              <View style={styles.routeInfo}>
                <Text style={styles.routeLabel}>Destination</Text>
                <Text style={styles.routeText}>
                  {load.destinationCity && load.destinationState 
                    ? `${load.destinationCity}, ${load.destinationState}` 
                    : 'Not specified'}
                </Text>
              </View>
            </View>
          </View>
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Tracking History ({pings?.length || 0} pings)</Text>
        <View style={styles.card}>
          {pings && pings.length > 0 ? (
            pings.slice(0, 10).map((ping: any, index: number) => (
              <View key={index} style={styles.pingItem}>
                <Text style={styles.pingTime}>
                  {new Date(ping.timestamp).toLocaleTimeString()}
                </Text>
                <Text style={styles.pingCoords}>
                  {ping.lat.toFixed(4)}, {ping.lng.toFixed(4)}
                </Text>
              </View>
            ))
          ) : (
            <Text style={styles.noData}>No tracking history</Text>
          )}
        </View>
      </View>

      <View style={{ height: spacing.xl }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.background,
  },
  loadingText: {
    marginTop: spacing.md,
    color: colors.textMuted,
  },
  errorText: {
    color: colors.error,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: spacing.md,
    backgroundColor: colors.card,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  loadNumber: {
    fontSize: 24,
    fontWeight: 'bold',
    color: colors.text,
  },
  statusBadge: {
    backgroundColor: colors.secondary,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: 4,
  },
  statusText: {
    color: colors.background,
    fontSize: 12,
    fontWeight: 'bold',
  },
  section: {
    padding: spacing.md,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: spacing.sm,
  },
  card: {
    backgroundColor: colors.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    alignItems: 'center',
  },
  locationIcon: {
    marginBottom: spacing.sm,
  },
  locationEmoji: {
    fontSize: 48,
  },
  coordinates: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '500',
    marginBottom: spacing.xs,
  },
  timestamp: {
    color: colors.textMuted,
    fontSize: 12,
  },
  noData: {
    color: colors.textMuted,
    textAlign: 'center',
  },
  routeContainer: {
    width: '100%',
  },
  routePoint: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  dot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginRight: spacing.md,
  },
  routeLine: {
    width: 2,
    height: 24,
    backgroundColor: colors.border,
    marginLeft: 5,
    marginVertical: spacing.xs,
  },
  routeInfo: {
    flex: 1,
  },
  routeLabel: {
    color: colors.textMuted,
    fontSize: 10,
    textTransform: 'uppercase',
  },
  routeText: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '500',
  },
  pingItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
    paddingVertical: spacing.xs,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  pingTime: {
    color: colors.textMuted,
    fontSize: 12,
  },
  pingCoords: {
    color: colors.text,
    fontSize: 12,
    fontFamily: 'monospace',
  },
});
