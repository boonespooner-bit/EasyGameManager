import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Easy Game Manager",
  description: "Easily manage your baseball games",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
