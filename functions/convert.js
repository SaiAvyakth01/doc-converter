export async function onRequestPost(context) {
  const request = context.request;
  const formData = await request.formData();

  const file = formData.get("file");

  if (!file) {
    return new Response("No file uploaded", { status: 400 });
  }

  // TEMP: return same file (backend test)
  return new Response(await file.arrayBuffer(), {
    headers: {
      "Content-Type": "application/octet-stream",
      "Content-Disposition": "attachment; filename=converted-file"
    }
  });
}
