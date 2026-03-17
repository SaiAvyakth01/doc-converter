/* ConvertHub — browser-only converter
   PDF tools: pdf-lib (merge/extract/delete/rotate)
   Image tools: Canvas (convert/resize/compress)
*/

const $ = (q) => document.querySelector(q);

const state = {
  mode: "pdf",      // "pdf" | "img"
  files: [],        // { file, id }
};

const els = {
  tabPdf: $("#tabPdf"),
  tabImg: $("#tabImg"),
  pdfTools: $("#pdfTools"),
  imgTools: $("#imgTools"),

  dropzone: $("#dropzone"),
  filePicker: $("#filePicker"),
  btnSelect: $("#btnSelect"),
  btnClear: $("#btnClear"),
  fileList: $("#fileList"),
  fileCount: $("#fileCount"),

  statusText: $("#statusText"),
  statusPill: $("#statusPill"),

  // PDF
  btnMerge: $("#btnMerge"),
  pageRanges: $("#pageRanges"),
  btnExtract: $("#btnExtract"),
  btnDeletePages: $("#btnDeletePages"),
  rotateDeg: $("#rotateDeg"),
  btnRotate: $("#btnRotate"),

  // IMG
  imgFormat: $("#imgFormat"),
  imgQuality: $("#imgQuality"),
  imgW: $("#imgW"),
  imgH: $("#imgH"),
  keepAspect: $("#keepAspect"),
  btnImgConvert: $("#btnImgConvert"),
  btnImgResize: $("#btnImgResize"),
  btnImgCompress: $("#btnImgCompress"),
};

init();
registerSW();

// ---------------- INIT ----------------
function init() {
  els.tabPdf.addEventListener("click", () => switchMode("pdf"));
  els.tabImg.addEventListener("click", () => switchMode("img"));

  els.btnSelect.addEventListener("click", () => {
    els.filePicker.accept = state.mode === "pdf" ? "application/pdf" : "image/*";
    els.filePicker.click();
  });

  els.filePicker.addEventListener("change", (e) => {
    addFiles([...e.target.files]);
    els.filePicker.value = "";
  });

  els.btnClear.addEventListener("click", clearFiles);

  // Dropzone events
  ["dragenter", "dragover"].forEach(evt =>
    els.dropzone.addEventListener(evt, (e) => {
      e.preventDefault();
      els.dropzone.classList.add("drag");
    })
  );
  ["dragleave", "drop"].forEach(evt =>
    els.dropzone.addEventListener(evt, (e) => {
      e.preventDefault();
      els.dropzone.classList.remove("drag");
    })
  );
  els.dropzone.addEventListener("drop", (e) => {
    addFiles([...e.dataTransfer.files]);
  });

  // PDF handlers
  els.btnMerge.addEventListener("click", onMerge);
  els.btnExtract.addEventListener("click", onExtract);
  els.btnDeletePages.addEventListener("click", onDeletePages);
  els.btnRotate.addEventListener("click", onRotate);

  // Image handlers
  els.btnImgConvert.addEventListener("click", onImgConvert);
  els.btnImgResize.addEventListener("click", onImgResize);
  els.btnImgCompress.addEventListener("click", onImgCompress);

  // aspect lock
  els.imgW.addEventListener("input", syncAspectFromW);
  els.imgH.addEventListener("input", syncAspectFromH);

  render();
  setStatus("Idle", "Drop files to begin.");
}

function switchMode(mode) {
  state.mode = mode;
  state.files = [];
  render();

  const isPdf = mode === "pdf";
  els.tabPdf.classList.toggle("active", isPdf);
  els.tabImg.classList.toggle("active", !isPdf);

  els.pdfTools.classList.toggle("hidden", !isPdf);
  els.imgTools.classList.toggle("hidden", isPdf);

  setStatus("Idle", isPdf ? "PDF mode: add PDF files." : "Image mode: add images.");
}

