// Explicit timeZone — dates here render server-side (Server Components),
// and the server's default TZ (UTC on Vercel) isn't the user's, so it must
// not be left implicit or times silently render shifted by hours.
export function formatTaiwanDateTime(iso: string): string {
  return new Date(iso).toLocaleString("zh-TW", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Taipei",
  });
}
