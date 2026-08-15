"use client";

import { MyListProvider } from '@/src/contexts/MyListContext';

export default function Providers({ children }: { children: React.ReactNode }) {
  return (
    <MyListProvider>
      {children}
    </MyListProvider>
  );
}
