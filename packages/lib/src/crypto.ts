/**
 * Glyph v2 Encrypted Content Support
 * Reference: Glyph v2 Token Standard Section 16
 */

import { randomBytes } from "@noble/hashes/utils";
import { sha256 } from "@noble/hashes/sha256";
import { bytesToHex, hexToBytes } from "@noble/hashes/utils";

/** Extract a plain ArrayBuffer from a Uint8Array (TS 5.9 BufferSource compat) */
function toAB(u: Uint8Array): ArrayBuffer {
  const ab = new ArrayBuffer(u.byteLength);
  new Uint8Array(ab).set(u);
  return ab;
}

/**
 * Encrypted content structure
 */
export type EncryptedContent = {
  algorithm: "aes-256-gcm" | "chacha20-poly1305";
  ciphertext: Uint8Array;
  nonce: Uint8Array;
  tag: Uint8Array;
  salt?: Uint8Array; // For password-based encryption
};

/**
 * Encrypt content using AES-256-GCM
 * Uses Web Crypto API for browser compatibility
 */
export async function encryptContentAES(
  content: Uint8Array,
  key: Uint8Array
): Promise<EncryptedContent> {
  if (key.length !== 32) {
    throw new Error("Key must be 32 bytes for AES-256");
  }

  const nonce = randomBytes(12); // 96-bit nonce for GCM

  // Import key
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    toAB(key),
    { name: "AES-GCM" },
    false,
    ["encrypt"]
  );

  // Encrypt
  const encrypted = await crypto.subtle.encrypt(
    {
      name: "AES-GCM",
      iv: toAB(nonce),
      tagLength: 128, // 16 bytes
    },
    cryptoKey,
    toAB(content)
  );

  // Split ciphertext and tag
  const encryptedArray = new Uint8Array(encrypted);
  const ciphertext = encryptedArray.slice(0, -16);
  const tag = encryptedArray.slice(-16);

  return {
    algorithm: "aes-256-gcm",
    ciphertext,
    nonce,
    tag,
  };
}

/**
 * Decrypt content using AES-256-GCM
 */
export async function decryptContentAES(
  encrypted: EncryptedContent,
  key: Uint8Array
): Promise<Uint8Array> {
  if (key.length !== 32) {
    throw new Error("Key must be 32 bytes for AES-256");
  }

  if (encrypted.algorithm !== "aes-256-gcm") {
    throw new Error("Invalid algorithm for AES decryption");
  }

  // Import key
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    toAB(key),
    { name: "AES-GCM" },
    false,
    ["decrypt"]
  );

  // Combine ciphertext and tag
  const combined = new Uint8Array(encrypted.ciphertext.length + encrypted.tag.length);
  combined.set(encrypted.ciphertext);
  combined.set(encrypted.tag, encrypted.ciphertext.length);

  // Decrypt
  try {
    const decrypted = await crypto.subtle.decrypt(
      {
        name: "AES-GCM",
        iv: toAB(encrypted.nonce),
        tagLength: 128,
      },
      cryptoKey,
      combined
    );

    return new Uint8Array(decrypted);
  } catch (error) {
    throw new Error(`Decryption failed: ${error}`);
  }
}

/**
 * Derive encryption key from password using PBKDF2
 */
export async function deriveKeyFromPassword(
  password: string,
  salt?: Uint8Array,
  iterations: number = 100000
): Promise<{ key: Uint8Array; salt: Uint8Array }> {
  const usedSalt = salt || randomBytes(32);
  const passwordBuffer = new TextEncoder().encode(password);

  // Import password
  const passwordKey = await crypto.subtle.importKey(
    "raw",
    passwordBuffer,
    { name: "PBKDF2" },
    false,
    ["deriveBits"]
  );

  // Derive key
  const derivedBits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      salt: toAB(usedSalt),
      iterations,
      hash: "SHA-256",
    },
    passwordKey,
    256 // 32 bytes
  );

  return {
    key: new Uint8Array(derivedBits),
    salt: usedSalt,
  };
}

/**
 * Encrypt content with password
 */
