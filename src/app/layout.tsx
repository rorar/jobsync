import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { cn } from "@/lib/utils";
import { ThemeProvider } from "@/components/theme-provider";
import { ErrorCaptureInit } from "@/components/ErrorCaptureInit";
import { getUserLocale, t } from "@/i18n/server";
import { LocaleProvider } from "@/i18n/locale-context";

export const dynamic = "force-dynamic";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
});

export const metadata: Metadata = {
  title: {
    template: "%s | JobSync",
    default: "JobSync",
  },
  description: "Job Application Tracking System",
};

interface Props {
  children: React.ReactNode;
}

export default async function RootLayout({ children }: Readonly<Props>) {
  const locale = await getUserLocale();

  return (
    <html lang={locale} suppressHydrationWarning>
      <body
        className={cn(
          "min-h-screen bg-background font-sans antialiased",
          inter.variable
        )}
      >
        {/*
          WCAG 2.4.1 (Bypass Blocks, Level A) — skip link MUST be the first
          focusable element in the body. Visually hidden by default, revealed
          on keyboard focus. Targets the <main id="main-content"> in the
          dashboard layout (and any other authenticated layout that mounts a
          main region). Auth / marketing pages also gain a working skip link
          when they render a main landmark; the href degrades gracefully to
          a no-op when no #main-content target exists.
        */}
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:fixed focus:left-2 focus:top-2 focus:z-[100] focus:rounded focus:bg-background focus:px-3 focus:py-2 focus:text-sm focus:font-medium focus:text-foreground focus:shadow focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
        >
          {t(locale, "nav.skipToContent")}
        </a>
        {process.env.NODE_ENV === "development" && <ErrorCaptureInit />}
        <LocaleProvider locale={locale}>
          <ThemeProvider
            attribute="class"
            defaultTheme="system"
            enableSystem
            disableTransitionOnChange
          >
            {children}
          </ThemeProvider>
        </LocaleProvider>
      </body>
    </html>
  );
}
