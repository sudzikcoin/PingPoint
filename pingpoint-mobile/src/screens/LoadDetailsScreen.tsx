import React from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Share,
  Alert,
} from 'react-native';
import { useRoute, useNavigation, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useQuery } from '@tanstack/react-query';
import { colors, spacing } from '../lib/theme';
import { api } from '../lib/api';
import { RootStackParamList } from '../navigation/AppNavigator';

type RouteProps = RouteProp<RootStackParamList, 'LoadDetails'>;
type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

function InfoRow({ label, value, icon }: { label: string; value: string; icon?: string }) {
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{icon} {label}</Text>
      <Text style={styles.infoValue}>{value}</Text>
    </View>
  );
}

function StopCard({ stop, index }: { stop: any; index: number }) {
  const isPickup = stop.type === 'PICKUP';
  const statusColor = stop.departedAt ? colors.success : stop.arrivedAt ? colors.warning : colors.textMuted;

  return (
    <View style={styles.stopCard}>
      <View style={styles.stopHeader}>
        <View style={[styles.stopBadge, { backgroundColor: isPickup ? colors.success : colors.error }]}>
          <Text style={styles.stopBadgeText}>{isPickup ? 'P' : 'D'}</Text>
        </View>
        <View style={styles.stopInfo}>
          <Text style={styles.stopName}>{stop.name}</Text>
          <Text style={styles.stopAddress}>{stop.city}, {stop.state}</Text>
        </View>
        <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
      </View>
      
      {(stop.arrivedAt || stop.departedAt) && (
        <View style={styles.stopTimes}>
          {stop.arrivedAt && (
            <Text style={styles.stopTime}>Arrived: {new Date(stop.arrivedAt).toLocaleTimeString()}</Text>
          )}
          {stop.departedAt && (
            <Text style={styles.stopTime}>Departed: {new Date(stop.departedAt).toLocaleTimeString()}</Text>
          )}
        </View>
      )}
    </View>
  );
}

export default function LoadDetailsScreen() {
  const route = useRoute<RouteProps>();
  const navigation = useNavigation<NavigationProp>();
  const { loadId } = route.params;

  const { data: load, isLoading, error } = useQuery({
    queryKey: ['load', loadId],
    queryFn: () => api.loads.get(loadId),
  });

  const handleShareTracking = async () => {
    if (!load?.trackingToken) return;
    
    try {
      await Share.share({
        message: `Track shipment ${load.loadNumber}: https://your-domain.com/track/${load.trackingToken}`,
        title: `Track ${load.loadNumber}`,
      });
    } catch (error) {
      console.error('Share failed:', error);
    }
  };

  const handleOpenTracking = () => {
    if (!load?.trackingToken) return;
    navigation.navigate('Tracking', { token: load.trackingToken });
  };

  if (isLoading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  if (error || !load) {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorText}>Load not found</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.loadNumber}>{load.loadNumber}</Text>
        <View style={styles.statusBadge}>
          <Text style={styles.statusText}>{load.status}</Text>
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Details</Text>
        <View style={styles.card}>
          <InfoRow label="Carrier" value={load.carrierName} icon="🚛" />
          <InfoRow label="Shipper" value={load.shipperName} icon="📦" />
          <InfoRow label="Rate" value={`$${load.rateAmount}`} icon="💰" />
          {load.customerRef && (
            <InfoRow label="Reference" value={load.customerRef} icon="🔖" />
          )}
        </View>
      </View>

      {load.stops && load.stops.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Stops</Text>
          {load.stops
            .sort((a: any, b: any) => a.sequence - b.sequence)
            .map((stop: any, index: number) => (
              <StopCard key={stop.id} stop={stop} index={index} />
            ))}
        </View>
      )}

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Actions</Text>
        <View style={styles.actionsContainer}>
          <TouchableOpacity style={styles.actionButton} onPress={handleOpenTracking}>
            <Text style={styles.actionIcon}>📍</Text>
            <Text style={styles.actionText}>View Live Tracking</Text>
          </TouchableOpacity>
          
          <TouchableOpacity style={[styles.actionButton, styles.actionButtonOutline]} onPress={handleShareTracking}>
            <Text style={styles.actionIcon}>🔗</Text>
            <Text style={[styles.actionText, styles.actionTextOutline]}>Share Tracking Link</Text>
          </TouchableOpacity>
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
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  infoLabel: {
    color: colors.textMuted,
    fontSize: 14,
  },
  infoValue: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '500',
  },
  stopCard: {
    backgroundColor: colors.card,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  stopHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  stopBadge: {
    width: 28,
    height: 28,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: spacing.sm,
  },
  stopBadgeText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 12,
  },
  stopInfo: {
    flex: 1,
  },
  stopName: {
    color: colors.text,
    fontWeight: '600',
  },
  stopAddress: {
    color: colors.textMuted,
    fontSize: 12,
  },
  statusDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  stopTimes: {
    marginTop: spacing.sm,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  stopTime: {
    color: colors.textMuted,
    fontSize: 12,
  },
  actionsContainer: {
    gap: spacing.sm,
  },
  actionButton: {
    backgroundColor: colors.primary,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.md,
    borderRadius: 8,
    marginBottom: spacing.sm,
  },
  actionButtonOutline: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: colors.border,
  },
  actionIcon: {
    fontSize: 18,
    marginRight: spacing.sm,
  },
  actionText: {
    color: colors.background,
    fontWeight: 'bold',
  },
  actionTextOutline: {
    color: colors.text,
  },
});
