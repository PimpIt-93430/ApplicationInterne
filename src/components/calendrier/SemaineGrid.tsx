import { ScrollView, View } from 'react-native';

export function SemaineGrid({ children }: { children: React.ReactNode }) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} className="flex-1">
      <View className="flex-row gap-3 px-4 py-3">{children}</View>
    </ScrollView>
  );
}
