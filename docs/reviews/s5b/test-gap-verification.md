# S5b Test Gap Verification

Verified 2026-04-05 by systematic cross-referencing of source files against
`__tests__/` test files. Six claims from the comprehensive review were evaluated.

---

## Gap 1: smtp.actions.ts — Zero Test Coverage

### Verdict: CONFIRMED

**Functions in `src/actions/smtp.actions.ts`:**

| Function | Exported | Tests found |
|---|---|---|
| `saveSmtpConfig(input)` | yes | none |
| `getSmtpConfig()` | yes | none |
| `testSmtpConnection()` | yes | none |
| `deleteSmtpConfig()` | yes | none |
| `validateInput(data, requirePassword)` | no (internal) | none |
| `resolveUserLocale(userId)` | no (internal) | none |
| `toDTO(config)` | no (internal) | none |

**Evidence:** Grep for all four exported function names across all `__tests__/` files
returns zero matches. No `smtp.actions.spec.ts` file exists. The only smtp-related
test file is `smtp-validation.spec.ts`, which tests `src/lib/smtp-validation.ts`
exclusively.

**Priority: Critical path**

The server actions are the primary write boundary for SMTP configuration. They contain
non-trivial logic: create vs. update distinction, `requirePassword` toggle, AES
encryption on save, password-omission behavior on update, and IDOR protection via
`userId` in every Prisma query. None of this is exercised by any test.

**Recommended test file:** `__tests__/smtp.actions.spec.ts`

Key scenarios to cover:

```typescript
// Mock requirements: prisma, getCurrentUser, encrypt/decrypt, getLast4,
// validateSmtpHost, checkTestEmailRateLimit, renderTestEmail, nodemailer

describe("saveSmtpConfig", () => {
  it("creates new config when none exists — encrypts password");
  it("updates existing config — keeps old password when omitted");
  it("updates existing config — replaces password when provided");
  it("rejects invalid host via validateSmtpHost");
  it("rejects invalid port (0, 65536, non-integer)");
  it("rejects missing username");
  it("rejects missing password on create");
  it("allows missing password on update");
  it("rejects invalid fromAddress format");
  it("returns success:false when unauthenticated");
  it("toDTO masks password to ****last4");
  it("toDTO uses generic mask when decryption fails");
});

describe("getSmtpConfig", () => {
  it("returns null data when no config exists");
  it("returns masked DTO when config exists");
  it("returns success:false when unauthenticated");
});

describe("testSmtpConnection", () => {
  it("returns smtp.testRateLimited when rate limited");
  it("returns smtp.notConfigured when no active config");
  it("returns smtp.connectionFailed when decryption fails");
  it("returns smtp.ssrfBlocked when re-validation fails at send time");
  it("resolves user locale for template rendering");
  it("closes transporter in finally block even on send error");
  it("returns success:true on successful send");
  it("returns success:false when unauthenticated");
});

describe("deleteSmtpConfig", () => {
  it("returns smtp.notConfigured when nothing to delete");
  it("deletes config with userId in where clause (IDOR)");
  it("returns success:true on deletion");
  it("returns success:false when unauthenticated");
});
```

---

## Gap 2: push.actions.ts — Zero Test Coverage

### Verdict: CONFIRMED

**Functions in `src/actions/push.actions.ts`:**

| Function | Exported | Tests found |
|---|---|---|
| `getVapidPublicKeyAction()` | yes | none |
| `subscribePush(input)` | yes | none |
| `unsubscribePush(endpoint)` | yes | none |
| `getSubscriptionCount()` | yes | none |
| `rotateVapidKeysAction()` | yes | none |
| `sendTestPush()` | yes | none |

**Evidence:** Grep for all six exported function names across all `__tests__/` files
returns zero matches. No `push.actions.spec.ts` file exists. The only push-related
test files are `push-channel.spec.ts` (tests `PushChannel` class) and `vapid.spec.ts`
(tests `getOrCreateVapidKeys`/`rotateVapidKeys` from `src/lib/push/vapid.ts`).
The action layer sitting above both of these is entirely untested.

**Priority: Critical path**

`subscribePush` contains multi-step logic: endpoint format validation, subscription
limit check with existing-endpoint exemption, separate encryption per key, combined-IV
storage, and upsert semantics. None of this is tested. `sendTestPush` has the i18n
bug described in Gap 3 below which also goes undetected.

