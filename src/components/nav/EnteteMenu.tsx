import { Pressable, Text, View } from 'react-native';

import { useMenuStore } from '@/store/useMenuStore';

export function EnteteMenu({ titre }: { titre: string }) {
  const ouvrir = useMenuStore((s) => s.ouvrir);

  return (
    <View className="flex-row items-center gap-3 px-4 pb-2 pt-14">
      <Pressable onPress={ouvrir} className="h-9 w-9 items-center justify-center rounded-lg bg-slate-100">
        <Text className="text-lg text-slate-700">☰</Text>
      </Pressable>
      <Text className="text-2xl font-bold text-slate-900">{titre}</Text>
    </View>
  );
}
