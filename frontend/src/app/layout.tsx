import "./globals.css";
import { Inter } from "next/font/google";
import type { Metadata } from "next";
import Link from "next/link";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "IR System",
  description: "Information Retrieval with VSM and Extended Boolean model",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <body className={`${inter.className} min-h-screen text-black`}>
        <header className="border-b border-black/10 bg-white/80 backdrop-blur-sm">
          <nav className="mx-auto flex max-w-6xl items-center justify-between px-5 py-5 md:px-8">
            <h1 className="text-xl font-bold text-black">IR System Project</h1>
            <div className="flex gap-3 text-sm font-semibold">
              <Link href="/" className="rounded-full bg-gold px-5 py-2.5 text-black transition hover:brightness-95">Search</Link>
              <Link href="/documents" className="rounded-full bg-black px-5 py-2.5 text-white transition hover:bg-gold hover:text-black">Documents</Link>
            </div>
          </nav>
        </header>
        <main className="mx-auto max-w-6xl px-5 py-8 md:px-8 md:py-10">{children}</main>
      </body>
    </html>
  );
}
