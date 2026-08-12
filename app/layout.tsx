import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Lynn's Agents",
  description: "Think with anyone. Do anything.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="font-sans antialiased">{children}</body>
    </html>
  );
}