function addFiles(files) {
  const filtered = files.filter(f => {
    if (state.mode === "pdf") return f.type === "application/pdf" || f.name.toLowerCase().endsWith(".pdf");
    return f.type.startsWith("image/");
  });

  if (!filtered.length) {
    setStatus("Error", `No valid ${state.mode === "pdf" ? "PDF" : "image"} files detected.`);
    return;
  }

  filtered.forEach(file => {
    state.files.push({ file, id: crypto.randomUUID() });
  });

  render();
  setStatus("Ready", `${state.files.length} file(s) selected.`);
}

function clearFiles() {
  state.files = [];
  render();
  setStatus("Idle", "Cleared. Drop files to begin.");
}

function removeFile(id) {
  state.files = state.files.filter(x => x.id !== id);
  render();
  setStatus("Ready", `${state.files.length} file(s) selected.`);
}

function render() {
  els.fileCount.textContent = String(state.files.length);
  els.fileList.innerHTML = "";

  state.files.forEach(({ file, id }) => {
    const div = document.createElement("div");
    div.className = "fileitem";
    div.innerHTML = `
      <div class="filemeta">
        <div class="filename">${escapeHtml(file.name)}</div>
        <div class="filesub">${prettySize(file.size)} • ${file.type || "unknown"}</div>
      </div>
      <button class="xbtn" title="Remove">✕</button>
    `;
    div.querySelector(".xbtn").addEventListener("click", () => removeFile(id));
    els.fileList.appendChild(div);
  });
}

// ---------------- STATUS ----------------
function setStatus(pill, text) {
  els.statusPill.textContent = pill;
  els.statusText.textContent = text;
}

// ---------------- PDF TOOLS ----------------
function requirePdfFiles(min = 1) {
  if (state.mode !== "pdf") throw new Error("Switch to PDF mode first.");
  if (state.files.length < min) throw new Error(`Please select at least ${min} PDF file(s).`);
}

async function onMerge() {
  try {
    requirePdfFiles(2);
    setStatus("Working", "Merging PDFs…");

    const { PDFDocument } = window.PDFLib;
    const merged = await PDFDocument.create();

    for (const { file } of state.files) {
      const bytes = await file.arrayBuffer();
      const doc = await PDFDocument.load(bytes);
      const copied = await merged.copyPages(doc, doc.getPageIndices());
      copied.forEach(p => merged.addPage(p));
    }

    const outBytes = await merged.save();
    downloadBytes(outBytes, "merged.pdf", "application/pdf");
    setStatus("Done", "Merged PDF downloaded.");
  } catch (e) {
    setStatus("Error", e.message || String(e));
  }
}

async function onExtract() {
  try {
    requirePdfFiles(1);
    const ranges = els.pageRanges.value.trim();
    if (!ranges) throw new Error("Enter page ranges first (e.g., 1-3,5,9-10).");

    setStatus("Working", "Extracting pages…");
    const { PDFDocument } = window.PDFLib;

    const bytes = await state.files[0].file.arrayBuffer();
    const src = await PDFDocument.load(bytes);

    const indices = parseRangesToIndices(ranges, src.getPageCount());
    if (!indices.length) throw new Error("No valid pages found from your ranges.");

    const out = await PDFDocument.create();
    const pages = await out.copyPages(src, indices);
    pages.forEach(p => out.addPage(p));

    const outBytes = await out.save();
    downloadBytes(outBytes, "extracted-pages.pdf", "application/pdf");
    setStatus("Done", "Extracted PDF downloaded.");
  } catch (e) {
    setStatus("Error", e.message || String(e));
  }
}

