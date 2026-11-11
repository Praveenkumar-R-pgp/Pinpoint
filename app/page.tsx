"use client";
import { StoreProvider } from "@/lib/store";
import { ThemeProvider } from "@/components/theme";
import Shell from "@/components/Shell";

export default function Page() {
  return (
    <ThemeProvider>
      <StoreProvider>
        <Shell />
      </StoreProvider>
    </ThemeProvider>
  );
}
