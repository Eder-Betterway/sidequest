import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import ServiceWorkerRegister from "@/components/shell/ServiceWorkerRegister";
import AppearanceSync from "@/components/shell/AppearanceSync";
import { APPEARANCE_INIT_SCRIPT } from "@/lib/appearance";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });

export const metadata: Metadata = {
  title: "Sidequest",
  description: "A shared trip planner for two. Dial the vibe, fold in local tips, works offline.",
  icons: {
    icon: [{ url: "/icon.svg", type: "image/svg+xml" }],
    apple: "/apple-touch-icon.png",
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Sidequest",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#faf7f2" },
    { media: "(prefers-color-scheme: dark)", color: "#12151b" },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    // The appearance script sets theme, accent, and text size on <html> before React loads.
    <html lang="en" className={`${inter.variable} h-full antialiased`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: APPEARANCE_INIT_SCRIPT }} />
      </head>
      <body className="h-full font-sans">
        {children}
        <ServiceWorkerRegister />
        <AppearanceSync />
      </body>
    </html>
  );
}
