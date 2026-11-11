"use client";
import React, { createContext, useContext, useEffect, useState } from "react";

export type ThemeName = "light" | "dark";
const KEY = "pinpoint-theme";

const Ctx = createContext<{ theme: ThemeName; toggle: () => void }>({ theme: "light", toggle: () => {} });

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useState<ThemeName>("light");

  useEffect(() => {
    const current = document.documentElement.getAttribute("data-theme") as ThemeName | null;
    if (current === "dark" || current === "light") setTheme(current);
  }, []);

  const toggle = () => {
    const next: ThemeName = theme === "dark" ? "light" : "dark";
    setTheme(next);
    document.documentElement.setAttribute("data-theme", next);
    try {
      window.localStorage.setItem(KEY, next);
    } catch {}
  };

  return <Ctx.Provider value={{ theme, toggle }}>{children}</Ctx.Provider>;
}

export const useTheme = () => useContext(Ctx);

// Runs before first paint (see app/layout.tsx) so there is no light/dark flash
export const themeBootScript = `(function(){try{var t=localStorage.getItem('${KEY}');if(t!=='light'&&t!=='dark'){t=window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'}document.documentElement.setAttribute('data-theme',t)}catch(e){document.documentElement.setAttribute('data-theme','light')}})();`;

// Recharts needs literal colours, so keep a palette per theme
export function useChartColors() {
  const { theme } = useTheme();
  return theme === "dark"
    ? { grid: "#232b3d", axis: "#8a94a7", base: "#5d677b", line: "#3cc3cf", fill: "#3cc3cf", red: "#ef6a62", amber: "#f4b25a", tipBg: "#1b2233", tipBorder: "#2c3548", tipText: "#e6e9ef" }
    : { grid: "#eef1f4", axis: "#6b7280", base: "#a3abb7", line: "#0e7c86", fill: "#0e7c86", red: "#c8423b", amber: "#f2a541", tipBg: "#ffffff", tipBorder: "#e5e7eb", tipText: "#1f2937" };
}
