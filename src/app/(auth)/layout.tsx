/**
 * Authentication layout (signin / signup).
 *
 * Sprint 3 Stream G (Sprint 2 follow-up) — WCAG 2.4.1 "Bypass Blocks".
 * Before this fix the auth pages used a bare `<main>` without the
 * `#main-content` id, so the skip link mounted in `RootLayout`
 * (`href="#main-content"`) was a no-op on /signin and /signup — a
 * keyboard user pressing Tab-Enter on the skip link would see nothing
 * happen. We now render `<main id="main-content" tabIndex={-1}>`,
 * matching the dashboard layout contract, so the skip link becomes a
 * working "jump to the sign-in form" on every auth page.
 *
 * `tabIndex={-1}` is required because `<main>` is NOT natively
 * focusable — without it the skip link jumps to the element but focus
 * stays on the body, and the next Tab press goes back to the top.
 */
export default function AuthLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <main
      id="main-content"
      tabIndex={-1}
      className="flex min-h-screen items-center justify-center bg-muted/40 focus:outline-none"
    >
      {children}
    </main>
  );
}