**Recommended test file:** `__tests__/push.actions.spec.ts`

Key scenarios to cover:

```typescript
// Mock requirements: prisma, getCurrentUser, encrypt, getOrCreateVapidKeys,
// checkTestPushRateLimit, PushChannel

describe("getVapidPublicKeyAction", () => {
  it("returns publicKey from getOrCreateVapidKeys");
  it("returns success:false when unauthenticated");
});

describe("subscribePush", () => {
  it("encrypts p256dh and auth separately, stores combined IV");
  it("upserts by (userId, endpoint)");
  it("rejects endpoint not starting with https://");
  it("rejects missing p256dh key");
  it("rejects missing auth key");
  it("rejects when at limit and endpoint is new");
  it("allows re-subscription when at limit but endpoint already exists");
  it("returns success:false when unauthenticated");
});

describe("unsubscribePush", () => {
  it("deletes by composite (userId, endpoint)");
  it("succeeds silently when subscription already deleted");
  it("rejects non-string endpoint");
  it("returns success:false when unauthenticated");
});

describe("getSubscriptionCount", () => {
  it("returns count of subscriptions for current user");
  it("returns success:false when unauthenticated");
});

describe("rotateVapidKeysAction", () => {
  it("delegates to rotateVapidKeys and returns new publicKey");
  it("returns success:false when unauthenticated");
});

describe("sendTestPush", () => {
  it("returns push.testRateLimited when rate limited");
  it("returns push.noSubscriptions when channel not available");
  it("dispatches notification through PushChannel");
  it("passes raw i18n key as message (documents known bug)");
  it("returns success:true when dispatch succeeds");
  it("returns push.testFailed when dispatch fails");
  it("returns success:false when unauthenticated");
});
```

---

## Gap 3: sendTestPush i18n Bug — Raw Key Passed to Channel

### Verdict: CONFIRMED — Bug is real and untested

**Location:** `src/actions/push.actions.ts` lines 237–244

```typescript
const result = await channel.dispatch(
  {
    userId: user.id,
    type: "module_unreachable",
    message: "push.testBody",      // <-- raw i18n key, not a translated string
    data: { test: true },
  },
  user.id,
);
```

**Analysis:** The `message` field receives the literal string `"push.testBody"` rather
than a translated string. The `PushChannel` passes this value directly into the push
payload as `body`:

```typescript
// push.channel.ts line 120–125
const payload = JSON.stringify({
  title: "JobSync",
  body: notification.message,   // receives "push.testBody" verbatim
  url: "/dashboard",
  tag: notification.type,
});
```

The browser push notification will therefore display `"push.testBody"` as its body
text instead of the translated string (e.g. "Test notification from JobSync").

**Contrast with email:** `testSmtpConnection()` correctly calls
`renderTestEmail(locale)` which translates the keys before sending.

**Is this tested?** No. The push-channel spec passes a pre-translated message string
(`"A vacancy was promoted"`) as the notification fixture. No test exercises
`sendTestPush()` at all, so the raw-key bug is invisible.

**Priority: Critical path**

This is a user-facing defect. The fix requires resolving the user locale (same pattern
as `resolveUserLocale()` in `smtp.actions.ts`) and calling `t(locale, "push.testBody")`.

**Regression test to add inside `push.actions.spec.ts`:**

```typescript
it("dispatches a translated body string, not a raw i18n key", async () => {
  // Arrange
  mockGetCurrentUser.mockResolvedValue({ id: "user-1" });
  mockCheckTestPushRateLimit.mockReturnValue({ allowed: true });
  mockChannelIsAvailable.mockResolvedValue(true);
  mockChannelDispatch.mockResolvedValue({ success: true });

  await sendTestPush();

  const draft = mockChannelDispatch.mock.calls[0][0];
  // Must NOT be the raw key
  expect(draft.message).not.toBe("push.testBody");
  // Must be a non-empty translated string
  expect(draft.message.length).toBeGreaterThan(0);
  expect(draft.message).not.toMatch(/^\w+\.\w+$/); // not a dotted key pattern
});
```

Note: this test will FAIL against the current implementation, which is the intended
red-green starting point for the fix.

---

