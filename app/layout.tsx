import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "PadPad",
  description: "Visualize gamepad button presses and keyboard fallback.",
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
