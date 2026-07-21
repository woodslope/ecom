export interface StableIdSources {
  crypto?: Pick<Crypto, "randomUUID">;
  now?: () => number;
  random?: () => number;
}

let fallbackSequence = 0;

export function createStableId(prefix: string, sources: StableIdSources = {}): string {
  const cryptoSource = "crypto" in sources ? sources.crypto : globalThis.crypto;
  let uuid: string | undefined;
  try {
    uuid = cryptoSource?.randomUUID?.();
  } catch {
    uuid = undefined;
  }

  if (uuid) {
    return `${prefix}_${uuid}`;
  }

  const now = sources.now ?? Date.now;
  const random = sources.random ?? Math.random;
  fallbackSequence = (fallbackSequence + 1) % Number.MAX_SAFE_INTEGER;

  const timePart = now().toString(36);
  const randomPart = Math.floor(random() * 0x1_0000_0000)
    .toString(36)
    .padStart(7, "0");
  const sequencePart = fallbackSequence.toString(36).padStart(2, "0");

  return `${prefix}_${timePart}_${randomPart}_${sequencePart}`;
}