## Gap 4: PushChannel 401/403 Handling

### Verdict: REFUTED — 401 and 403 ARE tested indirectly; subscription deletion IS verified

**What the code does** (`push.channel.ts` lines 166–189):

- HTTP 401, 403, 404, 410: all four trigger `prisma.webPushSubscription.delete()`
- After deletion, 401/403 additionally log a VAPID auth failure message and return
  `{ success: false, error: "VAPID auth failure (NNN)" }`
- 404/410 return `{ success: false, error: "Subscription expired (NNN)" }`

**What the tests cover** (`push-channel.spec.ts`):

The existing test at line 181 (`"deletes stale subscription on 410 Gone"`) verifies
that `mockWebPushSubscriptionDelete` is called when a `WebPushError` with status 410
is thrown, and asserts `result.channel === "push"`.

**What is missing:** There is no dedicated test for status 401 or 403. The 410 test
verifies deletion happens, but does not assert the specific error message string
(`"VAPID auth failure (401)"`), and does not verify the distinct code path for
401/403 vs. 404/410.

**Revised verdict: PARTIALLY CONFIRMED**

The deletion behavior is verified for 410. The 401/403 branch (which has a distinct
semantic — VAPID credential failure vs. stale subscription) is not explicitly tested.

**Priority: Nice-to-have** (deletion is covered; the log message difference is the
only gap)

**Tests to add inside `push-channel.spec.ts`:**

```typescript
it("deletes subscription and returns VAPID auth failure error on 401", async () => {
  const { WebPushError: MockWebPushError } = jest.requireMock("web-push");
  const authError = new MockWebPushError("Unauthorized", 401);
  mockSendNotification.mockRejectedValue(authError);

  const result = await channel.dispatch(NOTIFICATION, TEST_USER_ID);

  expect(mockWebPushSubscriptionDelete).toHaveBeenCalledWith({
    where: { id: SUBSCRIPTION_1.id, userId: TEST_USER_ID },
  });
  expect(result.success).toBe(false);
  expect(result.error).toContain("VAPID auth failure (401)");
});

it("deletes subscription and returns VAPID auth failure error on 403", async () => {
  const { WebPushError: MockWebPushError } = jest.requireMock("web-push");
  const authError = new MockWebPushError("Forbidden", 403);
  mockSendNotification.mockRejectedValue(authError);

  const result = await channel.dispatch(NOTIFICATION, TEST_USER_ID);

  expect(mockWebPushSubscriptionDelete).toHaveBeenCalledWith({
    where: { id: SUBSCRIPTION_1.id, userId: TEST_USER_ID },
  });
  expect(result.success).toBe(false);
  expect(result.error).toContain("VAPID auth failure (403)");
});

it("deletes subscription on 404 Not Found with expired error", async () => {
  const { WebPushError: MockWebPushError } = jest.requireMock("web-push");
  const notFoundError = new MockWebPushError("Not Found", 404);
  mockSendNotification.mockRejectedValue(notFoundError);

  const result = await channel.dispatch(NOTIFICATION, TEST_USER_ID);

  expect(mockWebPushSubscriptionDelete).toHaveBeenCalled();
  expect(result.error).toContain("Subscription expired (404)");
});
```

---

## Gap 5: SMTP Validation — Octal/Hex/Shorthand IP Bypass

### Verdict: CONFIRMED — These four formats are untested and two bypass the validator

**Formats examined:**

| Format | Example | Validator result | Tested? |
|---|---|---|---|
| Octal IPv4 | `0177.0.0.1` (= 127.0.0.1) | **Passes** (not blocked) | No |
| Hex IPv4 | `0x7f000001` (= 127.0.0.1) | **Passes** (not blocked) | No |
| Shorthand IPv4 | `127.1` (= 127.0.0.1) | **Passes** (not blocked) | No |
| Decimal integer | `2130706433` (= 127.0.0.1) | **Passes** (not blocked) | No |

**Analysis of `validateSmtpHost`:** The function operates entirely on string regex
patterns applied to the raw input (after lowercasing and bracket-stripping). None of
the regex patterns (`/^127\./`, `/^10\./`, etc.) match alternate IP representations.
A Node.js `net.lookup()` or `dns.resolve()` call would be needed to canonicalize the
address before pattern matching, which the current implementation does not do.

