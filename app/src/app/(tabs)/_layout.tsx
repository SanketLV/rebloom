import { useRouter } from 'expo-router';
import { Tabs } from 'expo-router/js-tabs';
import { useEffect } from 'react';

import { TabBar } from '@/components/TabBar';
import { useOnboarding } from '@/onboarding/context';

export default function TabsLayout() {
  const router = useRouter();
  const { takeScanRequest } = useOnboarding();

  // "Scan a plant" has to open the camera from here. Until this layout mounts, the
  // onboarding guard hasn't applied: a push from there or from the root layout goes
  // nowhere or leaves onboarding in the back stack.
  useEffect(() => {
    if (takeScanRequest()) router.push('/scan');
  }, [takeScanRequest, router]);

  return (
    <Tabs tabBar={(props) => <TabBar {...props} />} screenOptions={{ headerShown: false }}>
      <Tabs.Screen name="index" options={{ title: 'Today' }} />
      <Tabs.Screen name="plants" options={{ title: 'My Plants' }} />
    </Tabs>
  );
}
