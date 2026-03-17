document.addEventListener("DOMContentLoaded", () => {

  const status = document.getElementById("libStatus");

  // ✅ Library check
  if (!window.PDFLib) {
    status.innerHTML = "❌ pdf-lib NOT loaded";
    return;
  }
  if (!window.fflate) {
    status.innerHTML = "❌ fflate NOT loaded";
    return;
  }

  status.innerHTML = "✅ All libraries loaded. Buttons are active.";

  const { PDFDocument, degrees } = PDFLib;
  const { zipSync } = fflate;

  let files = [];

  // File input
  document.getElementById("fileInput").addEventListener("change", (e) => {
    files = Array.from(e.target.files);
    alert(files.length + " file(s) selected");
  });

  // ✅ Merge PDFs
  document.getElementById("btnMerge").onclick = async () => {
    const pdfs = files.filter(f => f.type === "application/pdf");
    if (pdfs.length < 2) return alert("Select 2+ PDFs");

    const out = await PDFDocument.create();
    for (const f of pdfs) {
      const bytes = await f.arrayBuffer();
      const doc = await PDFDocument.load(bytes);
      const pages = await out.copyPages(doc, doc.getPageIndices());
      pages.forEach(p => out.addPage(p));
    }
    download(await out.save(), "merged.pdf");
  };

  // ✅ Split PDF (1 page each → ZIP)
  document.getElementById("btnSplit").onclick = async () => {
    const pdf = files.find(f => f.type === "application/pdf");
    if (!pdf) return alert("Select 1 PDF");

    const doc = await PDFDocument.load(await pdf.arrayBuffer());
    const zip = {};

    for (let i = 0; i < doc.getPageCount(); i++) {
      const sub = await PDFDocument.create();
      const [page] = await sub.copyPages(doc, [i]);
      sub.addPage(page);
      zip[`page-${i+1}.pdf`] = await sub.save();
    }

    downloadZip(zip, "split-pages.zip");
  };

  // ✅ Rotate PDF
  document.getElementById("btnRotate").onclick = async () => {
    const pdf = files.find(f => f.type === "application/pdf");
    if (!pdf) return alert("Select 1 PDF");

    const doc = await PDFDocument.load(await pdf.arrayBuffer());
    doc.getPages().forEach(p => p.setRotation(degrees(90)));
    download(await doc.save(), "rotated.pdf");
  };

  // ✅ Delete first page
  document.getElementById("btnDelete").onclick = async () => {
    const pdf = files.find(f => f.type === "application/pdf");
    if (!pdf) return alert("Select 1 PDF");

    const doc = await PDFDocument.load(await pdf.arrayBuffer());
    doc.removePage(0);
    download(await doc.save(), "deleted.pdf");
  };

  // ✅ Images → PDF
  document.getElementById("btnImgToPdf").onclick = async () => {
    const imgs = files.filter(f => f.type.startsWith("image/"));
    if (!imgs.length) return alert("Select images");

    const pdf = await PDFDocument.create();
    for (const img of imgs) {
      const bytes = await img.arrayBuffer();
      const image = img.type.includes("png")
        ? await pdf.embedPng(bytes)
        : await pdf.embedJpg(bytes);
      const page = pdf.addPage([image.width, image.height]);
      page.drawImage(image, { x:0, y:0, width:image.width, height:image.height });
    }
    download(await pdf.save(), "images.pdf");
  };

  // ✅ Images → ZIP
  document.getElementById("btnImgZip").onclick = async () => {
    const imgs = files.filter(f => f.type.startsWith("image/"));
    if (!imgs.length) return alert("Select images");

    const zip = {};
    for (const img of imgs) {
      zip[img.name] = new Uint8Array(await img.arrayBuffer());
    }
    downloadZip(zip, "images.zip");
  };

  // Helpers
  function download(bytes, name) {
    const blob = new Blob([bytes]);
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = name;
    a.click();
  }

  function downloadZip(map, name) {
    const zipped = zipSync(map);
    download(zipped, name);
  }

});
