import Header from "@/components/Header";
import Sidebar from "@/components/Sidebar";
import { Toaster } from "@/components/ui/toaster";
import { ActivityProvider } from "@/context/ActivityContext";
import { GlobalActivityBanner } from "@/components/activities/GlobalActivityBanner";
import { GlobalUndoListener } from "@/components/GlobalUndoListener";

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <ActivityProvider>
      <div className="flex min-h-screen w-full flex-col bg-muted/40">
        <Sidebar />
        <div className="flex flex-1 flex-col sm:gap-4 sm:py-4 sm:pl-14">
          <Header />
          <GlobalActivityBanner />
          {/*
            WCAG 2.4.1 target for the root-layout skip link. `tabIndex={-1}`
            makes the landmark focusable so that, after activating "Skip to
            main content", the focus ring lands inside the content region
            (otherwise some browsers ignore fragment jumps on non-interactive
            elements and the skip link is effectively silent).
          */}
          <main
            id="main-content"
            tabIndex={-1}
            className="flex-1 md:block lg:grid items-start gap-4 p-4 sm:px-6 sm:py-0 md:gap-4 lg:grid-cols-3 xl:grid-cols-3 focus:outline-none"
          >
            {children}
          </main>
          <Toaster />
          <GlobalUndoListener />
        </div>
      </div>
    </ActivityProvider>
  );
}