async function onDeletePages() {
  try {
    requirePdfFiles(1);
    const ranges = els.pageRanges.value.trim();
    if (!ranges) throw new Error("Enter page ranges to delete (e.g., 1-2,6).");

    setStatus("Working", "Deleting pages…");
    const { PDFDocument } = window.PDFLib;

    const bytes = await state.files[0].file.arrayBuffer();
    const doc = await PDFDocument.load(bytes);

    const total = doc.getPageCount();
    const del = new Set(parseRangesToIndices(ranges, total));
    if (!del.size) throw new Error("No valid pages found from your ranges.");

    // remove from end to start to keep indices valid
    const toRemove = [...del].sort((a,b)=>b-a);
    toRemove.forEach(i => doc.removePage(i));

    const outBytes = await doc.save();
    downloadBytes(outBytes, "deleted-pages.pdf", "application/pdf");
    setStatus("Done", "Updated PDF downloaded.");
  } catch (e) {
    setStatus("Error", e.message || String(e));
  }
}

async function onRotate() {
  try {
    requirePdfFiles(1);
    const deg = Number(els.rotateDeg.value);

    setStatus("Working", `Rotating all pages by ${deg}°…`);
    const { PDFDocument, degrees } = window.PDFLib;

    const bytes = await state.files[0].file.arrayBuffer();
    const doc = await PDFDocument.load(bytes);

    doc.getPages().forEach(p => p.setRotation(degrees(deg)));

    const outBytes = await doc.save();
    downloadBytes(outBytes, `rotated-${deg}.pdf`, "application/pdf");
    setStatus("Done", "Rotated PDF downloaded.");
  } catch (e) {
    setStatus("Error", e.message || String(e));
  }
}

// Convert ranges like "1-3,5,9-10" => [0,1,2,4,8,9]
function parseRangesToIndices(input, pageCount) {
  const cleaned = input.replace(/\s+/g, "");
  const parts = cleaned.split(",").filter(Boolean);
  const indices = [];

  for (const part of parts) {
    if (/^\d+$/.test(part)) {
      const n = Number(part);
      if (n >= 1 && n <= pageCount) indices.push(n - 1);
      continue;
    }
    if (/^\d+-\d+$/.test(part)) {
      let [a, b] = part.split("-").map(Number);
      if (a > b) [a, b] = [b, a];
      a = Math.max(1, a);
      b = Math.min(pageCount, b);
      for (let i = a; i <= b; i++) indices.push(i - 1);
      continue;
    }
  }
  // unique + sorted
  return [...new Set(indices)].sort((x, y) => x - y);
}

// ---------------- IMAGE TOOLS ----------------
function requireImgFiles(min = 1) {
  if (state.mode !== "img") throw new Error("Switch to Image mode first.");
  if (state.files.length < min) throw new Error(`Please select at least ${min} image file(s).`);
}

async function onImgConvert() {
  try {
    requireImgFiles(1);
    const mime = els.imgFormat.value;
    const q = clamp(Number(els.imgQuality.value || 85) / 100, 0.01, 1);

    setStatus("Working", "Converting images…");

    for (const { file } of state.files) {
      const outBlob = await canvasTransform(file, { mime, quality: q });
      const ext = mime === "image/png" ? "png" : (mime === "image/webp" ? "webp" : "jpg");
      downloadBlob(outBlob, `${baseName(file.name)}.${ext}`);
    }

    setStatus("Done", "Converted image(s) downloaded.");
  } catch (e) {
    setStatus("Error", e.message || String(e));
  }
}

async function onImgResize() {
  try {
    requireImgFiles(1);
    const w = Number(els.imgW.value || 0);
    const h = Number(els.imgH.value || 0);
    if (!w && !h) throw new Error("Enter width or height.");

    const mime = els.imgFormat.value;
    const q = clamp(Number(els.imgQuality.value || 85) / 100, 0.01, 1);

    setStatus("Working", "Resizing images…");

    for (const { file } of state.files) {
      const img = await fileToImage(file);
      let targetW = w, targetH = h;

      if (els.keepAspect.checked) {
        const ratio = img.width / img.height;
        if (targetW && !targetH) targetH = Math.round(targetW / ratio);
        if (!targetW && targetH) targetW = Math.round(targetH * ratio);
      }

      const outBlob = await canvasTransform(file, { mime, quality: q, width: targetW, height: targetH });
      const ext = mime === "image/png" ? "png" : (mime === "image/webp" ? "webp" : "jpg");
      downloadBlob(outBlob, `${baseName(file.name)}-${targetW}x${targetH}.${ext}`);
    }

    setStatus("Done", "Resized image(s) downloaded.");
  } catch (e) {
    setStatus("Error", e.message || String(e));
  }
}

