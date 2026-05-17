// cdp-anonymize.mjs — Single Source of Truth for PII redaction in CDP scripts.
// All patterns derived from: openapi.yaml, postfach-protocol-spec.md, profil-page-apis.md, auth-flow.md

/**
 * Redacts PII from strings (URLs, headers, JSON bodies, raw text).
 * Safe to call on null/undefined — returns input unchanged.
 */
export function anonymize(str) {
  if (!str) return str;
  return String(str)
    // === Auth Tokens & Session ===
    .replace(/code=[^&\s"]+/g, 'code=<REDACTED>')
    .replace(/access_token["\s:=]+[^&\s",}]+/g, 'access_token=<REDACTED>')
    .replace(/id_token["\s:=]+[^&\s",}]+/g, 'id_token=<REDACTED>')
    .replace(/refresh_token["\s:=]+[^&\s",}]+/g, 'refresh_token=<REDACTED>')
    .replace(/session_state=[^&\s"]+/g, 'session_state=<REDACTED>')
    .replace(/state=[0-9a-f]{16,}/g, 'state=<REDACTED>')
    .replace(/session_code=[^&\s"]+/g, 'session_code=<REDACTED>')
    .replace(/Bearer [^\s"]+/g, 'Bearer <REDACTED>')
    .replace(/correlation-id=[^&\s"]+/gi, 'correlation-id=<REDACTED>')

    // === URN identifiers (must come before generic Kundennummer to match full URN) ===
    .replace(/urn:bafor:step:person:kundennummer:\d+/g, 'urn:bafor:step:person:kundennummer:<KUNDENNR>')
    .replace(/"identity"\s*:\s*"[^"]*"/g, '"identity": "<REDACTED>"')
    .replace(/"actingOnBehalf"\s*:\s*"[^"]*kundennummer[^"]*"/g, '"actingOnBehalf": "<REDACTED>"')
    .replace(/"leserId"\s*:\s*"[^"]*"/g, '"leserId": "<REDACTED>"')
    .replace(/"empfaengerId"\s*:\s*"[^"]*"/g, '"empfaengerId": "<REDACTED>"')

    // === Kundennummer (various formats) ===
    .replace(/Kundennummer[:\s]*\d+/gi, 'Kundennummer: <KUNDENNR>')
    .replace(/"kundennummer"\s*:\s*"[^"]*"/gi, '"kundennummer": "<KUNDENNR>"')
    .replace(/"kundennr"\s*:\s*"[^"]*"/gi, '"kundennr": "<KUNDENNR>"')
    .replace(/kundennummer:[^"}\s,]+/gi, 'kundennummer:<KUNDENNR>')
    .replace(/\/person\/[A-Z0-9]{6,}/g, '/person/<KUNDENNR>')
    .replace(/kundennr=\d+/gi, 'kundennr=<KUNDENNR>')

    // === Personal names (JSON fields) ===
    .replace(/"name"\s*:\s*"[^"]+"/g, '"name": "<REDACTED>"')
    .replace(/"vorname"\s*:\s*"[^"]+"/g, '"vorname": "<REDACTED>"')
    .replace(/"nachname"\s*:\s*"[^"]+"/g, '"nachname": "<REDACTED>"')
    .replace(/"leserName"\s*:\s*"[^"]+"/g, '"leserName": "<REDACTED>"')
    .replace(/"autorName"\s*:\s*"[^"]+"/g, '"autorName": "<REDACTED>"')
    .replace(/"senderName"\s*:\s*"[^"]+"/g, '"senderName": "<REDACTED>"')
    .replace(/"empfaengerName"\s*:\s*"[^"]+"/g, '"empfaengerName": "<REDACTED>"')
    .replace(/"responsible"\s*:\s*"[^"]+"/g, '"responsible": "<BETREUER>"')

    // === Contact info ===
    .replace(/"email"\s*:\s*"[^"]*@[^"]*"/g, '"email": "<REDACTED>"')
    .replace(/"telefon[^"]*"\s*:\s*"[^"]*"/gi, '"telefon": "<REDACTED>"')
    .replace(/"preferred_username"\s*:\s*"[^"]*"/g, '"preferred_username": "<REDACTED>"')
    .replace(/"acting-profile-name"\s*:\s*"[^"]*"/g, '"acting-profile-name": "<REDACTED>"')

    // === Addresses ===
    .replace(/"adresse[^"]*"\s*:\s*"[^"]*"/gi, '"adresse": "<REDACTED>"')
    .replace(/"strasse"\s*:\s*"[^"]*"/gi, '"strasse": "<REDACTED>"')
    .replace(/"hausnummer"\s*:\s*"[^"]*"/gi, '"hausnummer": "<REDACTED>"')
    .replace(/"plz"\s*:\s*"[^"]*"/gi, '"plz": "<REDACTED>"')
    .replace(/"ort"\s*:\s*"[^"]*"/gi, '"ort": "<REDACTED>"')

    // === Institutional identifiers ===
    .replace(/"dienststellennummer"\s*:\s*"[^"]*"/gi, '"dienststellennummer": "<DSTNR>"')
    .replace(/"dienststellenname"\s*:\s*"[^"]*"/gi, '"dienststellenname": "<DSTNR>"')
    .replace(/dstnr=\d+/gi, 'dstnr=<DSTNR>')
    .replace(/dstnr5=\d+/gi, 'dstnr5=<DSTNR>')
    .replace(/\/dienststelle\/\d{4,6}/g, '/dienststelle/<DSTNR>')

    // === Message content (Postfach — may contain PII) ===
    .replace(/"betreff"\s*:\s*"[^"]*"/g, '"betreff": "<SUBJECT>"')
    .replace(/"text"\s*:\s*"[^"]*"/g, '"text": "<CONTENT>"')
    .replace(/"inhalt"\s*:\s*"[^"]*"/g, '"inhalt": "<CONTENT>"')
    .replace(/"nachrichtText"\s*:\s*"[^"]*"/g, '"nachrichtText": "<CONTENT>"');
}
