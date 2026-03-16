function arrayBufferToBase64(buffer) {
  // Safe chunked conversion to avoid call stack issues on bigger files
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

function getMimeForExt(ext) {
  const map = {
    pdf:  "application/pdf",
    docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation"
  };
  return map[ext] || "application/octet-stream";
}

export async function onRequestPost({ request, env }) {
  try {
    const CONVERTAGENT_URL = env.CONVERTAGENT_URL;
    if (!CONVERTAGENT_URL) {
      return new Response(
        "Server is not configured. Missing CONVERTAGENT_URL environment variable.",
        { status: 500 }
      );
    }

    const formData = await request.formData();
    const file = formData.get("file");
    const outFormat = (formData.get("format") || "").toString().toLowerCase();

    if (!file) {
      return new Response("No file uploaded. Please select a file and try again.", { status: 400 });
    }

    const name = file.name || "document";
    const inExt = (name.split(".").pop() || "").toLowerCase();

    const allowedExt = new Set(["pdf", "docx", "pptx"]);
    if (!allowedExt.has(inExt)) {
      return new Response("Unsupported input file. Please upload PDF, DOCX, or PPTX.", { status: 400 });
    }
    if (!allowedExt.has(outFormat)) {
      return new Response("Unsupported output format. Please choose PDF, DOCX, or PPTX.", { status: 400 });
    }

    // IMPORTANT: ConvertAgent supports these pairs (from its README):
    // pdf→docx, docx→pdf, pptx→pdf (and more, but we are keeping to your scope)
    const action = `${inExt}-to-${outFormat}`;
    const supported = new Set(["pdf-to-docx", "docx-to-pdf", "pptx-to-pdf"]);
    if (!supported.has(action)) {
      return new Response(
        `Conversion not supported in free mode: ${action}. Supported: pdf→docx, docx→pdf, pptx→pdf.`,
        { status: 400 }
      );
    }

    const inputBytes = await file.arrayBuffer();
    const b64 = arrayBufferToBase64(inputBytes);
    const mime = getMimeForExt(inExt);

    // ConvertAgent API: POST /v1/convert with source_base64
    // Example format is shown in their README. [2](https://github.com/vid-factory/convertagent)
    const payload = {
      action,
      source_base64: `data:${mime};base64,${b64}`,
      options: {}
    };

    const convertResp = await fetch(`${CONVERTAGENT_URL}/v1/convert`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    if (!convertResp.ok) {
      const msg = await convertResp.text().catch(() => "");
      return new Response(msg || `ConvertAgent error: ${convertResp.status}`, { status: 502 });
    }

    const result = await convertResp.json();

    if (!result?.success || !result?.artifact?.url) {
      return new Response("Conversion failed: invalid response from ConvertAgent.", { status: 502 });
    }

    // Download artifact from ConvertAgent (artifact.url is like /v1/artifacts/<job_id>) [2](https://github.com/vid-factory/convertagent)
    const artifactUrl = `${CONVERTAGENT_URL}${result.artifact.url}`;
    const fileResp = await fetch(artifactUrl);

    if (!fileResp.ok) {
      return new Response("Conversion succeeded but output download failed.", { status: 502 });
    }

    const outBytes = await fileResp.arrayBuffer();
    const base = name.includes(".") ? name.slice(0, name.lastIndexOf(".")) : name;
    const outName = `${base}.${outFormat}`;

    return new Response(outBytes, {
      headers: {
        "Content-Type": "application/octet-stream",
        "Content-Disposition": `attachment; filename="${outName}"`
      }
    });

  } catch (e) {
    return new Response("Unexpected error while converting the file.", { status: 500 });
  }
}
