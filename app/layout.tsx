import type { Metadata } from "next";
import { headers } from "next/headers";
import "./globals.css";

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host") ?? "localhost:3001";
  const protocol = requestHeaders.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  const origin = `${protocol}://${host}`;
  const description = "Step through the doors of Maison Miette and follow every cake from first fold to final flourish.";

  return {
    metadataBase: new URL(origin),
    title: "Maison Miette — Pâtisserie & Boulangerie",
    description,
    openGraph: {
      title: "Maison Miette — Every crumb tells a story",
      description,
      type: "website",
      images: [{ url: `${origin}/og.png`, width: 1680, height: 945, alt: "The doors of Maison Miette opening onto cakes and a glowing copper oven" }],
    },
    twitter: {
      card: "summary_large_image",
      title: "Maison Miette — Every crumb tells a story",
      description,
      images: [`${origin}/og.png`],
    },
  };
}

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
