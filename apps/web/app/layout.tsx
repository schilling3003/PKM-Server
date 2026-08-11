import type { Metadata } from "next";
import type { ReactNode } from "react";
import { ThemeProvider } from "@/components/ThemeProvider";
import ThemeToggle from "@/components/ThemeToggle";
import { UserNav } from "@/components/UserNav";
import "./globals.css";

export const metadata: Metadata = {
  title: "PKM",
  description: "Markdown-first personal knowledge management",
};

// CSP is applied by proxy.ts; dynamic rendering keeps per-request headers.
export const dynamic = 'force-dynamic';

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="min-h-screen bg-background text-foreground">
        <ThemeProvider>
          <a href="#main-content" className="skip-link">
            Skip to main content
          </a>
          <header className="flex items-center justify-end gap-3 border-b border-border bg-card px-4 py-2">
            <ThemeToggle />
            <UserNav />
          </header>
          <div id="main-content" tabIndex={-1}>{children}</div>
        </ThemeProvider>
      </body>
    </html>
  );
}
