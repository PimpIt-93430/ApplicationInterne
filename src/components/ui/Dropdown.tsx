import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';

export interface DropdownOption {
  value: string;
  label: string;
  couleur?: string;
}

export function Dropdown({
  value,
  options,
  onChange,
  placeholder = 'Choisir…',
}: {
  value: string | undefined;
  options: DropdownOption[];
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  const [ouvert, setOuvert] = useState(false);
  const selection = options.find((o) => o.value === value);

  return (
    <View className="relative z-10">
      <Pressable
        onPress={() => setOuvert((v) => !v)}
        className="flex-row items-center justify-between rounded-xl border border-slate-200 bg-white px-4 py-3"
      >
        <View className="flex-row items-center gap-2">
          {selection?.couleur && (
            <View className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: selection.couleur }} />
          )}
          <Text className="text-base font-semibold text-slate-800">
            {selection?.label ?? placeholder}
          </Text>
        </View>
        <Text className="text-slate-400">{ouvert ? '︿' : '⌄'}</Text>
      </Pressable>

      {ouvert && (
        <View className="absolute left-0 right-0 top-full z-20 mt-1 rounded-xl border border-slate-200 bg-white p-1 shadow-lg">
          {options.map((option) => (
            <Pressable
              key={option.value}
              onPress={() => {
                onChange(option.value);
                setOuvert(false);
              }}
              className={`flex-row items-center gap-2 rounded-lg px-3 py-2.5 ${
                option.value === value ? 'bg-indigo-50' : ''
              }`}
            >
              {option.couleur && (
                <View className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: option.couleur }} />
              )}
              <Text
                className={`text-base ${option.value === value ? 'font-semibold text-indigo-600' : 'text-slate-700'}`}
              >
                {option.label}
              </Text>
            </Pressable>
          ))}
        </View>
      )}
    </View>
  );
}
