export async function onRequestPost({ request }) {
  const formData = await request.formData();
  const file = formData.get("file");

  if (!file) {
    return new Response("No file uploaded", { status: 400 });
  }

  const buffer = await file.arrayBuffer();

  return new Response(buffer, {
    headers: {
      "Content-Type": "application/octet-stream",
      "Content-Disposition": "attachment; filename=converted"
    }
  });
}