**However:** In the SMTP context, `nodemailer` passes the host directly to the OS DNS
resolver. The OS will NOT expand `0x7f000001` to `127.0.0.1` on Linux — these are not
valid hostname strings that DNS resolvers recognize. The practical SSRF risk from
these formats in an SMTP connection is lower than in an HTTP URL context (where
browsers do canonical resolution). The risk is non-zero if the host is ever passed
to a library that uses `getaddrinfo()` with `AI_NUMERICHOST`.

**Priority: Nice-to-have**

Add tests that document the current behavior (bypass) without necessarily requiring
an immediate fix. This creates a regression baseline and surfaces the behavior for a
future hardening pass.

**Tests to add inside `smtp-validation.spec.ts`:**

```typescript
describe("alternative IP representations (bypass documentation)", () => {
  // These formats are NOT currently blocked by the regex-based validator.
  // They document known limitations for future hardening.
  // In the SMTP context the practical risk is low: nodemailer passes the
  // host to the OS resolver which does not interpret octal/hex/decimal IPs.

  it("does NOT block octal representation 0177.0.0.1 (current behavior)", () => {
    // If this test starts failing after a hardening change, update the assertion.
    const result = validateSmtpHost("0177.0.0.1");
    // Document: currently passes — should be blocked in a future hardening pass
    expect(result.valid).toBe(true); // known gap
  });

  it("does NOT block hex representation 0x7f000001 (current behavior)", () => {
    const result = validateSmtpHost("0x7f000001");
    expect(result.valid).toBe(true); // known gap
  });

  it("does NOT block shorthand 127.1 (current behavior)", () => {
    const result = validateSmtpHost("127.1");
    expect(result.valid).toBe(true); // known gap
  });

  it("does NOT block decimal integer 2130706433 (current behavior)", () => {
    const result = validateSmtpHost("2130706433");
    expect(result.valid).toBe(true); // known gap
  });
});
```

---

## Gap 6: buildNotificationMessage Data Interpolation

### Verdict: CONFIRMED — No interpolation tests exist

**What `buildNotificationMessage` does** (`src/lib/email/templates.ts` lines 156–212):

1. Translates the notification type to an i18n key
2. Calls `t(locale, key)` to get the template string (e.g.
   `"Module {name} deactivated. {automationCount} automation(s) paused."`)
3. Iterates over `data` entries and replaces `{key}` placeholders verbatim
4. Then applies a second alias pass mapping domain field names to template
   variable names:
   - `data.moduleId` → replaces `{name}`
   - `data.affectedAutomationCount` → replaces `{automationCount}`
   - `data.pausedAutomationCount` → replaces `{automationCount}` (same target)
   - `data.succeeded` → replaces `{succeeded}`
   - `data.actionType` → replaces `{actionType}`
   - `data.purgedCount` → replaces `{count}`
   - `data.count` → replaces `{count}` (same target)
   - `data.newStatus` → replaces `{newStatus}`

**What the tests cover** (`email-templates.spec.ts`):

All calls to `renderEmailTemplate` in the test file pass `{}` as the data argument:

```typescript
renderEmailTemplate(type, {}, "en")       // line 63
renderEmailTemplate("vacancy_promoted", {}, "en")  // lines 78, 83, 108, 122, ...
```

No test passes actual domain data. The i18n mock returns
`[locale]notifications.moduleDeactivated` (the raw key string), so even if data were
passed, no `{name}` placeholder would appear in the mock output to be replaced.

This means:
- The placeholder replacement loop (`for (const [k, v] of Object.entries(data))`)
  is never exercised
- The alias pass (`data.moduleId → {name}`, `data.purgedCount → {count}`, etc.) is
  never exercised
- A bug in the alias pass (e.g. wrong field name, missing alias) would be invisible

**Priority: Critical path**

The alias pass contains real logic that could silently fail. For example,
`data.affectedAutomationCount` and `data.pausedAutomationCount` both target
`{automationCount}` — if the wrong field name is used at the call site, the
placeholder survives and the user sees `{automationCount}` in the email body.

**Tests to add inside `email-templates.spec.ts`:**

These tests require a real (non-mocked) `t()` implementation, or the mock must be
updated to return actual template strings with placeholders:

