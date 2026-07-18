import { Tabs } from 'expo-router';
import { Text, type ColorValue } from 'react-native';

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

export default function AppLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: '#5B8DEF',
        tabBarInactiveTintColor: '#6B6B7B',
        tabBarStyle: {
          backgroundColor: '#14141B',
          borderTopColor: '#262631',
        },
        sceneStyle: { backgroundColor: '#0B0B0F' },
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
        name="settings"
        options={{
          title: 'Settings',
          tabBarIcon: ({ color }) => <TabIcon glyph="⚙" color={color} />,
        }}
      />
    </Tabs>
  );
}
