import { Tabs } from 'expo-router';

import { Icon } from '@/components/ui/Icon';
import { colors } from '@/theme/tokens';

/**
 * Four tabs (PRODUCT_SPEC.md §3).
 *
 * Session results are deliberately absent: they are the consequence of ending a
 * scan, not a place the user navigates to, so they are pushed from Today,
 * Insights, and scan completion instead of occupying a fifth tab.
 */
export default function AppLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.accent.DEFAULT,
        tabBarInactiveTintColor: colors.ink.faint,
        tabBarStyle: {
          backgroundColor: colors.canvas.raised,
          borderTopColor: colors.hairline,
        },
        sceneStyle: { backgroundColor: colors.canvas.DEFAULT },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Today',
          tabBarIcon: ({ color }) => <Icon name="eye" size={22} color={color} />,
        }}
      />
      <Tabs.Screen
        name="scan"
        options={{
          title: 'Scan',
          tabBarIcon: ({ color }) => <Icon name="camera.viewfinder" size={22} color={color} />,
        }}
      />
      <Tabs.Screen
        name="insights"
        options={{
          title: 'Insights',
          tabBarIcon: ({ color }) => <Icon name="chart.bar" size={22} color={color} />,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          tabBarIcon: ({ color }) => <Icon name="person.crop.circle" size={22} color={color} />,
        }}
      />
    </Tabs>
  );
}
