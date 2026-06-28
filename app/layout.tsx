import type { Metadata } from "next";
import { Inter, Inter_Tight, JetBrains_Mono } from "next/font/google";
import "./globals.css";

const fontWsDisplay = Inter_Tight({
  subsets: ["latin", "cyrillic"],
  variable: "--font-ws-display",
  weight: ["400", "500", "600", "700", "800"],
});

const fontWsUi = Inter({
  subsets: ["latin", "cyrillic"],
  variable: "--font-ws-ui",
  weight: ["400", "500", "600", "700", "800"],
});

const fontWsMono = JetBrains_Mono({
  subsets: ["latin", "cyrillic"],
  variable: "--font-ws-mono",
  weight: ["400", "500", "600"],
});

export const metadata: Metadata = {
  title: "AI Council — Mission Control",
  description: "Multiple AI models. One verified conclusion. Build your AI city.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`min-h-screen bg-app antialiased ${fontWsDisplay.variable} ${fontWsUi.variable} ${fontWsMono.variable}`}
      >
        {children}
      </body>
    </html>
  );
}