export async function encryptWithPassword(
  content: Uint8Array,
  password: string
): Promise<EncryptedContent> {
  const { key, salt } = await deriveKeyFromPassword(password);
  const encrypted = await encryptContentAES(content, key);

  return {
    ...encrypted,
    salt,
  };
}

/**
 * Decrypt content with password
 */
export async function decryptWithPassword(
  encrypted: EncryptedContent,
  password: string
): Promise<Uint8Array> {
  if (!encrypted.salt) {
    throw new Error("Salt is required for password-based decryption");
  }

  const { key } = await deriveKeyFromPassword(password, encrypted.salt);
  return decryptContentAES(encrypted, key);
}

/**
 * Generate random encryption key
 */
export function generateEncryptionKey(): Uint8Array {
  return randomBytes(32); // 256 bits
}

/**
 * Encrypt content for public key (ECIES-like)
 * Simplified version using shared secret
 */
export async function encryptForPublicKey(
  content: Uint8Array,
  recipientPublicKey: string
): Promise<{ encrypted: EncryptedContent; ephemeralPublicKey: string }> {
  // Generate ephemeral key pair
  const ephemeralKeyPair = await crypto.subtle.generateKey(
    {
      name: "ECDH",
      namedCurve: "P-256",
    },
    true,
    ["deriveBits"]
  );

  // Export ephemeral public key
  const ephemeralPublicKeyRaw = await crypto.subtle.exportKey(
    "raw",
    ephemeralKeyPair.publicKey
  );
  const ephemeralPublicKey = bytesToHex(new Uint8Array(ephemeralPublicKeyRaw));

  // Import recipient public key
  const recipientKey = await crypto.subtle.importKey(
    "raw",
    toAB(hexToBytes(recipientPublicKey)),
    {
      name: "ECDH",
      namedCurve: "P-256",
    },
    false,
    []
  );

  // Derive shared secret
  const sharedSecret = await crypto.subtle.deriveBits(
    {
      name: "ECDH",
      public: recipientKey,
    },
    ephemeralKeyPair.privateKey,
    256
  );

  // Use shared secret as encryption key
  const encryptionKey = new Uint8Array(sha256(new Uint8Array(sharedSecret)));
  const encrypted = await encryptContentAES(content, encryptionKey);

  return {
    encrypted,
    ephemeralPublicKey,
  };
}

/**
 * Decrypt content with private key
 */
export async function decryptWithPrivateKey(
  encrypted: EncryptedContent,
  ephemeralPublicKey: string,
  privateKey: CryptoKey
): Promise<Uint8Array> {
  // Import ephemeral public key
  const ephemeralKey = await crypto.subtle.importKey(
    "raw",
    toAB(hexToBytes(ephemeralPublicKey)),
    {
      name: "ECDH",
      namedCurve: "P-256",
    },
    false,
    []
  );

  // Derive shared secret
  const sharedSecret = await crypto.subtle.deriveBits(
    {
      name: "ECDH",
      public: ephemeralKey,
    },
    privateKey,
    256
  );

  // Use shared secret as decryption key
  const decryptionKey = new Uint8Array(sha256(new Uint8Array(sharedSecret)));
  return decryptContentAES(encrypted, decryptionKey);
}

/**
 * Encode encrypted content to CBOR-compatible format
 */
export function encodeEncryptedContent(encrypted: EncryptedContent): {
  algo: string;
  ct: Uint8Array;
  nonce: Uint8Array;
  tag: Uint8Array;
  salt?: Uint8Array;
} {
  return {
    algo: encrypted.algorithm,
    ct: encrypted.ciphertext,
    nonce: encrypted.nonce,
    tag: encrypted.tag,
    ...(encrypted.salt && { salt: encrypted.salt }),
  };
}

/**
 * Decode encrypted content from CBOR format
 */
export function decodeEncryptedContent(encoded: {
  algo: string;
  ct: Uint8Array;
  nonce: Uint8Array;
  tag: Uint8Array;
  salt?: Uint8Array;
}): EncryptedContent {
  return {
    algorithm: encoded.algo as "aes-256-gcm" | "chacha20-poly1305",
    ciphertext: encoded.ct,
    nonce: encoded.nonce,
    tag: encoded.tag,
    salt: encoded.salt,
  };
}
