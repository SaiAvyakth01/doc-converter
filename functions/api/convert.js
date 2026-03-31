export async function onRequestPost({ request, env }) {
  try {
    // 1. Read form data
    const formData = await request.formData();
    const file = formData.get("file");
    const toFormat = formData.get("to");

    if (!file || !toFormat) {
      return new Response("File or format missing", { status: 400 });
    }

    // 2. Detect input format from filename (IMPORTANT FIX)
    const inputFormat = file.name.split(".").pop().toLowerCase();

    // Optional safety check (recommended)
    const supportedFormats = ["pdf", "docx"];
    if (!supportedFormats.includes(inputFormat) || !supportedFormats.includes(toFormat)) {
      return new Response("Unsupported file format", { status: 400 });
    }

    // 3. CREATE CONVERSION JOB (this is the "job creation section")
    const jobResponse = await fetch("https://api.cloudconvert.com/v2/jobs", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${env.CLOUDCONVERT_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        tasks: {
          "import-file": {
            operation: "import/upload"
          },
          "convert-file": {
            operation: "convert",
            input: "import-file",
            input_format: inputFormat,
            output_format: toFormat
          },
          "export-file": {
            operation: "export/url",
            input: "convert-file"
          }
        }
      })
    });

    if (!jobResponse.ok) {
      const err = await jobResponse.text();
      return new Response("Job creation failed: " + err, { status: 500 });
    }

    const jobData = await jobResponse.json();

    // 4. Upload file to CloudConvert
    const importTask = jobData.data.tasks.find(t => t.name === "import-file");
    const uploadUrl = importTask.result.form.url;
    const uploadParams = importTask.result.form.parameters;

    const uploadForm = new FormData();
    Object.entries(uploadParams).forEach(([key, value]) => {
      uploadForm.append(key, value);
    });
    uploadForm.append("file", file, file.name);

    await fetch(uploadUrl, {
      method: "POST",
      body: uploadForm
    });

    // 5. Poll until job finishes
    let finalJob;
    for (let i = 0; i < 60; i++) {
      const pollRes = await fetch(
        `https://api.cloudconvert.com/v2/jobs/${jobData.data.id}`,
        {
          headers: {
            "Authorization": `Bearer ${env.CLOUDCONVERT_API_KEY}`
          }
        }
      );

      finalJob = await pollRes.json();
      if (finalJob.data.status === "finished") break;

      if (finalJob.data.status === "error") {
        return new Response("Conversion failed on server", { status: 500 });
      }

      await new Promise(r => setTimeout(r, 1000));
    }

    // 6. Download converted file
    const exportTask = finalJob.data.tasks.find(t => t.name === "export-file");
    const outputFile = exportTask.result.files[0];

    const fileResponse = await fetch(outputFile.url);

    return new Response(fileResponse.body, {
      headers: {
        "Content-Type": "application/octet-stream",
        "Content-Disposition": `attachment; filename="${outputFile.filename}"`,
        "Cache-Control": "no-store"
      }
    });

  } catch (err) {
    return new Response("Unexpected server error: " + err.message, { status: 500 });
  }
}
