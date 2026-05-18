import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Canon Lab",
  description: "Laboratorio tipográfico para decidir fuentes con comparación ciega.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es">
      <body className="antialiased">{children}</body>
    </html>
  );
}
