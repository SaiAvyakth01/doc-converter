// Libraries
const { PDFDocument, degrees } = PDFLib; // pdf-lib supports page operations, merge/split/delete/rotate [4](https://convertio.co/pdf-ppt/)[5](https://pages.cloudflare.com/)[3](https://sentry.io/answers/how-do-i-resolve-cannot-find-module-error-using-node-js/)
const { zipSync } = fflate; // fflate provides fast ZIP in browser [6](https://github.com/elwerene/libreoffice-convert/issues/97)[7](https://outlook.office365.com/owa/?ItemID=AAMkAGQ4NmIwMTljLTlmMDktNDgyMS1hOTA0LTUyMDY3YTIzM2NiMwBGAAAAAACzHEGInO7iR5JsH9%2b6BmmJBwDb9ROgopMBTo%2bhkPJncQOtAAAAAAEMAADb9ROgopMBTo%2bhkPJncQOtAAByjiyhAAA%3d&exvsurl=1&viewmodel=ReadMessageItem)

// State
let files = [];
let activeTab = "pdf";

// Elements
const dz = document.getElementById("dropzone");
const input = document.getElementById("fileInput");
const fileList = document.getElementById("fileList");
const fileCount = document.getElementById("fileCount");
const clearBtn = document.getElementById("clearBtn");
const hintText = document.getElementById("hintText");

const statusEl = document.getElementById("status");
const badge = document.getElementById("badge");
const spinner = document.getElementById("spinner");
const toastWrap = document.getElementById("toastWrap");

const tabs = document.querySelectorAll(".tabbtn");
const panelPdf = document.getElementById("panel-pdf");
const panelImg = document.getElementById("panel-image");

// PDF controls
const btnMerge = document.getElementById("btnMerge");
const pageRange = document.getElementById("pageRange");
const btnExtractOne = document.getElementById("btnExtractOne");
const btnSplitZip = document.getElementById("btnSplitZip");
const btnDelete = document.getElementById("btnDelete");
const rotateDeg = document.getElementById("rotateDeg");
const btnRotate = document.getElementById("btnRotate");

// Image controls
const btnImgToPdf = document.getElementById("btnImgToPdf");
const imgFormat = document.getElementById("imgFormat");
const imgQuality = document.getElementById("imgQuality");
const btnImgConvertZip = document.getElementById("btnImgConvertZip");

// Helpers
function toast(msg, type="info") {
  const colors = {
    info: "bg-white/10 border-white/20",
    success: "bg-emerald-500/20 border-emerald-400/30",
    error: "bg-rose-500/20 border-rose-400/30",
  };
  const el = document.createElement("div");
  el.className = `rounded-xl border ${colors[type]} px-4 py-3 text-sm shadow-lg backdrop-blur`;
  el.textContent = msg;
  toastWrap.appendChild(el);
  setTimeout(() => el.classList.add("opacity-0"), 2200);
  setTimeout(() => el.remove(), 2600);
}

function setBusy(text) {
  spinner.classList.remove("hidden");
  badge.textContent = "Working";
  statusEl.textContent = text;
}
function setReady(text) {
  spinner.classList.add("hidden");
  badge.textContent = "Ready";
  statusEl.textContent = text;
}
function setIdle(text="Drop files to begin.") {
  spinner.classList.add("hidden");
  badge.textContent = "Idle";
  statusEl.textContent = text;
}

