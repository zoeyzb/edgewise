import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Edgewise — Kalshi Sports Edge Hunter",
  description:
    "Profit-first Kalshi sports betting assistant with aggressive discovery and conservative execution validation.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
