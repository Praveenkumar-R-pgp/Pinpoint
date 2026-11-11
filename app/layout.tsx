import "@fontsource/inter/400.css";
import "@fontsource/inter/500.css";
import "@fontsource/inter/600.css";
import "@fontsource/ibm-plex-mono/400.css";
import "./globals.css";
import type { Metadata } from "next";
import { themeBootScript } from "@/components/theme";

export const metadata: Metadata = {
  title: "Pinpoint · Campaign anomaly alerts",
  description: "Prototype: detect meaningful campaign anomalies, prioritise by business context, and act in time.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeBootScript }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
