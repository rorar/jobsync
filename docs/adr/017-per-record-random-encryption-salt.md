# ADR-017: Per-Record Random Encryption Salt

**Date:** 2026-04-01
**Status:** Accepted
**Deciders:** @rorar, Claude Opus 4.6

## Context

API key encryption used PBKDF2 to derive an AES key from the `ENCRYPTION_KEY` environment variable. The salt for PBKDF2 was hardcoded as the string `"jobsync-api-key-encryption"` and shared across all records.

Since JobSync is open-source, this salt is publicly known. The consequences:

1. **Pre-computation attacks**: An attacker can build a rainbow table mapping common `ENCRYPTION_KEY` values to their derived AES keys using the known salt. This table works against all JobSync deployments.
2. **No record isolation**: If an attacker brute-forces the `ENCRYPTION_KEY` (feasible if the operator chose a weak secret), they can decrypt ALL encrypted records in one step -- the same derived key decrypts every record.
3. **Identical plaintexts produce related ciphertexts**: While AES-GCM uses random IVs (mitigating identical ciphertext), the shared salt means the key derivation step is deterministic across all records.

## Decision

Generate a cryptographically random 16-byte salt per encryption operation and store it prefixed to the ciphertext.

### New Encryption Format

```
salt:<hex-encoded-salt>:<base64-encoded-payload>
```

Where `<base64-encoded-payload>` contains the IV + ciphertext + auth tag, as before.

### Implementation Rules

1. **New encryptions** always generate a random salt via `crypto.randomBytes(16)` and write the new format.
2. **Decryption** auto-detects the format:
   - If the stored value starts with `salt:`, parse the hex salt from the prefix and use it for PBKDF2 key derivation.
   - If no `salt:` prefix is present, fall back to the legacy hardcoded salt for backwards compatibility.
3. **No bulk migration** is required. Legacy records are decrypted correctly using format detection. They are re-encrypted with a random salt only when the record is next updated.
4. The hardcoded salt string is retained in the codebase solely for legacy decryption. It is never used for new encryptions.

### Key Derivation

```ts
// Per-record: unique derived key
const salt = crypto.randomBytes(16);
const derivedKey = crypto.pbkdf2Sync(ENCRYPTION_KEY, salt, 100_000, 32, "sha256");
```

### Alternatives Considered

- **Encrypt-then-MAC with HMAC**: More complex, and AES-256-GCM already provides authenticated encryption. The vulnerability was in key derivation, not in the cipher mode.
- **Mandatory bulk migration**: Rejected -- would require downtime and a migration script. Lazy re-encryption on update is simpler and risk-free.
- **Switching to libsodium/NaCl**: Overkill for the current use case. PBKDF2 + AES-GCM with proper salting is sufficient and uses only Node.js built-in crypto.

## Consequences

### Positive
- Per-record isolation: brute-forcing one record's key derivation does not help decrypt any other record
- Rainbow table attacks are infeasible -- each record has a unique 128-bit salt
- Backwards compatible -- legacy records decrypt without migration
- Transparent upgrade path -- records are silently re-encrypted with random salt on next write
- Uses only Node.js built-in `crypto` module, no new dependencies

### Negative
- Stored ciphertext is ~40 bytes longer per record due to the salt prefix (negligible for the record counts in JobSync)
- Slightly more complex decryption logic due to format detection branching
- Legacy records remain vulnerable until they are next updated and re-encrypted

### Risks
- If `ENCRYPTION_KEY` is weak (short, dictionary word), per-record salt only increases brute-force cost linearly -- operators must still choose strong secrets
- Format detection relies on string prefix matching (`salt:`); a corrupted record could be misidentified (mitigated by AES-GCM authentication failing on wrong key)
- Legacy hardcoded salt remains in source code, which could confuse future contributors into reusing it
