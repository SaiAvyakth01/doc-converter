// app.js — ConvertHub (browser-only conversions)
// Requires pdf-lib + fflate loaded from index.html [4](https://sentry.io/answers/how-do-i-resolve-cannot-find-module-error-using-node-js/)[5](https://github.com/elwerene/libreoffice-convert/issues/97)

(() => {
  const $ = (id) => document.getElementById(id);

  // Elements
  const dz = $("dropzone");
  const input = $("fileInput");
  const fileList = $("fileList");
  const fileCount = $("fileCount");
  const statusEl = $("status");
  const badge = $("badge");
  const spinner = $("spinner");
  const toastWrap = $("toastWrap");

  // Buttons
  const btnMerge = $("btnMerge");
  const btnExtract = $("btnExtract");
  const btnSplitZip = $("btnSplitZip");
  const btnDelete = $("btnDelete");
  const btnRotate = $("btnRotate");
  const btnImgToPdf = $("btnImgToPdf");
  const btnImgConvertZip = $("btnImgConvertZip");

  // Inputs
  const rangeExtract = $("rangeExtract");
  const rangeSplit = $("rangeSplit");
  const rangeDelete = $("rangeDelete");
  const rangeRotate = $("rangeRotate");
  const rotateDeg = $("rotateDeg");
  const imgFormat = $("imgFormat");
  const imgQuality = $("imgQuality");

  // Tabs/panels
  const tabs = document.querySelectorAll(".tooltab");
  const panels = ["merge","extract","split","delete","rotate","img2pdf","imgconvert"]
    .reduce((acc, t) => (acc[t] = $(`panel-${t}`), acc), {});

  // Libraries
  const { PDFDocument, degrees } = window.PDFLib;
  const { zipSync } = window.fflate;

  // State
  let files = [];

  // ---------- UI helpers ----------
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
  function setIdle(text="Upload files to begin.") {
    spinner.classList.add("hidden");
    badge.textContent = "Idle";
    statusEl.textContent = text;
  }
  function setReady(text) {
    spinner.classList.add("hidden");
    badge.textContent = "Ready";
    statusEl.textContent = text;
  }

  function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  function downloadPdfBytes(u8, name) {
    downloadBlob(new Blob([u8], { type: "application/pdf" }), name);
  }

  function downloadZip(fileMap, zipName) {
    const zipped = zipSync(fileMap, { level: 6 });
    downloadBlob(new Blob([zipped], { type: "application/zip" }), zipName);
  }

  const isPdf = (f) => f.type === "application/pdf" || f.name.toLowerCase().endsWith(".pdf");
  const isImg = (f) => /^image\//.test(f.type) || /\.(png|jpg|jpeg|webp)$/i.test(f.name);

  function renderFiles() {
    fileList.innerHTML = "";
    fileCount.textContent = String(files.length);

    files.forEach((f, idx) => {
      const li = document.createElement("li");
      li.className = "flex items-center justify-between gap-3 rounded-xl bg-white/5 border border-white/10 px-3 py-2";
      li.innerHTML = `
        <div class="min-w-0">
          <p class="truncate font-semibold">${f.name}</p>
          <p class="text-xs text-slate-400">${Math.round(f.size/1024)} KB</p>
        </div>
        <button class="text-xs rounded-lg bg-white/10 hover:bg-white/15 px-3 py-1">Remove</button>
      `;
      li.querySelector("button").addEventListener("click", () => {
        files.splice(idx, 1);
        renderFiles();
        refreshButtons();
      });
      fileList.appendChild(li);
    });

    refreshButtons();
  }

  function refreshButtons() {
    const pdfs = files.filter(isPdf);
    const imgs = files.filter(isImg);

    btnMerge.disabled = !(pdfs.length >= 2);
    btnExtract.disabled = !(pdfs.length === 1);
    btnSplitZip.disabled = !(pdfs.length === 1);
    btnDelete.disabled = !(pdfs.length === 1);
    btnRotate.disabled = !(pdfs.length === 1);
    btnImgToPdf.disabled = !(imgs.length >= 1);
    btnImgConvertZip.disabled = !(imgs.length >= 1);
  }

  // Range parser: "1-3,5" + "all/odd/even"
  function parseRanges(text, maxPages) {
    const raw = (text || "").trim().toLowerCase();
    if (!raw || raw === "all") return Array.from({ length: maxPages }, (_, i) => i + 1);
    if (raw === "odd") return Array.from({ length: maxPages }, (_, i) => i + 1).filter(n => n % 2 === 1);
    if (raw === "even") return Array.from({ length: maxPages }, (_, i) => i + 1).filter(n => n % 2 === 0);

    const parts = raw.split(",").map(s => s.trim()).filter(Boolean);
    const set = new Set();
    for (const p of parts) {
      if (p.includes("-")) {
        const [a, b] = p.split("-").map(x => parseInt(x.trim(), 10));
        if (Number.isFinite(a) && Number.isFinite(b)) {
          for (let i = Math.min(a, b); i <= Math.max(a, b); i++) set.add(i);
        }
      } else {
        const n = parseInt(p, 10);
        if (Number.isFinite(n)) set.add(n);
      }
    }
    return [...set].filter(n => n >= 1 && n <= maxPages).sort((x, y) => x - y);
  }

  async function loadPdf(file) {
    const bytes = await file.arrayBuffer();
    return PDFDocument.load(bytes);
  }

  // Convert any image (png/jpg/webp) to PNG bytes for reliable embedding
  async function imageToPngBytes(file) {
    const bmp = await createImageBitmap(file);
    const canvas = document.createElement("canvas");
    canvas.width = bmp.width;
    canvas.height = bmp.height;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(bmp, 0, 0);
    const blob = await new Promise(res => canvas.toBlob(res, "image/png"));
    return new Uint8Array(await blob.arrayBuffer());
  }

  async function convertImage(file, targetMime, q) {
    const bmp = await createImageBitmap(file);
    const canvas = document.createElement("canvas");
    canvas.width = bmp.width;
    canvas.height = bmp.height;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(bmp, 0, 0);
    const quality = (targetMime === "image/jpeg" || targetMime === "image/webp")
      ? Math.max(0.4, Math.min(0.95, q))
      : undefined;
    const blob = await new Promise(res => canvas.toBlob(res, targetMime, quality));
    return new Uint8Array(await blob.arrayBuffer());
  }

  // ---------- Tabs ----------
  function setTab(tab) {
    tabs.forEach(b => {
      const active = b.dataset.tab === tab;
      b.className = active
        ? "tooltab px-4 py-2 rounded-xl bg-indigo-500 hover:bg-indigo-400 text-white font-semibold"
        : "tooltab px-4 py-2 rounded-xl bg-white/10 hover:bg-white/15 text-slate-100";
    });
    Object.keys(panels).forEach(k => panels[k].classList.toggle("hidden", k !== tab));
  }

  tabs.forEach(b => b.addEventListener("click", () => setTab(b.dataset.tab)));

  // ---------- File input + drop ----------
  input.addEventListener("change", (e) => {
    const selected = [...e.target.files];
    files = selected.filter(f => isPdf(f) || isImg(f));
    renderFiles();
    setReady(`${files.length} file(s) ready.`);
    toast("Files added ✅", "success");
  });

  dz.addEventListener("dragover", e => { e.preventDefault(); dz.classList.add("ring-2","ring-indigo-400/60"); });
  dz.addEventListener("dragleave", () => dz.classList.remove("ring-2","ring-indigo-400/60"));
  dz.addEventListener("drop", e => {
    e.preventDefault();
    dz.classList.remove("ring-2","ring-indigo-400/60");
    files = [...e.dataTransfer.files].filter(f => isPdf(f) || isImg(f));
    renderFiles();
    setReady(`${files.length} file(s) ready.`);
    toast("Files added ✅", "success");
  });

  // ---------- Actions ----------
  btnMerge.addEventListener("click", async () => {
    const pdfs = files.filter(isPdf);
    if (pdfs.length < 2) return toast("Select 2+ PDFs", "error");

    setBusy("Merging PDFs...");
    try {
      const out = await PDFDocument.create();
      for (const f of pdfs) {
        const src = await loadPdf(f);
        const copied = await out.copyPages(src, src.getPageIndices());
        copied.forEach(p => out.addPage(p));
      }
      downloadPdfBytes(await out.save(), "merged.pdf");
      toast("Merge complete ✅", "success");
    } catch {
      toast("Merge failed ❌", "error");
    } finally {
      setIdle();
    }
  });

  btnExtract.addEventListener("click", async () => {
    const pdf = files.find(isPdf);
    if (!pdf) return toast("Select 1 PDF", "error");

    setBusy("Extracting pages...");
    try {
      const src = await loadPdf(pdf);
      const wanted = parseRanges(rangeExtract.value, src.getPageCount());
      const out = await PDFDocument.create();
      const copied = await out.copyPages(src, wanted.map(n => n - 1));
      copied.forEach(p => out.addPage(p));
      downloadPdfBytes(await out.save(), "extracted.pdf");
      toast("Extract complete ✅", "success");
    } catch {
      toast("Extract failed ❌", "error");
    } finally {
      setIdle();
    }
  });

  btnSplitZip.addEventListener("click", async () => {
    const pdf = files.find(isPdf);
    if (!pdf) return toast("Select 1 PDF", "error");

    setBusy("Splitting to ZIP...");
    try {
      const src = await loadPdf(pdf);
      const wanted = parseRanges(rangeSplit.value, src.getPageCount());
      const zipMap = {};
      for (const pg of wanted) {
        const sub = await PDFDocument.create();
        const [copied] = await sub.copyPages(src, [pg - 1]);
        sub.addPage(copied);
        zipMap[`page-${pg}.pdf`] = await sub.save();
      }
      downloadZip(zipMap, "split-pages.zip");
      toast("Split ZIP ready ✅", "success");
    } catch {
      toast("Split failed ❌", "error");
    } finally {
      setIdle();
    }
  });

  btnDelete.addEventListener("click", async () => {
    const pdf = files.find(isPdf);
    if (!pdf) return toast("Select 1 PDF", "error");

    setBusy("Deleting pages...");
    try {
      const src = await loadPdf(pdf);
      const del = parseRanges(rangeDelete.value, src.getPageCount()).sort((a,b)=>b-a);
      del.forEach(p => src.removePage(p - 1)); // removePage supported by pdf-lib
      downloadPdfBytes(await src.save(), "deleted-pages.pdf");
      toast("Delete complete ✅", "success");
    } catch {
      toast("Delete failed ❌", "error");
    } finally {
      setIdle();
    }
  });

  btnRotate.addEventListener("click", async () => {
    const pdf = files.find(isPdf);
    if (!pdf) return toast("Select 1 PDF", "error");

    setBusy("Rotating pages...");
    try {
      const src = await loadPdf(pdf);
      const deg = parseInt(rotateDeg.value, 10);
      const wanted = parseRanges(rangeRotate.value, src.getPageCount());
      const wantedSet = new Set(wanted.map(n => n - 1));

      src.getPages().forEach((p, idx) => {
        if (wantedSet.size === 0 || wantedSet.has(idx)) p.setRotation(degrees(deg));
      });

      downloadPdfBytes(await src.save(), `rotated-${deg}.pdf`);
      toast("Rotate complete ✅", "success");
    } catch {
      toast("Rotate failed ❌", "error");
    } finally {
      setIdle();
    }
  });

  btnImgToPdf.addEventListener("click", async () => {
    const imgs = files.filter(isImg);
    if (!imgs.length) return toast("Select 1+ images", "error");

    setBusy("Creating PDF from images...");
    try {
      const pdf = await PDFDocument.create();
      const A4_W = 595, A4_H = 842;

      for (const imgFile of imgs) {
        const pngBytes = await imageToPngBytes(imgFile);
        const img = await pdf.embedPng(pngBytes);

        const page = pdf.addPage([A4_W, A4_H]);
        const margin = 24;
        const maxW = A4_W - margin*2;
        const maxH = A4_H - margin*2;
        const scale = Math.min(maxW / img.width, maxH / img.height);
        const w = img.width * scale;
        const h = img.height * scale;

        page.drawImage(img, { x:(A4_W-w)/2, y:(A4_H-h)/2, width:w, height:h });
      }

      downloadPdfBytes(await pdf.save(), "images.pdf");
      toast("Images → PDF ✅", "success");
    } catch {
      toast("Images → PDF failed ❌", "error");
    } finally {
      setIdle();
    }
  });

  btnImgConvertZip.addEventListener("click", async () => {
    const imgs = files.filter(isImg);
    if (!imgs.length) return toast("Select 1+ images", "error");

    setBusy("Converting images...");
    try {
      const target = imgFormat.value;
      const q = parseInt(imgQuality.value, 10) / 100;
      const zipMap = {};
      const ext = target === "image/png" ? "png" : (target === "image/webp" ? "webp" : "jpg");

      for (const f of imgs) {
        const bytes = await convertImage(f, target, q);
        zipMap[`${f.name.replace(/\.[^.]+$/,"")}.${ext}`] = bytes;
      }

      downloadZip(zipMap, "converted-images.zip");
      toast("Image ZIP ✅", "success");
    } catch {
      toast("Image convert failed ❌", "error");
    } finally {
      setIdle();
    }
  });

  // Init
  setTab("merge");
  renderFiles();
  setIdle();
})();
