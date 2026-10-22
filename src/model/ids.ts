let fallbackCounter = 0

/** Stable enough ID generator for local projects; UUIDs when the platform provides them. */
export function newId(prefix = 'id'): string {
  const cryptoApi = globalThis.crypto
  if (cryptoApi && typeof cryptoApi.randomUUID === 'function') {
    return `${prefix}_${cryptoApi.randomUUID()}`
  }
  fallbackCounter += 1
  return `${prefix}_${Date.now().toString(36)}_${fallbackCounter.toString(36)}_${Math.random()
    .toString(36)
    .slice(2, 8)}`
}
