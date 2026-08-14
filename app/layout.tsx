import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Lynn's Agents",
  description: "Think with anyone. Do anything.",
  manifest: "/site.webmanifest",
  icons: {
    icon: "/icons/icon-32.png",
    apple: "/icons/apple-touch-icon.png",
  },
  appleWebApp: {
    capable: true,
    title: "Lynn's Agents",
    statusBarStyle: "black",
  },
};

export const viewport: Viewport = {
  themeColor: "#08090c",
  // Lets content draw under the notch/home-indicator instead of iOS just
  // painting a solid bar there — combined with the safe-top/safe-bottom
  // classes below so the sticky chat header/input still clear those areas.
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="font-sans antialiased">{children}</body>
    </html>
  );
}
