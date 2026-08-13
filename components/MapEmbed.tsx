export function MapEmbed({
  query,
  mode = "search",
  height = 220,
}: {
  query: string;
  /** "place" pins exactly this one location clearly — for marking the
   * activity's own venue. "search" shows multiple result pins — for
   * browsing nearby restaurants/parking. */
  mode?: "place" | "search";
  height?: number;
}) {
  const key = process.env.NEXT_PUBLIC_GOOGLE_MAPS_EMBED_KEY;
  if (!key) return null;

  const src = `https://www.google.com/maps/embed/v1/${mode}?key=${key}&q=${encodeURIComponent(query)}`;

  return (
    <iframe
      src={src}
      width="100%"
      height={height}
      style={{ border: 0 }}
      loading="lazy"
      referrerPolicy="no-referrer-when-downgrade"
      className="rounded-lg"
    />
  );
}
