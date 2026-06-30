"use client";

import { ForgeUIProvider, ThemeProvider } from "forge-ui";
import type { ReactNode } from "react";

export function Providers({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider defaultTheme="system">
      <ForgeUIProvider>{children}</ForgeUIProvider>
    </ThemeProvider>
  );
}
