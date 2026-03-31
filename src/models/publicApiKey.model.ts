export interface PublicApiKey {
  id: string;
  userId: string;
  name: string;
  keyHash: string;
  keyPrefix: string;
  permissions: string;
  lastUsedAt: Date | null;
  createdAt: Date;
  revokedAt: Date | null;
}

/** Client-safe representation — never exposes keyHash */
export interface PublicApiKeyResponse {
  id: string;
  name: string;
  keyPrefix: string;
  permissions: string[];
  lastUsedAt: Date | null;
  createdAt: Date;
  revokedAt: Date | null;
}

/** Returned once on creation — contains the full plaintext key */
export interface PublicApiKeyCreatedResponse {
  id: string;
  name: string;
  keyPrefix: string;
  key: string; // full plaintext key — shown ONCE
}
