# OTA Termin-Service Protocol Specification

## Overview

REST API for managing appointments (Termine) with the Bundesagentur für Arbeit and Jobcenter.
Provides read access to upcoming/past appointments and agency information for booking.

## Transport

- **Layer:** HTTPS (TLS 1.2+)
- **Base URL:** `https://rest.arbeitsagentur.de/portal/ota-service/pd/v1/`
- **Auth:** OAuth2 Bearer Token (client_id: `ota-online`)
- **Format:** JSON
- **CORS:** Origin `https://web.arbeitsagentur.de`

## Authentication Flow

```
[Browser] --PKCE Auth Code--> [Keycloak: ota-online]
[Keycloak] --Access Token (240s) + Refresh Token (3600s)--> [Browser]
[Browser] --Authorization: Bearer {token}--> [ota-service API]
```

## Endpoints

### GET /appointments

List all appointments (upcoming and past).

**Request:**
```http
GET /portal/ota-service/pd/v1/appointments HTTP/1.1
Host: rest.arbeitsagentur.de
Authorization: Bearer {access_token}
Accept: application/json, text/plain, */*
```

**Response (200):**
```json
{
  "pastAppointments": [Appointment],
  "upcomingAppointments": [Appointment]
}
```

### GET /upcoming/appointment

Get only the next upcoming appointment (for dashboard widget).

**Request:**
```http
GET /portal/ota-service/pd/v1/upcoming/appointment HTTP/1.1
Host: rest.arbeitsagentur.de
Authorization: Bearer {access_token}
Content-Type: application/json
```

**Response (200):**
```json
{
  "subject": "Vermittlungsgespräch",
  "contactType": "VIDEO",
  "date": "2026-05-18",
  "responsible": "<BETREUER_NAME>",
  "startTime": "09:00"
}
```

### POST /markasread

Mark appointment(s) as read (removes "new" badge).

**Request:**
```http
POST /portal/ota-service/pd/v1/markasread HTTP/1.1
Host: rest.arbeitsagentur.de
Authorization: Bearer {access_token}
Content-Type: application/json

{}
```

**Response:** 200 (empty body)

## Data Structures

### Appointment

| Field | Type | Nullable | Description |
|---|---|---|---|
| `subject` | string | no | Type of appointment ("Vermittlungsgespräch", "Beratungstermin", etc.) |
| `weekday` | string | no | German weekday name ("Montag", "Dienstag", ...) |
| `date` | string (ISO date) | no | Date in `YYYY-MM-DD` format |
| `startTime` | string | no | Start time `HH:MM` |
| `endTime` | string | no | End time `HH:MM` |
| `agentur` | Agency | no | Office/agency details |
| `responsible` | string | yes | Name of advisor/caseworker |
| `location` | Location | yes | Physical location details |
| `shortly` | boolean | no | `true` = appointment is imminent (badge "In Kürze") |
| `legalStatement` | boolean | no | `true` = legally binding appointment (Meldetermin) |
| `contactType` | enum | no | `"VIDEO"` \| `"PERSOENLICH"` \| `"TELEFON"` |
| `videoUrl` | string | yes | Direct join URL for video appointments |
| `wasCanceled` | boolean | no | `true` = appointment was canceled |
| `online` | boolean | no | Whether appointment was booked online |
| `shiftUrl` | string | yes | URL to reschedule (null = not allowed) |
| `cancelUrl` | string | yes | URL to cancel (null = not allowed) |

### Agency

| Field | Type | Description |
|---|---|---|
| `name` | string | Full agency name |
| `street` | string | Street name |
| `housenumber` | string | House number |
| `plz` | string | Postal code (5 digits) |
| `city` | string | City name |

### Location

| Field | Type | Description |
|---|---|---|
| `description` | string | Room number or location description |
| `dienstelleNummer` | string | 5-digit office number |

## Related Service: OTV Agency Access

### GET /access/agencies (otv-service)

**Base URL:** `https://rest.arbeitsagentur.de/portal/otv-service/pd/v1/`

Returns the user's assigned agencies for both legal domains.

**Response (200):**
```json
{
  "sgb2": {
    "generalEntryUrl": "https://web.arbeitsagentur.de/portal/terminvereinbarung/pc/jobcenter/anliegenauswahl",
    "agency": Agency
  },
  "sgb3": {
    "generalEntryUrl": "https://web.arbeitsagentur.de/portal/terminvereinbarung/pc/agenturen/anliegenauswahl",
    "agency": Agency & { "agencyNumber": string }
  }
}
```

## State Machine

```
[NO_APPOINTMENTS] --appointment created by advisor--> [UPCOMING]
[UPCOMING] --date passes--> [PAST]
[UPCOMING] --cancelUrl used--> [CANCELED]
[UPCOMING] --shiftUrl used--> [RESCHEDULED] --new date--> [UPCOMING]
```

## Protocol Observations

- **Read-only API**: No endpoints to create/cancel/shift appointments via REST (only URLs for browser redirect)
- **No pagination**: All appointments returned in single response
- **No filtering**: Past vs. upcoming is server-split, not client-filtered
- **VideoUrl pattern**: `https://vk.arbeitsagentur.de/vkid/{shortId}?d={dienststelleNr}`
- **`shortly` flag**: Server-calculated, likely based on proximity to current time (< 24h?)
- **`legalStatement`**: Marks appointments where absence has legal consequences (Sanktionen)
