# Deadlocks

## Active

### Playwright MCP — Chrome Binary Not Found on NixOS
**Date:** 2026-03-29
**Status:** POTENTIALLY RESOLVED

**Problem:** Playwright MCP plugin hardcodes Chrome path to `/opt/google/chrome/chrome`. NixOS has Chromium at `/run/current-system/sw/bin/chromium`. Environment variables (`CHROME_PATH`, `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH`) are ignored by the MCP plugin.

**Impact:** All browser-based testing, screenshot capture, and interactive debugging via Claude Code MCP tools are blocked.

**Resolution requires:** Either:
1. `sudo ln -sf /run/current-system/sw/bin/chromium /opt/google/chrome/chrome` (needs password)
2. NixOS config rebuild with activation script (needs infraplan PR)
3. Playwright MCP plugin config change (no config option exists)

**Infra issue filed:** `~/issues/infra-level/2026-03-29-playwright-mcp-chrome-binary-not-found-on-nixos.md`

**Workaround:** Use `bash scripts/test.sh` for E2E tests (Playwright CLI respects the env var). Manual browser testing for UI verification.

**Note:** Chrome DevTools MCP (`mcp__chrome-devtools__*`) became available 2026-03-29. This provides browser automation without Playwright MCP. Test with `mcp__chrome-devtools__navigate_page` to confirm.
