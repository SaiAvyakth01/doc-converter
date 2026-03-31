export async function onRequestPost({ request, env }) {
  try {
    const apiKey = env.CLOUDCONVERT_API_KEY;
    if (!apiKey || apiKey.length < 10) {
      return new Response(
        "Server misconfigured: CLOUDCONVERT_API_KEY missing. Check /api/ping",
        { status: 500 }
      );
    }

    const formData = await request.formData();
    const file = formData.get("file");
    const toFormat = (formData.get("to") || "").toString().toLowerCase();

    if (!file || !toFormat) {
      return new Response("Missing file or target format", { status: 400 });
    }

    const inputFormat = (file.name.split(".").pop() || "").toLowerCase();

    // Allow more formats so it "just works"
    const allowed = new Set([
      "pdf","doc","docx","rtf","txt",
      "ppt","pptx","xls","xlsx",
      "png","jpg","jpeg","webp"
    ]);

    if (!allowed.has(inputFormat) || !allowed.has(toFormat)) {
      return new Response(
        `Unsupported file format. Input=${inputFormat || "unknown"} Output=${toFormat}`,
        { status: 400 }
      );
    }

    // Create job (import/upload -> convert -> export/url)
    const jobRes = await fetch("https://api.cloudconvert.com/v2/jobs", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        tasks: {
          "import-file": { operation: "import/upload" },
          "convert-file": {
            operation: "convert",
            input: "import-file",
            input_format: inputFormat,
            output_format: toFormat
          },
          "export-file": { operation: "export/url", input: "convert-file" }
        }
      })
    });

    if (!jobRes.ok) {
      const errText = await jobRes.text();
      return new Response(
        `Job creation failed (${jobRes.status}): ${errText}`,
        { status: 500 }
      );
    }

    const job = await jobRes.json();
    const importTask = job?.data?.tasks?.find(t => t.name === "import-file");
    const uploadUrl = importTask?.result?.form?.url;
    const uploadParams = importTask?.result?.form?.parameters;

    if (!uploadUrl || !uploadParams) {
      return new Response("Upload form missing from CloudConvert response", { status: 500 });
    }

    // Upload file
    const uploadForm = new FormData();
    for (const [k, v] of Object.entries(uploadParams)) uploadForm.append(k, v);
    uploadForm.append("file", file, file.name || "input");

    const upRes = await fetch(uploadUrl, { method: "POST", body: uploadForm });
    if (!upRes.ok) {
      const errText = await upRes.text();
      return new Response(`Upload failed (${upRes.status}): ${errText}`, { status: 500 });
    }

    // Poll job
    const jobId = job.data.id;
    let finalJob = null;

    for (let i = 0; i < 60; i++) {
      const pollRes = await fetch(`https://api.cloudconvert.com/v2/jobs/${jobId}`, {
        headers: { Authorization: `Bearer ${apiKey}` }
      });

      if (!pollRes.ok) {
        const errText = await pollRes.text();
        return new Response(`Polling failed (${pollRes.status}): ${errText}`, { status: 500 });
      }

      const poll = await pollRes.json();
      if (poll.data.status === "finished") { finalJob = poll; break; }
      if (poll.data.status === "error") {
        return new Response("Conversion failed (CloudConvert job error)", { status: 500 });
      }
      await new Promise(r => setTimeout(r, 1000));
    }

    if (!finalJob) {
      return new Response("Timed out waiting for conversion", { status: 504 });
    }

    const exportTask = finalJob.data.tasks.find(t => t.name === "export-file");
    const out = exportTask?.result?.files?.[0];
    if (!out?.url) return new Response("No output file returned", { status: 500 });

    const outRes = await fetch(out.url);
    if (!outRes.ok) {
      const errText = await outRes.text();
      return new Response(`Output download failed (${outRes.status}): ${errText}`, { status: 500 });
    }

    return new Response(outRes.body, {
      headers: {
        "Content-Type": outRes.headers.get("Content-Type") || "application/octet-stream",
        "Content-Disposition": `attachment; filename="${out.filename || `converted.${toFormat}`}"`,
        "Cache-Control": "no-store"
      }
    });

  } catch (e) {
    return new Response(`Server error: ${e.message}`, { status: 500 });
  }
}