```typescript
describe("buildNotificationMessage — data interpolation", () => {
  // Override the mock for these tests to return real template strings
  // so placeholder substitution can be verified.
  beforeEach(() => {
    const { t } = jest.requireMock("@/i18n/dictionaries");
    t.mockImplementation((locale: string, key: string) => {
      const templates: Record<string, string> = {
        "notifications.moduleDeactivated":
          "Module {name} deactivated. {automationCount} automation(s) paused.",
        "notifications.retentionCompleted":
          "{count} expired vacancies cleaned up",
        "notifications.bulkActionCompleted":
          "{succeeded} items {actionType} successfully",
        "notifications.batchStaged":
          "{count} new vacancies staged from automation",
        "notifications.jobStatusChanged":
          "Job status changed to {newStatus}",
        // header/footer/greeting/subject keys return short strings
        "email.header": "JobSync",
        "email.footer": "footer",
        "email.greeting": "Hello",
        "email.subject.module_deactivated": "Module Deactivated",
        "email.subject.retention_completed": "Retention Completed",
        "email.subject.bulk_action_completed": "Bulk Action Completed",
        "email.subject.vacancy_batch_staged": "Vacancies Staged",
        "email.subject.job_status_changed": "Job Status Changed",
      };
      return templates[key] ?? key;
    });
  });

  it("substitutes moduleId into {name} placeholder", () => {
    const result = renderEmailTemplate(
      "module_deactivated",
      { moduleId: "eures", affectedAutomationCount: 3 },
      "en",
    );
    expect(result.text).toContain("Module eures deactivated");
    expect(result.text).toContain("3 automation(s) paused");
  });

  it("substitutes purgedCount into {count} placeholder", () => {
    const result = renderEmailTemplate(
      "retention_completed",
      { purgedCount: 42 },
      "en",
    );
    expect(result.text).toContain("42 expired vacancies");
  });

  it("substitutes count into {count} placeholder", () => {
    const result = renderEmailTemplate(
      "vacancy_batch_staged",
      { count: 15 },
      "en",
    );
    expect(result.text).toContain("15 new vacancies");
  });

  it("substitutes succeeded and actionType into bulk_action_completed", () => {
    const result = renderEmailTemplate(
      "bulk_action_completed",
      { succeeded: 10, actionType: "archived" },
      "en",
    );
    expect(result.text).toContain("10 items archived successfully");
  });

  it("substitutes newStatus into job_status_changed", () => {
    const result = renderEmailTemplate(
      "job_status_changed",
      { newStatus: "Interview" },
      "en",
    );
    expect(result.text).toContain("Job status changed to Interview");
  });

  it("leaves unmatched placeholders intact when data is empty", () => {
    const result = renderEmailTemplate("module_deactivated", {}, "en");
    // Placeholders survive when no data provided — documents behavior
    expect(result.text).toContain("{name}");
    expect(result.text).toContain("{automationCount}");
  });

  it("uses pausedAutomationCount as fallback for {automationCount}", () => {
    const result = renderEmailTemplate(
      "module_deactivated",
      { moduleId: "jsearch", pausedAutomationCount: 2 },
      "en",
    );
    expect(result.text).toContain("2 automation(s) paused");
  });
});
```

---

## Summary Table

| Gap | Verdict | Priority | Action |
|---|---|---|---|
| smtp.actions.ts — 0% coverage | **Confirmed** | Critical | New file: `smtp.actions.spec.ts` (~30 tests) |
| push.actions.ts — 0% coverage | **Confirmed** | Critical | New file: `push.actions.spec.ts` (~20 tests) |
| sendTestPush i18n bug | **Confirmed** | Critical | Regression test + fix in `push.actions.ts` |
| PushChannel 401/403 handling | **Partially confirmed** | Nice-to-have | Add 3 tests to `push-channel.spec.ts` |
| SMTP validation octal/hex IPs | **Confirmed** | Nice-to-have | Add 4 documentation tests to `smtp-validation.spec.ts` |
| buildNotificationMessage interpolation | **Confirmed** | Critical | Add ~7 tests to `email-templates.spec.ts` |

**Critical gaps (4 of 6):** Two entirely untested server action files, one confirmed
user-visible i18n bug in `sendTestPush`, and untested placeholder substitution logic
in the email template builder.
