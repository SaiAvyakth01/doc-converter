const { PDFDocument, degrees } = PDFLib; // pdf-lib works in browsers and supports split/merge, etc. [3](https://pdf-lib.js.org/)[4](https://www.npmjs.com/package/pdf-lib)

let files = [];
let activeTab = "pdf";

const dz = document.getElementById("dropzone");
const input = document.getElementById("fileInput");
const fileList = document.getElementById("fileList");
const fileCount = document.getElementById("fileCount");
const clearBtn = document.getElementById("clearBtn");

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
const btnExtract = document.getElementById("btnExtract");
const btnDelete = document.getElementById("btnDelete");
const rotateDeg = document.getElementById("rotateDeg");
const btnRotate = document.getElementById("btnRotate");

// Image controls
const btnImgToPdf = document.getElementById("btnImgToPdf");
const imgFormat = document.getElementById("imgFormat");
const btnImgConvert = document.getElementById("btnImgConvert");

function toast(msg, type="info") {
  // Inspired by common toast UX patterns with Tailwind/Alpine-style toasts [6](https://dberri.com/how-to-create-a-toast-notification-with-alpine-js/)[7](https://www.penguinui.com/blog/toasty-alerts-create-user-friendly-notifications-with-tailwind-css-and-alpine-js)
  const colors = {
    info: "bg-white/10 border-white/20",
    success: "bg-emerald-500/20 border-emerald-400/30",
    error: "bg-rose-500/20 border-rose-400/30",
  };
  const el = document.createElement("div");
  el.className = `rounded-xl border ${colors[type]} px-4 py-3 text-sm shadow-lg backdrop-blur`;
  el.textContent = msg;
  toastWrap.appendChild(el);
  setTimeout(() => { el.classList.add("opacity-0"); }, 2200);
  setTimeout(() => { el.remove(); }, 2600);
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
  refreshButtons();
}

tabs.forEach(b => b.addEventListener("click", () => setTab(b.dataset.tab)));

dz.addEventListener("dragover", e => { e.preventDefault(); dz.classList.add("ring-2","ring-indigo-400/60"); });
dz.addEventListener("dragleave", () => dz.classList.remove("ring-2","ring-indigo-400/60"));
dz.addEventListener("drop", e => {
  e.preventDefault();
  dz.classList.remove("ring-2","ring-indigo-400/60");
  handleFiles([...e.dataTransfer.files]);
});

input.addEventListener("change", e => handleFiles([...e.target.files]));
clearBtn.addEventListener("click", () => { files = []; renderFiles(); setIdle(); });

function handleFiles(selected) {
  if (!selected.length) return;
  files = selected;
  renderFiles();
  setReady(`${files.length} file(s) ready. Choose a tool and convert.`);
  toast("Files added ✅", "success");
}

function renderFiles() {
  fileList.innerHTML = "";
  fileCount.textContent = String(files.length);

  files.forEach((f, idx) => {
    const li = document.createElement("li");
    li.className = "flex items-center justify-between gap-3 rounded-xl bg-white/5 border border-white/10 px-3 py-2";
    li.innerHTML = `
      <div class="min-w-0">
        <p class="truncate font-semibold">${escapeHtml(f.name)}</p>
        <p class="text-xs text-slate-400">${Math.round(f.size/1024)} KB</p>
      </div>
      <button class="removeBtn text-xs rounded-lg bg-white/10 hover:bg-white/15 px-3 py-1">Remove</button>
    `;
    li.querySelector(".removeBtn").addEventListener("click", () => {
      files.splice(idx,1);
      renderFiles();
      refreshButtons();
      toast("Removed file", "info");
    });
    fileList.appendChild(li);
  });

  refreshButtons();
}

