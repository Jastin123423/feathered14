// functions/api/users/_password.ts
//
// PBKDF2 password hashing for Cloudflare Workers.
// Stored format: pbkdf2$<saltHex>$<hashHex>

const hex = (arr: Uint8Array) =>
  Array.from(arr)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

const hexToBytes = (hexStr: string): Uint8Array => {
  const matches = hexStr.match(/.{2}/g);
  if (!matches) return new Uint8Array(0);
  return new Uint8Array(matches.map((b) => parseInt(b, 16)));
};

export const hashPassword = async (password: string): Promise<string> => {
  const enc = new TextEncoder();

  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    enc.encode(password),
    "PBKDF2",
    false,
    ["deriveBits"]
  );

  const salt = crypto.getRandomValues(new Uint8Array(16));

  const bits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      salt,
      iterations: 100_000,
      hash: "SHA-256",
    },
    keyMaterial,
    256
  );

  return `pbkdf2$${hex(salt)}$${hex(new Uint8Array(bits))}`;
};

export const verifyPassword = async (
  password: string,
  stored: string
): Promise<boolean> => {
  try {
    const parts = String(stored || "").split("$");
    if (parts.length !== 3) return false;

    const [scheme, saltHex, hashHex] = parts;
    if (scheme !== "pbkdf2" || !saltHex || !hashHex) return false;

    const salt = hexToBytes(saltHex);
    const enc = new TextEncoder();

    const keyMaterial = await crypto.subtle.importKey(
      "raw",
      enc.encode(password),
      "PBKDF2",
      false,
      ["deriveBits"]
    );

    const bits = await crypto.subtle.deriveBits(
      {
        name: "PBKDF2",
        salt,
        iterations: 100_000,
        hash: "SHA-256",
      },
      keyMaterial,
      256
    );

    const computed = hex(new Uint8Array(bits));
    return computed === hashHex;
  } catch {
    return false;
  }
};
