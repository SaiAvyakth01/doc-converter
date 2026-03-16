export async function onRequestPost(context) {
  try {
    const formData = await context.request.formData();
    const file = formData.get("file");
    const format = (formData.get("format") || "").toString().toLowerCase();

    if (!file) {
      return new Response("No file uploaded. Please select a file and try again.", { status: 400 });
    }

    const allowed = new Set(["pdf", "docx", "pptx"]);
    if (!allowed.has(format)) {
      return new Response("Unsupported output format. Please choose PDF, DOCX, or PPTX.", { status: 400 });
    }

    // TEMP: backend test — returns the same file.
    // Later we will plug real conversion here.
    const originalName = (file.name || "document").replace(/[^\w.\- ]+/g, "_");
    const base = originalName.includes(".") ? originalName.slice(0, originalName.lastIndexOf(".")) : originalName;
    const outName = `${base}.${format}`;

    return new Response(await file.arrayBuffer(), {
      headers: {
        "Content-Type": "application/octet-stream",
        "Content-Disposition": `attachment; filename="${outName}"`
      }
    });
  } catch (e) {
    return new Response("Unexpected error while processing the file.", { status: 500 });
  }
}
