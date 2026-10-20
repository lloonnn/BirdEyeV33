// Invented data for the prototype.
// ISO 8601 with the +08:00 offset, as the contract's examples use.
export function malaysiaIso(ms: number): string {
  return new Date(ms + 8 * 60 * 60 * 1000).toISOString().replace(/\.\d{3}Z$/, "+08:00")
}
