/**
 * F6 — ToastClose dismiss-label i18n.
 *
 * The close button's screen-reader label must fall back to the localised
 * `common.dismiss` key (not a hardcoded English "Dismiss") when no explicit
 * `label` prop is supplied. useTranslations resolves the locale from
 * LocaleProvider context.
 */

import "@testing-library/jest-dom";
import React from "react";
import { render, screen } from "@testing-library/react";
import { LocaleProvider } from "@/i18n/locale-context";
import { ToastProvider, Toast, ToastClose, ToastViewport } from "@/components/ui/toast";

function renderToast(locale: string, label?: string) {
  return render(
    <LocaleProvider locale={locale}>
      <ToastProvider>
        <Toast open>
          <ToastClose label={label} />
        </Toast>
        <ToastViewport />
      </ToastProvider>
    </LocaleProvider>,
  );
}

describe("ToastClose dismiss label i18n (F6)", () => {
  it("uses the localised fallback (de: Schließen) when no label is supplied", () => {
    renderToast("de");
    expect(screen.getByText("Schließen")).toBeInTheDocument();
  });

  it("uses the English fallback (Dismiss) when locale is en", () => {
    renderToast("en");
    expect(screen.getByText("Dismiss")).toBeInTheDocument();
  });

  it("honours an explicit label prop over the localised fallback", () => {
    renderToast("de", "Custom Close");
    expect(screen.getByText("Custom Close")).toBeInTheDocument();
  });
});
