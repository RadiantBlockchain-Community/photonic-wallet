import { scrypt } from "@noble/hashes/scrypt";
import { keccak_256 } from "@noble/hashes/sha3";
import { randomBytes, concatBytes } from "@noble/hashes/utils";

const { crypto } = globalThis;
const { subtle } = crypto;

export type EncryptedData = {
  ciphertext: ArrayBuffer | Uint8Array;
  salt: Uint8Array;
  iv: Uint8Array;
  mac: Uint8Array;
};

const scryptParams = {
  dkLen: 32,
  N: 262144,
  r: 8,
  p: 1,
};

export const encrypt = async (
  data: Uint8Array,
  password: string
): Promise<EncryptedData> => {
  const salt = randomBytes(32);
  const iv = randomBytes(16);

  const derivedKey = await scrypt(
    new TextEncoder().encode(password),
    salt,
    scryptParams
  );
  const importedKey = await subtle.importKey(
    "raw",
    derivedKey.slice(0, 16),
    { name: "AES-CTR" },
    false,
    ["encrypt"]
  );
  const ciphertext = await subtle.encrypt(
    {
      name: "AES-CTR",
      counter: iv as BufferSource,
      length: 64,
    },
    importedKey,
    data as BufferSource
  );

  const concat = concatBytes(
    derivedKey.slice(16, 32),
    new Uint8Array(ciphertext)
  );

  const mac = keccak_256(concat);
  return {
    ciphertext,
    salt,
    iv,
    mac,
  };
};

export const decrypt = async (data: EncryptedData, password: string) => {
  const derivedKey = await scrypt(
    new TextEncoder().encode(password),
    data.salt,
    scryptParams
  );

  const concat = concatBytes(
    derivedKey.slice(16, 32),
    new Uint8Array(data.ciphertext)
  );
  const mac = keccak_256(concat);

  if (Buffer.compare(Buffer.from(data.mac), Buffer.from(mac)) !== 0) {
    throw new Error("Password incorrect");
  }

  const importedKey = await subtle.importKey(
    "raw",
    derivedKey.slice(0, 16),
    { name: "AES-CTR" },
    false,
    ["decrypt"]
  );

  const decrypted = await subtle.decrypt(
    {
      name: "AES-CTR",
      counter: data.iv as BufferSource,
      length: 128,
    },
    importedKey,
    data.ciphertext as BufferSource
  );

  return new Uint8Array(decrypted);
};