async function onImgCompress() {
  try {
    requireImgFiles(1);
    const mime = els.imgFormat.value;
    const q = clamp(Number(els.imgQuality.value || 85) / 100, 0.01, 1);

    setStatus("Working", "Compressing images…");

    for (const { file } of state.files) {
      const outBlob = await canvasTransform(file, { mime, quality: q });
      const ext = mime === "image/png" ? "png" : (mime === "image/webp" ? "webp" : "jpg");
      downloadBlob(outBlob, `${baseName(file.name)}-compressed.${ext}`);
    }

    setStatus("Done", "Compressed image(s) downloaded.");
  } catch (e) {
    setStatus("Error", e.message || String(e));
  }
}

async function canvasTransform(file, { mime, quality, width, height }) {
  const img = await fileToImage(file);

  const outW = width || img.width;
  const outH = height || img.height;

  const canvas = document.createElement("canvas");
  canvas.width = outW;
  canvas.height = outH;

  const ctx = canvas.getContext("2d");
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(img, 0, 0, outW, outH);

  return await new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), mime, quality);
  });
}

async function fileToImage(file) {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.decoding = "async";
    img.loading = "eager";
    await new Promise((res, rej) => {
      img.onload = () => res();
      img.onerror = () => rej(new Error("Failed to decode image."));
      img.src = url;
    });
    return img;
  } finally {
    // Keep url alive until image is loaded; revoke later:
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}

function syncAspectFromW() {
  if (!els.keepAspect.checked) return;
  if (!state.files.length) return;
  // Use first image as reference
  const f = state.files[0].file;
  if (!f.type.startsWith("image/")) return;
  fileToImage(f).then(img => {
    const w = Number(els.imgW.value || 0);
    if (!w) return;
    const h = Math.round(w * (img.height / img.width));
    els.imgH.value = String(h);
  }).catch(()=>{});
}
function syncAspectFromH() {
  if (!els.keepAspect.checked) return;
  if (!state.files.length) return;
  const f = state.files[0].file;
  if (!f.type.startsWith("image/")) return;
  fileToImage(f).then(img => {
    const h = Number(els.imgH.value || 0);
    if (!h) return;
    const w = Math.round(h * (img.width / img.height));
    els.imgW.value = String(w);
  }).catch(()=>{});
}

// ---------------- DOWNLOAD HELPERS ----------------
function downloadBytes(uint8, name, mime) {
  const blob = new Blob([uint8], { type: mime });
  downloadBlob(blob, name);
}
function downloadBlob(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// ---------------- UTILS ----------------
function prettySize(bytes) {
  const u = ["B","KB","MB","GB"];
  let i=0, n=bytes;
  while (n >= 1024 && i < u.length-1) { n/=1024; i++; }
  return `${n.toFixed(i===0?0:1)} ${u[i]}`;
}
function baseName(name) {
  return name.replace(/\.[^.]+$/, "");
}
function clamp(n, a, b) { return Math.max(a, Math.min(b, n)); }
function escapeHtml(s) {
  return s.replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

// ---------------- PWA/SW ----------------
function registerSW() {
  if (!("serviceWorker" in navigator)) return;
  window.addEventListener("load", async () => {
    try {
      await navigator.serviceWorker.register("./sw.js");
    } catch (_) {}
  });
}
