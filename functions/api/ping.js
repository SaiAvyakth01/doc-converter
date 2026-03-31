export async function onRequestGet({ env }) {
  const key = env.CLOUDCONVERT_API_KEY;

  // Don't expose the key. Just confirm it exists and looks right.
  const exists = !!key && key.length > 10;
  const masked = exists
    ? `${key.slice(0, 4)}...${key.slice(-4)} (len=${key.length})`
    : "MISSING";

  return new Response(
    JSON.stringify({
      ok: true,
      cloudconvertKeyPresent: exists,
      cloudconvertKeyMasked: masked
    }, null, 2),
    { headers: { "Content-Type": "application/json" } }
  );
}
