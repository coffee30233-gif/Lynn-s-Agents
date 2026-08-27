// Shared between the client (uploading segments) and the server
// (process/route.ts, downloading them back in order) — no server-only
// dependency, safe to import from either side.
export function segmentFolderName(index: number): string {
  return `segment-${String(index).padStart(4, "0")}`;
}
