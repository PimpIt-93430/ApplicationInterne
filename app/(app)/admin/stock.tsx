import { ActivityIndicator, View } from 'react-native';

import { StockScreen } from '@/components/stock/StockScreen';
import { useAuthStore } from '@/store/useAuthStore';

export default function StockAdminRoute() {
  const profile = useAuthStore((s) => s.profile);

  if (!profile) {
    return (
      <View className="flex-1 items-center justify-center bg-white">
        <ActivityIndicator size="large" color="#6366F1" />
      </View>
    );
  }

  return <StockScreen profile={profile} />;
}
