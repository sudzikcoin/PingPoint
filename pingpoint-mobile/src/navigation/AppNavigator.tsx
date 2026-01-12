import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Text, View } from 'react-native';
import { colors } from '../lib/theme';

import LoginScreen from '../screens/LoginScreen';
import DashboardScreen from '../screens/DashboardScreen';
import LoadDetailsScreen from '../screens/LoadDetailsScreen';
import TrackingScreen from '../screens/TrackingScreen';

export type RootStackParamList = {
  Auth: undefined;
  Main: undefined;
  LoadDetails: { loadId: string };
  Tracking: { token: string };
};

export type MainTabParamList = {
  Dashboard: undefined;
  Settings: undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();
const Tab = createBottomTabNavigator<MainTabParamList>();

function TabIcon({ name, focused }: { name: string; focused: boolean }) {
  return (
    <View style={{ alignItems: 'center' }}>
      <Text style={{ 
        color: focused ? colors.primary : colors.textMuted,
        fontSize: 20,
      }}>
        {name === 'Dashboard' ? '📦' : '⚙️'}
      </Text>
    </View>
  );
}

function MainTabs() {
  return (
    <Tab.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: colors.background },
        headerTintColor: colors.text,
        tabBarStyle: { 
          backgroundColor: colors.card,
          borderTopColor: colors.border,
        },
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textMuted,
      }}
    >
      <Tab.Screen 
        name="Dashboard" 
        component={DashboardScreen}
        options={{
          title: 'Loads',
          tabBarIcon: ({ focused }) => <TabIcon name="Dashboard" focused={focused} />,
        }}
      />
      <Tab.Screen 
        name="Settings" 
        component={SettingsPlaceholder}
        options={{
          title: 'Settings',
          tabBarIcon: ({ focused }) => <TabIcon name="Settings" focused={focused} />,
        }}
      />
    </Tab.Navigator>
  );
}

function SettingsPlaceholder() {
  return (
    <View style={{ flex: 1, backgroundColor: colors.background, justifyContent: 'center', alignItems: 'center' }}>
      <Text style={{ color: colors.text }}>Settings coming soon</Text>
    </View>
  );
}

export default function AppNavigator({ isLoggedIn }: { isLoggedIn: boolean }) {
  return (
    <NavigationContainer>
      <Stack.Navigator
        screenOptions={{
          headerStyle: { backgroundColor: colors.background },
          headerTintColor: colors.text,
          contentStyle: { backgroundColor: colors.background },
        }}
      >
        {!isLoggedIn ? (
          <Stack.Screen 
            name="Auth" 
            component={LoginScreen}
            options={{ headerShown: false }}
          />
        ) : (
          <>
            <Stack.Screen 
              name="Main" 
              component={MainTabs}
              options={{ headerShown: false }}
            />
            <Stack.Screen 
              name="LoadDetails" 
              component={LoadDetailsScreen}
              options={{ title: 'Load Details' }}
            />
            <Stack.Screen 
              name="Tracking" 
              component={TrackingScreen}
              options={{ title: 'Live Tracking' }}
            />
          </>
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}