function escapeHtml(s) {
  return s.replace(/[&<>"']/g, m => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[m]));
}

function isPdf(f){ return f.type === "application/pdf" || f.name.toLowerCase().endsWith(".pdf"); }
function isImg(f){ return /^image\//.test(f.type) || /\.(png|jpg|jpeg|webp)$/i.test(f.name); }

function refreshButtons() {
  const pdfs = files.filter(isPdf);
  const imgs = files.filter(isImg);

  // PDF
  btnMerge.disabled = !(pdfs.length >= 2);
  btnExtract.disabled = !(pdfs.length === 1);
  btnDelete.disabled = !(pdfs.length === 1);
  btnRotate.disabled = !(pdfs.length === 1);

  // Image
  btnImgToPdf.disabled = !(imgs.length >= 1);
  btnImgConvert.disabled = !(imgs.length >= 1);
}

async function loadPdf(file) {
  const bytes = await file.arrayBuffer();
  return PDFDocument.load(bytes);
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function parseRanges(rangeText, maxPages) {
  const parts = (rangeText || "").split(",").map(s => s.trim()).filter(Boolean);
  const set = new Set();
  for (const p of parts) {
    if (p.includes("-")) {
      const [a,b] = p.split("-").map(x => parseInt(x.trim(),10));
      if (Number.isFinite(a) && Number.isFinite(b)) {
        for (let i = Math.min(a,b); i <= Math.max(a,b); i++) set.add(i);
      }
    } else {
      const n = parseInt(p,10);
      if (Number.isFinite(n)) set.add(n);
    }
  }
  return [...set].filter(n => n>=1 && n<=maxPages).sort((x,y)=>x-y);
}

// ---------------- PDF: MERGE ----------------
btnMerge.addEventListener("click", async () => {
  const pdfs = files.filter(isPdf);
  setBusy("Merging PDFs...");
  try {
    const out = await PDFDocument.create();
    for (const f of pdfs) {
      const src = await loadPdf(f);
      const copied = await out.copyPages(src, src.getPageIndices());
      copied.forEach(p => out.addPage(p));
    }
    const bytes = await out.save();
    downloadBlob(new Blob([bytes], {type:"application/pdf"}), "merged.pdf");
    setIdle("Merged PDF downloaded ✅");
    toast("Merge complete ✅", "success");
  } catch (e) {
    setReady("Merge failed. Try different PDFs.");
    toast("Merge failed ❌", "error");
  }
});

// ----------- PDF: EXTRACT PAGES --------------
btnExtract.addEventListener("click", async () => {
  const pdfs = files.filter(isPdf);
  if (pdfs.length !== 1) return;
  setBusy("Extracting pages...");
  try {
    const src = await loadPdf(pdfs[0]);
    const maxPages = src.getPageCount();
    const wanted = parseRanges(pageRange.value, maxPages);
    if (!wanted.length) { setReady("Enter a valid range like 1-3,5"); toast("Invalid range", "error"); return; }

    const out = await PDFDocument.create();
    const indices = wanted.map(n => n-1);
    const copied = await out.copyPages(src, indices);
    copied.forEach(p => out.addPage(p));

    const bytes = await out.save();
    downloadBlob(new Blob([bytes], {type:"application/pdf"}), "extracted.pdf");
    setIdle("Extracted PDF downloaded ✅");
    toast("Extract complete ✅", "success");
  } catch (e) {
    setReady("Extract failed.");
    toast("Extract failed ❌", "error");
  }
});

// ----------- PDF: DELETE PAGES ---------------
btnDelete.addEventListener("click", async () => {
  const pdfs = files.filter(isPdf);
  if (pdfs.length !== 1) return;
  setBusy("Deleting pages...");
  try {
    const src = await loadPdf(pdfs[0]);
    const maxPages = src.getPageCount();
    const del = parseRanges(pageRange.value, maxPages);
    if (!del.length) { setReady("Enter pages to delete like 2,4-6"); toast("Invalid range", "error"); return; }

    // remove from highest index to lowest (safe)
    del.sort((a,b)=>b-a).forEach(p => src.removePage(p-1)); // removePage is supported [11](https://github.com/Hopding/pdf-lib/issues/42)[12](https://app.studyraid.com/en/read/12496/404118/removing-pages-from-documents)
    const bytes = await src.save();
    downloadBlob(new Blob([bytes], {type:"application/pdf"}), "deleted-pages.pdf");
    setIdle("Updated PDF downloaded ✅");
    toast("Delete complete ✅", "success");
  } catch (e) {
    setReady("Delete failed.");
    toast("Delete failed ❌", "error");
  }
});

// --------------- PDF: ROTATE ----------------
btnRotate.addEventListener("click", async () => {
  const pdfs = files.filter(isPdf);
  if (pdfs.length !== 1) return;
  const deg = parseInt(rotateDeg.value,10);
  setBusy(`Rotating ${deg}°...`);
  try {
    const src = await loadPdf(pdfs[0]);
    src.getPages().forEach(p => p.setRotation(degrees(deg))); // setRotation usage [13](https://stackoverflow.com/questions/71636123/rotate-a-page-with-pdf-lib-and-javascript)[14](https://github.com/Hopding/pdf-lib/issues/118)
    const bytes = await src.save();
    downloadBlob(new Blob([bytes], {type:"application/pdf"}), `rotated-${deg}.pdf`);
    setIdle("Rotated PDF downloaded ✅");
    toast("Rotate complete ✅", "success");
  } catch (e) {
    setReady("Rotate failed.");
    toast("Rotate failed ❌", "error");
  }
});

// ----------- IMAGES → PDF (pdf-lib) ----------
btnImgToPdf.addEventListener("click", async () => {
  const imgs = files.filter(isImg);
  if (!imgs.length) return;
  setBusy("Creating PDF from images...");
  try {
    const pdf = await PDFDocument.create();
    for (const imgFile of imgs) {
      const bytes = await imgFile.arrayBuffer();
      // pdf-lib supports embedding JPG/PNG and drawing them [4](https://www.npmjs.com/package/pdf-lib)[3](https://pdf-lib.js.org/)
      let img;
      if (/png$/i.test(imgFile.type) || /\.png$/i.test(imgFile.name)) img = await pdf.embedPng(bytes);
      else img = await pdf.embedJpg(bytes);

      const { width, height } = img.scale(1);
      const page = pdf.addPage([width, height]);
      page.drawImage(img, { x: 0, y: 0, width, height });
    }
    const out = await pdf.save();
    downloadBlob(new Blob([out], {type:"application/pdf"}), "images.pdf");
    setIdle("Images PDF downloaded ✅");
    toast("Images → PDF ✅", "success");
  } catch (e) {
    setReady("Images → PDF failed.");
    toast("Images → PDF failed ❌", "error");
  }
});

// ----------- IMAGE FORMAT CONVERT ------------
btnImgConvert.addEventListener("click", async () => {
  const imgs = files.filter(isImg);
  if (!imgs.length) return;
  const target = imgFormat.value;
  setBusy("Converting images...");
  try {
    for (const f of imgs) {
      const bmp = await createImageBitmap(f);
      const canvas = document.createElement("canvas");
      canvas.width = bmp.width;
      canvas.height = bmp.height;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(bmp, 0, 0);

      const blob = await new Promise(res => canvas.toBlob(res, target, 0.92));
      const ext = target === "image/png" ? "png" : target === "image/webp" ? "webp" : "jpg";
      downloadBlob(blob, `${f.name.replace(/\.[^.]+$/,'')}.${ext}`);
    }
    setIdle("Images downloaded ✅");
    toast("Image conversion ✅", "success");
  } catch (e) {
    setReady("Image conversion failed.");
    toast("Image conversion failed ❌", "error");
  }
});

// init
setTab("pdf");
setIdle();
