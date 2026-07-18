import { Tabs } from 'expo-router';
import { Text, type ColorValue } from 'react-native';

import { colors } from '@/theme/tokens';

/**
 * Tab icons.
 *
 * Glyphs rather than an icon font: adding one is a native asset and a build
 * step, and this keeps the scaffold free of a dependency that a design pass
 * will almost certainly replace anyway.
 */
function TabIcon({ glyph, color }: { glyph: string; color: ColorValue }) {
  return <Text style={{ color, fontSize: 20 }}>{glyph}</Text>;
}

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
          tabBarIcon: ({ color }) => <TabIcon glyph="◎" color={color} />,
        }}
      />
      <Tabs.Screen
        name="scan"
        options={{
          title: 'Scan',
          tabBarIcon: ({ color }) => <TabIcon glyph="◉" color={color} />,
        }}
      />
      <Tabs.Screen
        name="insights"
        options={{
          title: 'Insights',
          tabBarIcon: ({ color }) => <TabIcon glyph="◫" color={color} />,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          tabBarIcon: ({ color }) => <TabIcon glyph="⚙" color={color} />,
        }}
      />
    </Tabs>
  );
}
