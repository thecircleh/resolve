import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Resolve",
  description: "Leadership Decision Intelligence",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-white text-ink">
        <div className="min-h-screen flex flex-col">
          <header className="border-b border-canvas-border">
            <div className="max-w-4xl mx-auto px-6 py-4 flex items-center justify-between">
              <a href="/" className="font-semibold text-lg tracking-tight">
                Resolve
              </a>
              <nav className="text-sm text-ink-muted">
                <a href="/dashboard" className="hover:text-ink">
                  Sessions
                </a>
              </nav>
            </div>
          </header>
          <main className="flex-1">{children}</main>
          <footer className="border-t border-canvas-border">
            <div className="max-w-4xl mx-auto px-6 py-4 text-xs text-ink-muted">
              Resolve — Leadership Decision Intelligence — Beta
            </div>
          </footer>
        </div>
      </body>
    </html>
  );
}