function escapeHtml(s) {
  return s.replace(/[&<>"']/g, m => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[m]));
}

function isPdf(f) {
  return f.type === "application/pdf" || f.name.toLowerCase().endsWith(".pdf");
}
function isImg(f) {
  return /^image\//.test(f.type) || /\.(png|jpg|jpeg|webp)$/i.test(f.name);
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function uint8ToBlob(u8, mime) {
  return new Blob([u8], { type: mime });
}

async function loadPdf(file) {
  const bytes = await file.arrayBuffer();
  return PDFDocument.load(bytes);
}

// Range parser supports: "1-3,5", "all", "odd", "even"
function parseRanges(rangeText, maxPages) {
  const raw = (rangeText || "").trim().toLowerCase();
  if (!raw || raw === "all") return Array.from({length:maxPages}, (_,i)=>i+1);
  if (raw === "odd") return Array.from({length:maxPages}, (_,i)=>i+1).filter(n=>n%2===1);
  if (raw === "even") return Array.from({length:maxPages}, (_,i)=>i+1).filter(n=>n%2===0);

  const parts = raw.split(",").map(s=>s.trim()).filter(Boolean);
  const set = new Set();
  for (const p of parts) {
    if (p.includes("-")) {
      const [a,b] = p.split("-").map(x=>parseInt(x.trim(),10));
      if (Number.isFinite(a) && Number.isFinite(b)) {
        for (let i=Math.min(a,b); i<=Math.max(a,b); i++) set.add(i);
      }
    } else {
      const n = parseInt(p,10);
      if (Number.isFinite(n)) set.add(n);
    }
  }
  return [...set].filter(n=>n>=1 && n<=maxPages).sort((x,y)=>x-y);
}

// Convert image file to PNG bytes (supports webp/jpg/png reliably)
async function imageFileToPngBytes(file) {
  const bmp = await createImageBitmap(file);
  const canvas = document.createElement("canvas");
  canvas.width = bmp.width;
  canvas.height = bmp.height;
  const ctx = canvas.getContext("2d");
  ctx.drawImage(bmp, 0, 0);
  const blob = await new Promise(res => canvas.toBlob(res, "image/png"));
  return new Uint8Array(await blob.arrayBuffer());
}

// Convert image file to requested format (png/jpeg/webp)
async function convertImageFile(file, targetMime, quality) {
  const bmp = await createImageBitmap(file);
  const canvas = document.createElement("canvas");
  canvas.width = bmp.width;
  canvas.height = bmp.height;
  const ctx = canvas.getContext("2d");
  ctx.drawImage(bmp, 0, 0);

  const q = (targetMime === "image/jpeg" || targetMime === "image/webp")
    ? Math.max(0.4, Math.min(0.95, quality))
    : undefined;

  const blob = await new Promise(res => canvas.toBlob(res, targetMime, q));
  return new Uint8Array(await blob.arrayBuffer());
}

// ZIP pack map { "file.ext": Uint8Array }
function downloadZip(fileMap, zipName) {
  const zipped = zipSync(fileMap, { level: 6 });
  downloadBlob(uint8ToBlob(zipped, "application/zip"), zipName);
}

// UI
function setTab(tab) {
  activeTab = tab;

  tabs.forEach(b => {
    const on = b.dataset.tab === tab;
    b.className = on
      ? "tabbtn px-4 py-2 rounded-xl bg-indigo-500 hover:bg-indigo-400 font-semibold"
      : "tabbtn px-4 py-2 rounded-xl bg-white/10 hover:bg-white/15 font-semibold";
  });

  panelPdf.classList.toggle("hidden", tab !== "pdf");
  panelImg.classList.toggle("hidden", tab !== "image");

  // change file input accept for better UX
  if (tab === "pdf") {
    input.accept = "application/pdf";
    hintText.textContent = "Tip: Select PDFs. Range supports 1-3,5 or all/odd/even.";
  } else {
    input.accept = "image/png,image/jpeg,image/webp";
    hintText.textContent = "Tip: Select images (PNG/JPG/WEBP). Download ZIP output.";
  }

  refreshButtons();
}

tabs.forEach(b => b.addEventListener("click", () => setTab(b.dataset.tab)));

function renderFiles() {
  fileList.innerHTML = "";
  fileCount.textContent = String(files.length);

  files.forEach((f, idx) => {
    const badgeType = isPdf(f) ? "PDF" : (isImg(f) ? "IMG" : "OTHER");
    const badgeColor = isPdf(f) ? "bg-indigo-500/20 border-indigo-400/30" :
                      isImg(f) ? "bg-emerald-500/20 border-emerald-400/30" :
                                "bg-rose-500/20 border-rose-400/30";

    const li = document.createElement("li");
    li.className = "flex items-center justify-between gap-3 rounded-xl bg-white/5 border border-white/10 px-3 py-2";
    li.innerHTML = `
      <div class="min-w-0">
        <div class="flex items-center gap-2">
          <span class="text-[10px] px-2 py-0.5 rounded-lg border ${badgeColor}">${badgeType}</span>
          <p class="truncate font-semibold">${escapeHtml(f.name)}</p>
        </div>
        <p class="text-xs text-slate-400">${Math.round(f.size/1024)} KB</p>
      </div>
      <button class="removeBtn text-xs rounded-lg bg-white/10 hover:bg-white/15 px-3 py-1">Remove</button>
    `;
    li.querySelector(".removeBtn").addEventListener("click", () => {
      files.splice(idx, 1);
      renderFiles();
      refreshButtons();
      toast("Removed file", "info");
    });

    fileList.appendChild(li);
  });

  refreshButtons();
}

function refreshButtons() {
  const pdfs = files.filter(isPdf);
  const imgs = files.filter(isImg);

  // PDF operations require exactly 1 PDF except merge
  btnMerge.disabled = !(pdfs.length >= 2);
  btnExtractOne.disabled = !(pdfs.length === 1);
  btnSplitZip.disabled = !(pdfs.length === 1);
  btnDelete.disabled = !(pdfs.length === 1);
  btnRotate.disabled = !(pdfs.length === 1);

  // Image operations
  btnImgToPdf.disabled = !(imgs.length >= 1);
  btnImgConvertZip.disabled = !(imgs.length >= 1);
}

// Drag & drop
dz.addEventListener("dragover", e => {
  e.preventDefault();
  dz.classList.add("ring-2","ring-indigo-400/60");
});
dz.addEventListener("dragleave", () => dz.classList.remove("ring-2","ring-indigo-400/60"));
dz.addEventListener("drop", e => {
  e.preventDefault();
  dz.classList.remove("ring-2","ring-indigo-400/60");
  handleFiles([...e.dataTransfer.files]);
});

// File input
input.addEventListener("change", e => handleFiles([...e.target.files]));

// Clear
clearBtn.addEventListener("click", () => {
  files = [];
  renderFiles();
  setIdle();
});

function handleFiles(selected) {
  if (!selected.length) return;

  // keep only usable types (pdf or image)
  const cleaned = selected.filter(f => isPdf(f) || isImg(f));

  if (!cleaned.length) {
    toast("Please select PDF or image files only.", "error");
    setReady("No supported files selected.");
    return;
  }

  files = cleaned;
  renderFiles();
  setReady(`${files.length} file(s) ready. Choose a tool and convert.`);
  toast("Files added ✅", "success");
}

// ---------------- PDF: MERGE ----------------
btnMerge.addEventListener("click", async () => {
  const pdfs = files.filter(isPdf);
  if (pdfs.length < 2) return;

  setBusy("Merging PDFs...");
  try {
    const out = await PDFDocument.create();

    for (const f of pdfs) {
      const src = await loadPdf(f);
      const copied = await out.copyPages(src, src.getPageIndices());
      copied.forEach(p => out.addPage(p));
    }

    const bytes = await out.save();
    downloadBlob(uint8ToBlob(bytes, "application/pdf"), "merged.pdf");
    setIdle("Merged PDF downloaded ✅");
    toast("Merge complete ✅", "success");
  } catch (e) {
    setReady("Merge failed. Try different PDFs.");
    toast("Merge failed ❌", "error");
  }
});

// -------- PDF: EXTRACT AS ONE PDF ----------
btnExtractOne.addEventListener("click", async () => {
  const pdfs = files.filter(isPdf);
  if (pdfs.length !== 1) return;

  setBusy("Extracting pages...");
  try {
    const src = await loadPdf(pdfs[0]);
    const maxPages = src.getPageCount();
    const wanted = parseRanges(pageRange.value, maxPages);
    if (!wanted.length) { setReady("Enter a valid range."); toast("Invalid range", "error"); return; }

    const out = await PDFDocument.create();
    const indices = wanted.map(n => n - 1);
    const copied = await out.copyPages(src, indices);
    copied.forEach(p => out.addPage(p));

    const bytes = await out.save();
    downloadBlob(uint8ToBlob(bytes, "application/pdf"), "extracted.pdf");
    setIdle("Extracted PDF downloaded ✅");
    toast("Extract complete ✅", "success");
  } catch (e) {
    setReady("Extract failed.");
    toast("Extract failed ❌", "error");
  }
});

// -------- PDF: SPLIT PAGES → ZIP ----------
btnSplitZip.addEventListener("click", async () => {
  const pdfs = files.filter(isPdf);
  if (pdfs.length !== 1) return;

  setBusy("Splitting pages to ZIP...");
  try {
    const src = await loadPdf(pdfs[0]);
    const maxPages = src.getPageCount();
    const wanted = parseRanges(pageRange.value, maxPages);
    if (!wanted.length) { setReady("Enter a valid range."); toast("Invalid range", "error"); return; }

    const zipMap = {};
    for (const pg of wanted) {
      const sub = await PDFDocument.create();
      const [copied] = await sub.copyPages(src, [pg - 1]);
      sub.addPage(copied);
      const bytes = await sub.save();
      zipMap[`page-${pg}.pdf`] = bytes; // Uint8Array
    }

    downloadZip(zipMap, "split-pages.zip");
    setIdle("ZIP downloaded ✅");
    toast("Split ZIP ready ✅", "success");
  } catch (e) {
    setReady("Split failed.");
    toast("Split failed ❌", "error");
  }
});

// -------- PDF: DELETE PAGES ---------------
btnDelete.addEventListener("click", async () => {
  const pdfs = files.filter(isPdf);
  if (pdfs.length !== 1) return;

  setBusy("Deleting pages...");
  try {
    const src = await loadPdf(pdfs[0]);
    const maxPages = src.getPageCount();
    const del = parseRanges(pageRange.value, maxPages);
    if (!del.length) { setReady("Enter pages to delete."); toast("Invalid range", "error"); return; }

    // remove highest → lowest to avoid index shift issues
    del.sort((a,b)=>b-a).forEach(p => src.removePage(p - 1)); // removePage supported [4](https://convertio.co/pdf-ppt/)

    const bytes = await src.save();
    downloadBlob(uint8ToBlob(bytes, "application/pdf"), "deleted-pages.pdf");
    setIdle("Updated PDF downloaded ✅");
    toast("Delete complete ✅", "success");
  } catch (e) {
    setReady("Delete failed.");
    toast("Delete failed ❌", "error");
  }
});

// -------- PDF: ROTATE ---------------------
btnRotate.addEventListener("click", async () => {
  const pdfs = files.filter(isPdf);
  if (pdfs.length !== 1) return;

  const deg = parseInt(rotateDeg.value, 10);
  setBusy(`Rotating ${deg}°...`);
  try {
    const src = await loadPdf(pdfs[0]);
    const maxPages = src.getPageCount();
    const wanted = parseRanges(pageRange.value, maxPages); // empty => all
    const wantedSet = new Set(wanted.map(n => n - 1));

    src.getPages().forEach((p, idx) => {
      if (wantedSet.size === 0 || wantedSet.has(idx)) {
        p.setRotation(degrees(deg)); // rotation API commonly used [5](https://pages.cloudflare.com/)
      }
    });

    const bytes = await src.save();
    downloadBlob(uint8ToBlob(bytes, "application/pdf"), `rotated-${deg}.pdf`);
    setIdle("Rotated PDF downloaded ✅");
    toast("Rotate complete ✅", "success");
  } catch (e) {
    setReady("Rotate failed.");
    toast("Rotate failed ❌", "error");
  }
});

// -------- IMAGES → PDF (A4 Fit) ----------
btnImgToPdf.addEventListener("click", async () => {
  const imgs = files.filter(isImg);
  if (!imgs.length) return;

  setBusy("Creating PDF from images...");
  try {
    const pdf = await PDFDocument.create();

    // A4 in points (approx)
    const A4_W = 595;
    const A4_H = 842;

    for (const imgFile of imgs) {
      // convert any image to PNG bytes for reliable embed
      const pngBytes = await imageFileToPngBytes(imgFile);
      const img = await pdf.embedPng(pngBytes);

      const page = pdf.addPage([A4_W, A4_H]);

      // fit image into A4 with margin
      const margin = 24;
      const maxW = A4_W - margin*2;
      const maxH = A4_H - margin*2;

      const iw = img.width;
      const ih = img.height;

      const scale = Math.min(maxW/iw, maxH/ih);
      const drawW = iw * scale;
      const drawH = ih * scale;
      const x = (A4_W - drawW) / 2;
      const y = (A4_H - drawH) / 2;

      page.drawImage(img, { x, y, width: drawW, height: drawH });
    }

    const out = await pdf.save();
    downloadBlob(uint8ToBlob(out, "application/pdf"), "images.pdf");
    setIdle("Images PDF downloaded ✅");
    toast("Images → PDF ✅", "success");
  } catch (e) {
    setReady("Images → PDF failed.");
    toast("Images → PDF failed ❌", "error");
  }
});

// -------- IMAGE FORMAT CONVERT → ZIP ------
btnImgConvertZip.addEventListener("click", async () => {
  const imgs = files.filter(isImg);
  if (!imgs.length) return;

  const target = imgFormat.value;
  const q = parseInt(imgQuality.value, 10) / 100;

  setBusy("Converting images to ZIP...");
  try {
    const zipMap = {};
    for (const f of imgs) {
      const bytes = await convertImageFile(f, target, q);
      const base = f.name.replace(/\.[^.]+$/, "");
      const ext = target === "image/png" ? "png" : (target === "image/webp" ? "webp" : "jpg");
      zipMap[`${base}.${ext}`] = bytes;
    }

    downloadZip(zipMap, "converted-images.zip");
    setIdle("ZIP downloaded ✅");
    toast("Image conversion ZIP ✅", "success");
  } catch (e) {
    setReady("Image conversion failed.");
    toast("Image conversion failed ❌", "error");
  }
});

// Init
setTab("pdf");
renderFiles();
setIdle();
