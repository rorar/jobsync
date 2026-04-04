# Database Design: Public API v1

## PublicApiKey Model

```prisma
model PublicApiKey {
  id          String    @id @default(uuid())
  userId      String
  user        User      @relation(fields: [userId], references: [id])
  name        String
  keyHash     String    @unique
  keyPrefix   String
  permissions String    @default("[]")
  lastUsedAt  DateTime?
  createdAt   DateTime  @default(now())
  revokedAt   DateTime?

  @@index([userId])
}
```

## Design Decisions

1. **keyHash (SHA-256)**: One-way hash for fast lookup. Not AES — we never need the plaintext back.
2. **keyPrefix**: First 12 chars of key shown in UI ("pk_live_xxxx").
3. **Soft-delete via revokedAt**: Revoked keys remain for audit trail.
4. **permissions as JSON string**: SQLite doesn't have native JSON. Phase 1 stores `"[]"`, Phase 3 enforces.
5. **Unique on keyHash**: Prevents duplicate key collision.
6. **Separate from ApiKey**: ApiKey is for Module credentials (AES), PublicApiKey is for external API access (SHA-256).

## Key Generation

- Format: `pk_live_` + 40 random hex chars = 48 chars
- Hash: SHA-256 hex digest = 64 chars stored in keyHash
- Prefix: first 12 chars for display

## Query Patterns

- **Create**: Generate key → hash → store hash + prefix → return plaintext ONCE
- **Auth lookup**: Hash incoming key → findUnique by keyHash → check revokedAt
- **List user keys**: findMany by userId, select (never keyHash)
- **Revoke**: update revokedAt = now()
- **Delete**: hard delete after revocation
