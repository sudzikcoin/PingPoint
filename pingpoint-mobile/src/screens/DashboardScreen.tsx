import React from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useQuery } from '@tanstack/react-query';
import { colors, spacing } from '../lib/theme';
import { api, Load } from '../lib/api';
import { RootStackParamList } from '../navigation/AppNavigator';

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

function StatusBadge({ status }: { status: string }) {
  const getStatusColor = () => {
    switch (status) {
      case 'IN_TRANSIT': return colors.secondary;
      case 'DELIVERED': return colors.success;
      case 'PENDING': return colors.warning;
      default: return colors.textMuted;
    }
  };

  return (
    <View style={[styles.badge, { borderColor: getStatusColor() }]}>
      <Text style={[styles.badgeText, { color: getStatusColor() }]}>
        {status.replace('_', ' ')}
      </Text>
    </View>
  );
}

function LoadCard({ load, onPress }: { load: Load; onPress: () => void }) {
  const origin = load.pickupCity && load.pickupState 
    ? `${load.pickupCity}, ${load.pickupState}` 
    : 'Origin';
  const destination = load.destinationCity && load.destinationState 
    ? `${load.destinationCity}, ${load.destinationState}` 
    : 'Destination';

  return (
    <TouchableOpacity style={styles.card} onPress={onPress}>
      <View style={styles.cardHeader}>
        <Text style={styles.loadNumber}>{load.loadNumber}</Text>
        <StatusBadge status={load.status} />
      </View>
      
      <View style={styles.routeContainer}>
        <View style={styles.routePoint}>
          <View style={[styles.dot, { backgroundColor: colors.success }]} />
          <Text style={styles.routeText}>{origin}</Text>
        </View>
        <View style={styles.routeLine} />
        <View style={styles.routePoint}>
          <View style={[styles.dot, { backgroundColor: colors.error }]} />
          <Text style={styles.routeText}>{destination}</Text>
        </View>
      </View>

      <View style={styles.cardFooter}>
        <Text style={styles.carrier}>{load.carrierName}</Text>
        <Text style={styles.rate}>${load.rateAmount}</Text>
      </View>
    </TouchableOpacity>
  );
}

export default function DashboardScreen() {
  const navigation = useNavigation<NavigationProp>();
  
  const { data, isLoading, error, refetch, isRefetching } = useQuery({
    queryKey: ['loads'],
    queryFn: () => api.loads.list(),
  });

  const loads = data?.items || [];

  if (isLoading && !isRefetching) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={styles.loadingText}>Loading loads...</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorText}>Failed to load data</Text>
        <TouchableOpacity style={styles.retryButton} onPress={() => refetch()}>
          <Text style={styles.retryText}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <FlatList
        data={loads}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <LoadCard 
            load={item} 
            onPress={() => navigation.navigate('LoadDetails', { loadId: item.id })}
          />
        )}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl
            refreshing={isRefetching}
            onRefresh={refetch}
            tintColor={colors.primary}
          />
        }
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyIcon}>📦</Text>
            <Text style={styles.emptyText}>No loads yet</Text>
            <Text style={styles.emptySubtext}>
              Create your first load from the web dashboard
            </Text>
          </View>
        }
      />
    </View>
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
    marginBottom: spacing.md,
  },
  retryButton: {
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: 8,
  },
  retryText: {
    color: '#000',
    fontWeight: 'bold',
  },
  listContent: {
    padding: spacing.md,
  },
  card: {
    backgroundColor: colors.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  loadNumber: {
    fontSize: 18,
    fontWeight: 'bold',
    color: colors.text,
  },
  badge: {
    borderWidth: 1,
    borderRadius: 4,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
  },
  badgeText: {
    fontSize: 10,
    fontWeight: 'bold',
    textTransform: 'uppercase',
  },
  routeContainer: {
    marginBottom: spacing.md,
  },
  routePoint: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: spacing.sm,
  },
  routeLine: {
    width: 1,
    height: 16,
    backgroundColor: colors.border,
    marginLeft: 3,
    marginVertical: 2,
  },
  routeText: {
    color: colors.text,
    fontSize: 14,
  },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  carrier: {
    color: colors.textMuted,
    fontSize: 12,
  },
  rate: {
    color: colors.primary,
    fontSize: 16,
    fontWeight: 'bold',
  },
  empty: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: spacing.xl * 2,
  },
  emptyIcon: {
    fontSize: 48,
    marginBottom: spacing.md,
  },
  emptyText: {
    color: colors.text,
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: spacing.xs,
  },
  emptySubtext: {
    color: colors.textMuted,
    textAlign: 'center',
  },
});
