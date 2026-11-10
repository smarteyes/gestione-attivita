/* =========================================================
 * SCANSIONE SCONTRINI / FATTURE
 * Foto (fotocamera o file) o PDF → testo → campi (GA.scanParse) → modulo spesa precompilato da confermare.
 * Il "lettore" è un adattatore sostituibile (GA.scan.extractors):
 *   local  = OCR nel browser con Tesseract.js + pdf.js inclusi in vendor/ (offline, caricati solo al primo uso)
 *   remote = il backend riceve l'immagine e risponde con testo/campi (es. servizio AI di visione) — vedi README.
 * Nulla viene salvato senza conferma: il salvataggio avviene solo dal pulsante del modulo di revisione.
 * ========================================================= */
window.GA = window.GA || {};
(function () {
  const U = () => GA.ui, t = (p, v) => GA.t(p, v), I = GA.icon, api = GA.api;
  const S = () => U().S, esc = (v) => U().esc(v), $ = (s, el = document) => el.querySelector(s);
  const CFG = () => Object.assign({ extractor: "local", maxSide: 2000, keepSide: 1400, keepQuality: 0.62, psm: "4" }, (GA.config || {}).scan || {});
  const BASE = () => new URL(".", location.href).href;
  const loaded = {};
  const loadScript = (src) => loaded[src] || (loaded[src] = new Promise((res, rej) => { const s = document.createElement("script"); s.src = src; s.onload = res; s.onerror = () => { delete loaded[src]; rej(new Error("load " + src)); }; document.head.appendChild(s); }));

  /* ---------- immagini ---------- */
  async function toBitmap(file) {
    if (window.createImageBitmap) { try { return await createImageBitmap(file, { imageOrientation: "from-image" }); } catch (e) { /* formato non gestito: provo con <img> */ } }
    const url = URL.createObjectURL(file);
    try { return await new Promise((res, rej) => { const im = new Image(); im.onload = () => res(im); im.onerror = () => rej(Object.assign(new Error("img"), { code: "scanImage" })); im.src = url; }); }
    finally { setTimeout(() => URL.revokeObjectURL(url), 5000); }
  }
  function drawScaled(src, maxSide, minSide) {
    const w0 = src.width, h0 = src.height, L = Math.max(w0, h0);
    let k = Math.min(1, maxSide / L); if (minSide && L * k < minSide) k = minSide / L;
    const c = document.createElement("canvas"); c.width = Math.round(w0 * k); c.height = Math.round(h0 * k);
    const g = c.getContext("2d"); g.imageSmoothingQuality = "high"; g.fillStyle = "#fff"; g.fillRect(0, 0, c.width, c.height); g.drawImage(src, 0, 0, c.width, c.height); return c;
  }
  /* foto dal telefono: ritaglia il foglio (zona chiara su sfondo più scuro) e lo raddrizza (profilo di proiezione) */
  function geometry(src) {
    const a = drawScaled(src, 480), W = a.width, H = a.height, px = a.getContext("2d").getImageData(0, 0, W, H).data, n = W * H, gr = new Uint8Array(n), hist = new Uint32Array(256);
    for (let i = 0; i < n; i++) { const v = (px[i * 4] * 0.299 + px[i * 4 + 1] * 0.587 + px[i * 4 + 2] * 0.114) | 0; gr[i] = v; hist[v]++; }
    let sum = 0, sB = 0, wB = 0, best = 0, thr = 128; for (let i = 0; i < 256; i++) sum += i * hist[i];
    for (let i = 0; i < 256; i++) { wB += hist[i]; if (!wB) continue; const wF = n - wB; if (!wF) break; sB += i * hist[i]; const mB = sB / wB, mF = (sum - sB) / wF, b = wB * wF * (mB - mF) * (mB - mF); if (b > best) { best = b; thr = i; } }
    // ritaglio: righe/colonne con abbastanza "carta"
    let x0 = 0, x1 = W - 1, y0 = 0, y1 = H - 1; const bright = (i) => gr[i] > thr;
    let tot = 0; for (let i = 0; i < n; i++) if (bright(i)) tot++;
    const frac = tot / n;
    if (frac > 0.08 && frac < 0.8) {
      const colOk = (x) => { let c = 0; for (let y = 0; y < H; y++) if (bright(y * W + x)) c++; return c > H * 0.12; };
      const rowOk = (y) => { let c = 0; for (let x = 0; x < W; x++) if (bright(y * W + x)) c++; return c > W * 0.12; };
      while (x0 < W - 1 && !colOk(x0)) x0++; while (x1 > x0 && !colOk(x1)) x1--; while (y0 < H - 1 && !rowOk(y0)) y0++; while (y1 > y0 && !rowOk(y1)) y1--;
      const m = Math.round(Math.max(W, H) * 0.02); x0 = Math.max(0, x0 - m); y0 = Math.max(0, y0 - m); x1 = Math.min(W - 1, x1 + m); y1 = Math.min(H - 1, y1 + m);
      if ((x1 - x0) * (y1 - y0) > n * 0.9) { x0 = 0; y0 = 0; x1 = W - 1; y1 = H - 1; }
    }
    // pendenza: punti scuri con carta vicina (testo), varianza del profilo orizzontale per angoli −12…12°
    const pts = [];
    for (let y = y0 + 2; y < y1 - 2; y++) for (let x = x0 + 3; x < x1 - 3; x++) { const i = y * W + x; if (!bright(i) && (bright(i - 3) || bright(i + 3)) && (bright(i - 3 * W) || bright(i + 3 * W))) pts.push(x, y); }
    let ang = 0;
    if (pts.length > 200) {
      const score = (deg) => { const r = (deg * Math.PI) / 180, sn = Math.sin(r), cs = Math.cos(r), bins = new Map(); let s2 = 0; for (let k = 0; k < pts.length; k += 2) { const b = Math.round(pts[k + 1] * cs - pts[k] * sn); bins.set(b, (bins.get(b) || 0) + 1); } bins.forEach((v) => (s2 += v * v)); return s2; };
      const s0 = score(0); let bs = s0;
      for (let d = -12; d <= 12; d += 0.5) { const sc = score(d); if (sc > bs) { bs = sc; ang = d; } }
      for (let d = ang - 0.4; d <= ang + 0.4; d += 0.1) { const sc = score(d); if (sc > bs) { bs = sc; ang = d; } }
      if (Math.abs(ang) < 0.4 || bs < s0 * 1.08) ang = 0;
    }
    const k = src.width / W; return { x: x0 * k, y: y0 * k, w: (x1 - x0 + 1) * k, h: (y1 - y0 + 1) * k, angle: ang };
  }
  function straighten(src, gm) {
    const r = (-gm.angle * Math.PI) / 180, cs = Math.abs(Math.cos(r)), sn = Math.abs(Math.sin(r));
    const c = document.createElement("canvas"); c.width = Math.round(gm.w * cs + gm.h * sn); c.height = Math.round(gm.w * sn + gm.h * cs);
    const g = c.getContext("2d"); g.fillStyle = "#fff"; g.fillRect(0, 0, c.width, c.height); g.imageSmoothingQuality = "high";
    g.translate(c.width / 2, c.height / 2); g.rotate(r); g.drawImage(src, gm.x, gm.y, gm.w, gm.h, -gm.w / 2, -gm.h / 2, gm.w, gm.h); return c;
  }
  /* pre-elaborazione per l'OCR: ritaglio + raddrizzamento, ridimensiona, scala di grigi, allunga il contrasto (percentili 1–99%) */
  function preprocess(src) {
    try { const gm = geometry(src); if (gm.angle || gm.w < src.width * 0.95 || gm.h < src.height * 0.95) src = straighten(src, gm); } catch (e) { /* uso l'immagine così com'è */ }
    const c = drawScaled(src, CFG().maxSide, 1600), g = c.getContext("2d");
    const im = g.getImageData(0, 0, c.width, c.height), d = im.data, n = d.length / 4, hist = new Uint32Array(256), gray = new Uint8ClampedArray(n);
    for (let i = 0; i < n; i++) gray[i] = (d[i * 4] * 0.299 + d[i * 4 + 1] * 0.587 + d[i * 4 + 2] * 0.114) | 0;
    // ombre e luce non uniforme: divido per lo sfondo stimato (immagine piccola, massimo locale, ingrandita sfumata)
    const sw = Math.max(8, Math.round(c.width / 24)), sh = Math.max(8, Math.round(c.height / 24)), sc = document.createElement("canvas"); sc.width = sw; sc.height = sh;
    const sg = sc.getContext("2d"); sg.drawImage(c, 0, 0, sw, sh); const sd = sg.getImageData(0, 0, sw, sh); let bgv = new Float32Array(sw * sh);
    for (let i = 0; i < sw * sh; i++) bgv[i] = sd.data[i * 4] * 0.299 + sd.data[i * 4 + 1] * 0.587 + sd.data[i * 4 + 2] * 0.114;
    for (let pass = 0; pass < 2; pass++) { const o = new Float32Array(bgv.length); for (let y = 0; y < sh; y++) for (let x = 0; x < sw; x++) { let m = 0; for (let j = -1; j <= 1; j++) for (let k = -1; k <= 1; k++) { const yy = Math.min(sh - 1, Math.max(0, y + j)), xx = Math.min(sw - 1, Math.max(0, x + k)); m = Math.max(m, bgv[yy * sw + xx]); } o[y * sw + x] = m; } bgv = o; }
    const bigBg = (x, y) => { const fx = Math.min(sw - 1.001, Math.max(0, (x / c.width) * sw - 0.5)), fy = Math.min(sh - 1.001, Math.max(0, (y / c.height) * sh - 0.5)), x0 = fx | 0, y0 = fy | 0, ax = fx - x0, ay = fy - y0, i = y0 * sw + x0;
      return (bgv[i] * (1 - ax) + bgv[i + 1] * ax) * (1 - ay) + (bgv[i + sw] * (1 - ax) + bgv[i + sw + 1] * ax) * ay; };
    for (let y = 0; y < c.height; y++) for (let x = 0; x < c.width; x++) { const i = y * c.width + x, b = Math.max(40, bigBg(x, y)), v = Math.min(255, (gray[i] * 255) / b) | 0; gray[i] = v; hist[v]++; }
    let lo = 0, hi = 255, acc = 0; for (; lo < 255 && (acc += hist[lo]) < n * 0.01; lo++);
    acc = 0; for (; hi > 0 && (acc += hist[hi]) < n * 0.01; hi--);
    if (hi - lo < 30) { lo = Math.max(0, lo - 15); hi = Math.min(255, hi + 15); }
    const k = 255 / Math.max(1, hi - lo);
    for (let i = 0; i < n; i++) { const v = Math.max(0, Math.min(255, (gray[i] - lo) * k)); d[i * 4] = d[i * 4 + 1] = d[i * 4 + 2] = v; }
    g.putImageData(im, 0, 0); return c;
  }
  const keep = (src) => { const c = drawScaled(src, CFG().keepSide); return { dataUrl: c.toDataURL("image/jpeg", CFG().keepQuality), w: c.width, h: c.height }; };

  /* ---------- OCR (Tesseract.js, locale) ---------- */
  let worker = null, workerLangs = "", idle = null;
  async function ocrWorker(langs, onP) {
    if (worker && workerLangs === langs) return worker;
    if (worker) { await worker.terminate().catch(() => {}); worker = null; }
    const v = BASE() + "vendor/ocr/";
    await loadScript(v + "tesseract.min.js");
    worker = await window.Tesseract.createWorker(langs.split("+"), 1, {
      workerPath: v + "worker.min.js", corePath: v + "core/", langPath: v + "lang", gzip: true, workerBlobURL: false,
      logger: (m) => onP && onP(m),
    });
    await worker.setParameters({ tessedit_pageseg_mode: CFG().psm, preserve_interword_spaces: "1", user_defined_dpi: "300" });
    workerLangs = langs; return worker;
  }
  const langsFor = () => ((GA.i18n && GA.i18n.lang) === "zh" ? "chi_sim+ita+eng" : "ita+eng");

  /* ---------- PDF (pdf.js, locale) ---------- */
  async function pdfDoc(file) {
    const v = BASE() + "vendor/pdfjs/";
    await loadScript(v + "pdf.min.js"); const L = window.pdfjsLib; L.GlobalWorkerOptions.workerSrc = v + "pdf.worker.min.js";
    return L.getDocument({ data: new Uint8Array(await file.arrayBuffer()), isEvalSupported: false }).promise;
  }
  function textLines(items) {
    const rows = [];
    items.filter((i) => i.str && i.str.trim()).forEach((i) => {
      const y = i.transform[5], x = i.transform[4]; let r = rows.find((q) => Math.abs(q.y - y) < Math.max(2, (i.height || 10) * 0.5));
      if (!r) rows.push((r = { y, it: [] })); r.it.push({ x, s: i.str, w: i.width || 0 });
    });
    rows.sort((a, b) => b.y - a.y);
    return rows.map((r) => { r.it.sort((a, b) => a.x - b.x); let out = "", end = null; r.it.forEach((i) => { out += end == null ? i.s : (i.x - end > 12 ? "   " : i.x - end > 1 ? " " : "") + i.s; end = i.x + i.w; }); return out; }).join("\n");
  }

  /* ---------- adattatori ---------- */
  const extractors = {
    local: {
      name: "local",
      async extract(file, onP) {
        const isPdf = file.type === "application/pdf" || /\.pdf$/i.test(file.name || "");
        if (location.protocol === "file:") throw Object.assign(new Error("file"), { code: "scanFile" });
        let src, text = "", source = "ocr", conf = null;
        if (isPdf) {
          onP({ status: "pdf" }); const doc = await pdfDoc(file); const page = await doc.getPage(1);
          text = textLines((await page.getTextContent()).items);
          const vp0 = page.getViewport({ scale: 1 }), vp = page.getViewport({ scale: Math.min(3, 1700 / vp0.width) });
          src = document.createElement("canvas"); src.width = vp.width; src.height = vp.height;
          await page.render({ canvasContext: src.getContext("2d"), viewport: vp, background: "#ffffff" }).promise;
          if ((text.match(/[A-Za-z0-9\u4e00-\u9fff]/g) || []).length >= 30) source = "pdf"; else text = "";
        } else src = await toBitmap(file);
        if (!text) {
          const w = await ocrWorker(langsFor(), onP); clearTimeout(idle);
          const pre = preprocess(src); const r = await w.recognize(pre); text = r.data.text || ""; conf = r.data.confidence;
          // seconda lettura con un'altra segmentazione se mancano campi chiave (righe saltate dall'OCR)
          const f1 = GA.scanParse.parse(text).fields;
          if (!f1.date.value || f1.total.conf < 0.6 || !f1.rates.value.length) {
            onP({ status: "recognizing text", progress: 0.5 });
            await w.setParameters({ tessedit_pageseg_mode: CFG().psm === "6" ? "3" : "6" });
            try { const r2 = await w.recognize(pre); text += "\n" + (r2.data.text || ""); } finally { await w.setParameters({ tessedit_pageseg_mode: CFG().psm }); }
          }
          idle = setTimeout(() => { if (worker) { worker.terminate().catch(() => {}); worker = null; } }, 120000);
        }
        return { text, source, ocrConfidence: conf, image: keep(src) };
      },
    },
    // Esempio per il backend: stessa forma di risposta. Non usato finché GA.config.scan.extractor è "local".
    remote: {
      name: "remote",
      async extract(file, onP) {
        const src = file.type === "application/pdf" ? null : await toBitmap(file); const img = src ? keep(src) : null;
        onP({ status: "upload" });
        const base = (GA.config.storage || {}).restBaseUrl || "/api";
        const r = await fetch(base + "/scan", { method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer " + (localStorage.getItem("ga_token") || "") }, body: JSON.stringify({ image: img && img.dataUrl, name: file.name, lang: langsFor() }) });
        if (!r.ok) throw Object.assign(new Error("remote"), { code: "scanFail" });
        const j = await r.json(); return { text: j.text || "", fields: j.fields, source: "remote", image: img };
      },
    },
  };

  /* ---------- dai campi letti al movimento ---------- */
  const norm = (s) => String(s || "").toUpperCase().replace(/\b(S\.?R\.?L\.?S?|S\.?P\.?A\.?|S\.?N\.?C\.?|S\.?A\.?S\.?|DI|DEL|LA|IL|F\.?LLI)\b/g, "").replace(/[^A-Z0-9\u4e00-\u9fff]/g, "");
  function learn(supplier, piva) {
    const tx = S().tx.filter((x) => x.type === "out" && x.categoryId).slice().sort((a, b) => String(b.date).localeCompare(String(a.date)));
    if (piva) { const h = tx.find((x) => String(x.notes || "").includes(piva)); if (h) return { tx: h, conf: 0.95 }; }
    const n = norm(supplier); if (n.length < 3) return null;
    let h = tx.find((x) => norm(x.desc) === n); if (h) return { tx: h, conf: 0.9 };
    const w = (String(supplier).toUpperCase().match(/[A-Z\u4e00-\u9fff]{4,}/g) || []).filter((x) => !/^(SUPERMERCATO|FARMACIA|BAR|RISTORANTE|SOCIETA|DITTA|SNC|SRL|SPA)$/.test(x));
    h = w.length && tx.find((x) => w.some((k) => String(x.desc || "").toUpperCase().includes(k))); return h ? { tx: h, conf: 0.65 } : null;
  }
  function toTx(res) {
    const f = res.fields, B = S().book, vr = S().vatRates, today = GA.engine.today();
    const c = {}, p = { type: "out", paid: true };
    p.date = f.date.value || today; c.date = f.date.value ? f.date.conf : 0;
    p.gross = f.total.value != null ? f.total.value.toFixed(2) : ""; c.gross = f.total.conf;
    p.desc = f.supplier.value || ""; c.desc = f.supplier.conf;
    const rates = f.rates.value || [], vatV = f.vat.value; const one = rates.length === 1 && vr.find((v) => !v.manual && Math.round(v.pct * 100) === rates[0]);
    const man = vr.find((v) => v.manual);
    if (one && (vatV == null || f.vat.conf < 0.9 || Math.abs((f.total.value - f.total.value / (1 + one.pct)) - vatV) < 0.03)) { p.vatId = one.id; c.vatId = Math.min(f.rates.conf, Math.max(f.vat.conf, 0.6)); }
    else if (vatV != null && man) { p.vatId = man.id; p.vatManual = vatV.toFixed(2); c.vatId = f.vat.conf; }
    else { p.vatId = B.vatDefaultOut; c.vatId = 0; }
    const L = learn(f.supplier.value, f.piva.value);
    if (L) { p.categoryId = L.tx.categoryId; if (L.tx.dedId) p.dedId = L.tx.dedId; if (L.tx.deptId) p.deptId = L.tx.deptId; c.categoryId = L.conf; } else { p.categoryId = ""; c.categoryId = 0; }
    const accs = S().accounts.filter((a) => a.active !== false); const byKind = (k) => (accs.find((a) => a.icon === k) || {}).id;
    const pay = f.payment.value;
    const acc = pay === "cash" ? B.closingAccCash || byKind("cash") : pay ? B.closingAccPos || byKind("bank") : null;
    if (acc && accs.some((a) => a.id === acc)) { p.accountId = acc; c.accountId = f.payment.conf; } else if (L && L.tx.accountId) { p.accountId = L.tx.accountId; c.accountId = 0.5; } else c.accountId = 0;
    p.ref = f.number.value || ""; c.ref = f.number.value ? f.number.conf : 0.5;
    const notes = [f.piva.value ? "P.IVA " + f.piva.value : "", pay ? t("sc.pay_" + pay) : ""].filter(Boolean).join(" · "); p.notes = notes;
    p._scan = { conf: c, text: res.text, source: res.source, image: res.image, learned: !!L, rows: res.rows || [], vat: vatV, rates };
    return p;
  }

  /* ---------- flusso ---------- */
  function progress(msg, pct) {
    const box = $("#scanProg");
    if (!box) U().modal(`<div class="scan-prog" id="scanProg">${I("scan")}<b id="scanMsg"></b><div class="scan-bar"><i id="scanBar"></i></div><small class="muted">${t("sc.offline")}</small></div>`, "small");
    $("#scanMsg").textContent = msg; if (pct != null) $("#scanBar").style.width = Math.round(pct * 100) + "%";
  }
  async function start(file, keepPreset, onResult) {
    if (!file) return;
    if (!/^image\//.test(file.type) && file.type !== "application/pdf" && !/\.(pdf|jpe?g|png|webp|heic)$/i.test(file.name || "")) { U().toast(t("sc.badType"), true); return; }
    const ex = extractors[CFG().extractor] || extractors.local;
    progress(t("sc.reading"), 0.05);
    try {
      const out = await ex.extract(file, (m) => {
        if (m.status === "loading tesseract core" || m.status === "loading language traineddata" || m.status === "initializing api") progress(t("sc.loading"), 0.1 + (m.progress || 0) * 0.2);
        else if (m.status === "recognizing text") progress(t("sc.reading"), 0.3 + (m.progress || 0) * 0.7);
        else if (m.status === "pdf") progress(t("sc.reading"), 0.4);
      });
      const parsed = out.fields ? { fields: out.fields, rows: [] } : GA.scanParse.parse(out.text);
      const preset = Object.assign({}, keepPreset || {}, toTx({ fields: parsed.fields, rows: parsed.rows, text: out.text, source: out.source, image: out.image }));
      const read = ["gross", "date", "desc"].filter((k) => preset._scan.conf[k] > 0).length;
      if (!read && !(out.text || "").trim()) U().toast(t("sc.nothing"), true);
      U().closeModal(); if (typeof onResult === "function") onResult(preset); else GA.acc.txForm(null, preset);
    } catch (e) {
      U().closeModal(); U().toast(e.code === "scanFile" ? t("sc.needHttp") : e.code === "scanImage" ? t("sc.badType") : t("sc.fail"), true);
      if (window.console) console.warn("scan", e);
    }
  }
  /* pulsanti: fotocamera (capture) e file/PDF */
  const buttons = (cls) => `<div class="scan-row ${cls || ""}">
      <label class="btn scan-btn" data-scanbtn="camera">${I("camera")}<span>${t("sc.camera")}</span><input type="file" accept="image/*" capture="environment" data-scan hidden></label>
      <label class="btn scan-btn" data-scanbtn="file">${I("file")}<span>${t("sc.file")}</span><input type="file" accept="image/*,application/pdf,.pdf" data-scan hidden></label></div>`;
  function bindInputs(root, presetFn, onResult) {
    root.querySelectorAll("input[data-scan]").forEach((inp) => inp.addEventListener("change", () => { const f = inp.files && inp.files[0]; inp.value = ""; if (f) start(f, presetFn ? presetFn() : null, onResult); }));
  }
  function sheet() {
    const m = U().modal(`${U().mhead(t("sc.title"))}<p class="muted small">${t("sc.intro")}</p>${buttons("big")}<p class="muted small">${t("sc.privacy")}</p>`, "small");
    m.addEventListener("click", (e) => { if (e.target.closest("[data-close]")) U().closeModal(); }); bindInputs(m);
  }
  async function view(id, back) {
    const a = await api.attachments.get(id).catch(() => null);
    const m = U().modal(`${U().mhead(t("sc.photo"))}${a ? `<div class="scan-view"><img src="${a.dataUrl}" alt="${esc(t("sc.photo"))}"></div><p class="muted small">${a.w || ""}×${a.h || ""} · ${Math.round((a.size || a.dataUrl.length * 0.75) / 1024)} KB</p>` : `<p class="muted">${t("sc.missing")}</p>`}
      <div class="actions"><span class="sp"></span><button type="button" class="btn" data-back>${t("a.close")}</button></div>`, "sheet");
    m.addEventListener("click", (e) => { if (e.target.closest("[data-close],[data-back]")) { U().closeModal(); if (back) back(); } });
  }
  async function saveImage(img) {
    return api.attachments.put({ type: "image/jpeg", name: "scan.jpg", dataUrl: img.dataUrl, w: img.w, h: img.h, size: Math.round(img.dataUrl.length * 0.75), source: "scan" });
  }
  async function extractText(file) { const ex = extractors[CFG().extractor] || extractors.local; return ex.extract(file, () => {}); } // usata dai test di accuratezza

  GA.scan = { start, sheet, buttons, bindInputs, view, saveImage, toTx, extractors, extractText, preprocess };
})();
