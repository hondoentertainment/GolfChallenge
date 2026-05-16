import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Golf Challenge - Head-to-Head PGA Tour Picks",
  description: "Compete head-to-head by picking PGA Tour golfers and winning their prize money each week.",
  manifest: "/manifest.json",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
