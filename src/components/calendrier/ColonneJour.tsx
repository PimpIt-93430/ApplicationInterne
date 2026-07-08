import { Text, View } from 'react-native';

import { estAujourdhui, nomJourCourt, numeroJour } from '@/utils/dateUtils';

export function ColonneJour({ date, children }: { date: Date; children: React.ReactNode }) {
  const aujourdhui = estAujourdhui(date);

  return (
    <View className={`w-36 rounded-2xl p-2 ${aujourdhui ? 'bg-indigo-50' : 'bg-slate-100'}`}>
      <View className="mb-2 items-center">
        <Text
          className={`text-[11px] font-semibold tracking-wide ${
            aujourdhui ? 'text-indigo-500' : 'text-slate-400'
          }`}
        >
          {nomJourCourt(date)}
        </Text>
        <View
          className={`mt-1 h-7 w-7 items-center justify-center rounded-full ${
            aujourdhui ? 'bg-indigo-600' : ''
          }`}
        >
          <Text className={`text-sm font-bold ${aujourdhui ? 'text-white' : 'text-slate-700'}`}>
            {numeroJour(date)}
          </Text>
        </View>
      </View>
      <View className="gap-2">{children}</View>
    </View>
  );
}
