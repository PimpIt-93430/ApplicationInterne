import { Redirect, Slot } from 'expo-router';

import { useAuthStore } from '@/store/useAuthStore';

export default function AdminLayout() {
  const profile = useAuthStore((s) => s.profile);

  if (profile?.role !== 'admin') {
    return <Redirect href="/(app)" />;
  }

  return <Slot />;
}
