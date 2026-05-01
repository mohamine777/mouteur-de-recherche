import "./globals.css";
import type { Metadata } from "next";
import Link from "next/link";
import SiteHeader from "@/components/SiteHeader";

export const metadata: Metadata = {
  title: "Moteur de Recherche RI",
  description: "Academic Information Retrieval search engine",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <body className="min-h-screen text-[#f9fafb]">
        <SiteHeader />
        <main className="mx-auto max-w-6xl px-5 py-8 md:px-8 md:py-10">{children}</main>
      </body>
    </html>
  );
}
