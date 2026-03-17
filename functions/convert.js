const { PDFDocument, degrees } = PDFLib; // [4](https://pdf-lib.js.org/)

let files = [];
let activeTab = "merge";

// Elements
const dz = document.getElementById("dropzone");
const input = document.getElementById("fileInput");
const statusEl = document.getElementById("status");
const badge = document.getElementById("badge");
const tabs = document.querySelectorAll(".tooltab");

// Panels
const panels = ["merge","split","reorder","rotate"].reduce((acc, t) => {
  acc[t] = document.getElementById(`panel-${t}`);
  return acc;
}, {});

// Buttons
const btnMerge = document.getElementById("btnMerge");
const btnSplit = document.getElementById("btnSplit");
const btnReorder = document.getElementById("btnReorder");
const btnRotate = document.getElementById("btnRotate");

// Inputs
const splitRange = document.getElementById("splitRange");
const reorderList = document.getElementById("reorderList");
const rotateDeg = document.getElementById("rotateDeg");

function setStatus(text, state="Working") {
  statusEl.textContent = text;
  badge.textContent = state;
}

function setIdle(text="Upload files to begin.") {
  statusEl.textContent = text;
  badge.textContent = "Idle";
}

function setTab(tab) {
  activeTab = tab;
  tabs.forEach(b => {
    const isActive = b.dataset.tab === tab;
    b.className = isActive
      ? "tooltab px-4 py-2 rounded-xl bg-indigo-500 hover:bg-indigo-400 text-white font-semibold"
      : "tooltab px-4 py-2 rounded-xl bg-white/10 hover:bg-white/15 text-slate-100";
  });
  Object.keys(panels).forEach(k => panels[k].classList.toggle("hidden", k !== tab));
}

tabs.forEach(b => b.addEventListener("click", () => setTab(b.dataset.tab)));

dz.addEventListener("dragover", e => {
  e.preventDefault();
  dz.classList.add("border-indigo-400");
});
dz.addEventListener("dragleave", () => dz.classList.remove("border-indigo-400"));
dz.addEventListener("drop", e => {
  e.preventDefault();
  dz.classList.remove("border-indigo-400");
  handleFiles([...e.dataTransfer.files]);
});

input.addEventListener("change", e => handleFiles([...e.target.files]));

function handleFiles(selected) {
  const pdfs = selected.filter(f => f.type === "application/pdf");
  if (!pdfs.length) return setStatus("Please select PDF files only.", "Error");
  files = pdfs;
  setStatus(`${files.length} PDF file(s) ready. Choose a tool and click convert.`, "Ready");
}

function downloadBytes(bytes, filename) {
  const blob = new Blob([bytes], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function parseRanges(rangeText, maxPages) {
  // supports: 1-3,5,9-10
  const parts = rangeText.split(",").map(s => s.trim()).filter(Boolean);
  const pages = new Set();
  for (const p of parts) {
    if (p.includes("-")) {
      const [a,b] = p.split("-").map(x => parseInt(x.trim(),10));
      if (Number.isFinite(a) && Number.isFinite(b)) {
        for (let i = Math.min(a,b); i <= Math.max(a,b); i++) pages.add(i);
      }
    } else {
      const n = parseInt(p,10);
      if (Number.isFinite(n)) pages.add(n);
    }
  }
  // clamp 1..maxPages
  return [...pages].filter(n => n>=1 && n<=maxPages).sort((x,y)=>x-y);
}

async function loadPdf(file) {
  const bytes = await file.arrayBuffer();
  return PDFDocument.load(bytes);
}

// MERGE
btnMerge.addEventListener("click", async () => {
  if (files.length < 2) return setStatus("Select at least 2 PDFs to merge.", "Error");
  setStatus("Merging PDFs...");
  const out = await PDFDocument.create();
  for (const f of files) {
    const src = await loadPdf(f);
    const copied = await out.copyPages(src, src.getPageIndices());
    copied.forEach(p => out.addPage(p));
  }
  const bytes = await out.save();
  downloadBytes(bytes, "merged.pdf");
  setIdle("Merged PDF downloaded ✅");
});

// SPLIT (downloads individual PDFs one by one)
btnSplit.addEventListener("click", async () => {
  if (files.length !== 1) return setStatus("Split works with exactly 1 PDF.", "Error");
  const f = files[0];
  setStatus("Loading PDF...");
  const src = await loadPdf(f);
  const maxPages = src.getPageCount();
  const wanted = parseRanges(splitRange.value || "1-1", maxPages);
  if (!wanted.length) return setStatus("Give a valid page range.", "Error");

  // Create one PDF per requested page
  setStatus(`Splitting ${wanted.length} page(s)...`);
  for (const pg of wanted) {
    const out = await PDFDocument.create();
    const [copied] = await out.copyPages(src, [pg-1]);
    out.addPage(copied);
    const bytes = await out.save();
    downloadBytes(bytes, `page-${pg}.pdf`);
  }
  setIdle("Split pages downloaded ✅");
});

// REORDER / DELETE
btnReorder.addEventListener("click", async () => {
  if (files.length !== 1) return setStatus("Reorder works with exactly 1 PDF.", "Error");
  const f = files[0];
  const order = reorderList.value.split(",").map(s => parseInt(s.trim(),10)).filter(Number.isFinite);
  if (!order.length) return setStatus("Give an order like 3,1,2,5", "Error");

  setStatus("Reordering pages...");
  const src = await loadPdf(f);
  const max = src.getPageCount();
  const indices = order.filter(n => n>=1 && n<=max).map(n => n-1);

  const out = await PDFDocument.create();
  const copied = await out.copyPages(src, indices);
  copied.forEach(p => out.addPage(p));

  const bytes = await out.save();
  downloadBytes(bytes, "reordered.pdf");
  setIdle("Reordered PDF downloaded ✅");
});

// ROTATE
btnRotate.addEventListener("click", async () => {
  if (files.length !== 1) return setStatus("Rotate works with exactly 1 PDF.", "Error");
  const deg = parseInt(rotateDeg.value,10);
  setStatus(`Rotating pages by ${deg}°...`);

  const src = await loadPdf(files[0]);
  const pages = src.getPages();
  pages.forEach(p => p.setRotation(degrees(deg)));

  const bytes = await src.save();
  downloadBytes(bytes, `rotated-${deg}.pdf`);
  setIdle("Rotated PDF downloaded ✅");
});

// default
setTab("merge");
setIdle();
``
