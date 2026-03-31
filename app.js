const dropZone = document.getElementById("dropZone");
const fileInput = document.getElementById("fileInput");
const browseBtn = document.getElementById("browseBtn");
const removeFileBtn = document.getElementById("removeFile");
const fileMeta = document.getElementById("fileMeta");
const fileNameEl = document.getElementById("fileName");

const toFormat = document.getElementById("toFormat");
const convertBtn = document.getElementById("convertBtn");
const statusEl = document.getElementById("status");

const overlay = document.getElementById("overlay");
const progressWrap = document.getElementById("progressWrap");

let currentFile = null;

function setStatus(msg) {
  statusEl.textContent = msg;
}

function showOverlay(show) {
  overlay.classList.toggle("hidden", !show);
  progressWrap.classList.toggle("hidden", !show);
  convertBtn.disabled = show;
}

function setFile(file) {
  currentFile = file;
  if (file) {
    fileNameEl.textContent = `${file.name} (${formatBytes(file.size)})`;
    fileMeta.classList.remove("hidden");
    setStatus("File ready ✅");
  } else {
    fileNameEl.textContent = "—";
    fileMeta.classList.add("hidden");
    setStatus("Ready 🚀");
  }
}

function formatBytes(bytes) {
  if (!bytes && bytes !== 0) return "";
  const units = ["B","KB","MB","GB"];
  let i = 0;
  let num = bytes;
  while (num >= 1024 && i < units.length - 1) { num /= 1024; i++; }
  return `${num.toFixed(num < 10 && i > 0 ? 1 : 0)} ${units[i]}`;
}

/* ---------- Drag & Drop ---------- */
["dragenter","dragover"].forEach(evt => {
  dropZone.addEventListener(evt, (e) => {
    e.preventDefault();
    e.stopPropagation();
    dropZone.classList.add("dragover");
  });
});

["dragleave","drop"].forEach(evt => {
  dropZone.addEventListener(evt, (e) => {
    e.preventDefault();
    e.stopPropagation();
    dropZone.classList.remove("dragover");
  });
});

dropZone.addEventListener("drop", (e) => {
  const file = e.dataTransfer?.files?.[0];
  if (file) {
    // keep input in sync (optional)
    try { fileInput.files = e.dataTransfer.files; } catch {}
    setFile(file);
  }
});

fileInput.addEventListener("change", () => {
  const file = fileInput.files?.[0];
  if (file) setFile(file);
});

browseBtn.addEventListener("click", () => fileInput.click());

removeFileBtn.addEventListener("click", () => {
  fileInput.value = "";
  setFile(null);
});

/* ---------- Convert (REAL WORKING) ---------- */
convertBtn.addEventListener("click", async () => {
  const file = currentFile || fileInput.files?.[0];
  const to = toFormat.value;

  if (!file) {
    setStatus("Please choose a file first.");
    return;
  }

  // Soft limit suggestion for smoother UX
  // (You can change/remove this)
  if (file.size > 25 * 1024 * 1024) {
    setStatus("File too large for demo (try under 25MB).");
    return;
  }

  try {
    setStatus("Uploading & converting… ⏳");
    showOverlay(true);

    const fd = new FormData();
    fd.append("file", file);
    fd.append("to", to);

    // Calls your Cloudflare Pages Function:
    // functions/api/convert.js -> /api/convert 【1-142161】【2-9a3b2f】
    const res = await fetch("/api/convert", {
      method: "POST",
      body: fd
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(err || "Conversion failed");
    }

    const blob = await res.blob();

    // Try to use filename from Content-Disposition
    const cd = res.headers.get("Content-Disposition") || "";
    const match = cd.match(/filename="([^"]+)"/);
    const filename = match ? match[1] : `converted.${to}`;

    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);

    setStatus("Done! Download started ✅");
  } catch (e) {
    setStatus("Error: " + (e?.message || "Something went wrong"));
  } finally {
    showOverlay(false);
  }
});

/* ---------- Optional PWA SW registration ---------- */
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("/sw.js").catch(() => {});
}
