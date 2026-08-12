import type { Metadata } from "next";
import { Inter, Bricolage_Grotesque } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

// Display face for headlines only (see globals.css's --font-display) --
// Bricolage's slightly hand-adjusted letterforms read as "made by a small
// studio," which is the point: this portal belongs to a boutique creative
// agency, not a faceless SaaS. Inter stays the workhorse for everything
// that needs to be read quickly (forms, labels, amounts).
const bricolage = Bricolage_Grotesque({
  variable: "--font-bricolage",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Kravio Studio — Portal Klien",
  description: "Portal klien Kravio Studio: ajukan brief, lihat invoice, dan catat pembayaran.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="id" className={`${inter.variable} ${bricolage.variable} h-full antialiased`}>
      <body className="min-h-full">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
