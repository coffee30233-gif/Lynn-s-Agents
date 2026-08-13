export function MapEmbed({ query }: { query: string }) {
  const key = process.env.NEXT_PUBLIC_GOOGLE_MAPS_EMBED_KEY;
  if (!key) return null;

  const src = `https://www.google.com/maps/embed/v1/search?key=${key}&q=${encodeURIComponent(query)}`;

  return (
    <iframe
      src={src}
      width="100%"
      height="220"
      style={{ border: 0 }}
      loading="lazy"
      referrerPolicy="no-referrer-when-downgrade"
      className="rounded-lg"
    />
  );
}
