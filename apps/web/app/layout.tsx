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

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="min-h-screen bg-background text-foreground">
        <ThemeProvider>
          <header className="flex items-center justify-end gap-3 border-b border-border bg-card px-4 py-2">
            <ThemeToggle />
            <UserNav />
          </header>
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
