/* =========================================================
 * Importa estratto conto in Movimenti (PDF BPER via pdf.js, oppure CSV/Excel).
 * Nulla viene salvato senza conferma nella schermata di revisione.
 * ========================================================= */
window.GA = window.GA || {};
(function () {
  const U = () => GA.ui, t = (p, v) => GA.t(p, v), I = GA.icon, api = GA.api, E = GA.engine, P = () => GA.bankParse;
  const S = () => U().S, esc = (v) => U().esc(v), $ = (s, el = document) => el.querySelector(s), $$ = (s, el = document) => Array.from(el.querySelectorAll(s));
  const M = (v) => U().money(v);
  const BASE = () => new URL(".", location.href).href;
  const loaded = {};
  const loadScript = (src) => loaded[src] || (loaded[src] = new Promise((res, rej) => { const s = document.createElement("script"); s.src = src; s.onload = res; s.onerror = () => { delete loaded[src]; rej(new Error("load " + src)); }; document.head.appendChild(s); }));

  async function pdfPages(file) {
    const v = BASE() + "vendor/pdfjs/";
    await loadScript(v + "pdf.min.js");
    const L = window.pdfjsLib;
    L.GlobalWorkerOptions.workerSrc = v + "pdf.worker.min.js";
    const doc = await L.getDocument({ data: new Uint8Array(await file.arrayBuffer()), isEvalSupported: false }).promise;
    const pages = [];
    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i);
      pages.push((await page.getTextContent()).items);
    }
    return pages;
  }
  function parseCsvText(text) {
    const raw = String(text || "").replace(/^\uFEFF/, "");
    const first = (raw.split(/\r?\n/).find((l) => l.trim()) || "");
    const delim = (first.split(";").length > first.split(",").length) ? ";" : ",";
    if (window.XLSX) {
      const wb = window.XLSX.read(raw, { type: "string", FS: delim, raw: false });
      const sh = wb.Sheets[wb.SheetNames[0]];
      return window.XLSX.utils.sheet_to_json(sh, { header: 1, raw: false, defval: "" });
    }
    return raw.split(/\r?\n/).map((l) => l.split(delim).map((c) => c.replace(/^"|"$/g, "").replace(/""/g, "\"").trim()));
  }
  async function parseFile(file) {
    const name = file.name || "";
    const isPdf = file.type === "application/pdf" || /\.pdf$/i.test(name);
    const isSheet = /\.(xlsx|xls|csv)$/i.test(name) || /spreadsheet|csv/.test(file.type || "");
    if (isPdf) {
      const pages = await pdfPages(file);
      return P().parseItemPages(pages);
    }
    if (isSheet) {
      let matrix;
      if (/\.csv$/i.test(name) || (file.type || "").indexOf("csv") >= 0) matrix = parseCsvText(await file.text());
      else {
        if (!window.XLSX) throw Object.assign(new Error("xlsx"), { code: "format" });
        const wb = window.XLSX.read(await file.arrayBuffer(), { type: "array", raw: false, cellDates: true });
        const sh = wb.Sheets[wb.SheetNames[0]];
        matrix = window.XLSX.utils.sheet_to_json(sh, { header: 1, raw: false, defval: "", dateNF: "dd/mm/yyyy" });
      }
      return P().parseTable(matrix);
    }
    throw Object.assign(new Error("format"), { code: "format" });
  }

  function defBankAccount() {
    const accs = (S().accounts || []).filter((a) => a.active !== false && a.kind !== "card");
    return accs.find((a) => /banca|bank|bper/i.test(a.name || "")) || accs.find((a) => a.id === "acc-bank") || accs[0] || (S().accounts || [])[0];
  }
  function catOptions(type, sel) {
    return (S().categories || []).filter((c) => c.type === type && (c.active !== false || c.id === sel)).map((c) => `<option value="${esc(c.id)}" ${c.id === sel ? "selected" : ""}>${esc(c.name)}</option>`).join("");
  }
  function alreadyHash(hash) {
    return ((S().book || {}).importedStatements || []).find((x) => x && x.hash === hash) || null;
  }

  function review(parsed, file, hash) {
    const acc0 = defBankAccount() || {};
    const v = P().validateStatement(parsed);
    const prev = alreadyHash(hash);
    const rows = P().matchAll(parsed.movements, { transactions: S().tx, invoices: S().invoices, accountId: acc0.id });
    rows.forEach((r) => { r.categoryId = P().guessCategory(r.mov, S().categories); });
    const accs = (S().accounts || []).filter((a) => a.active !== false);
    const period = parsed.meta.periodEnd || parsed.summary.closingDate || "";
    const warn = !v.ok;
    const m = U().modal(`${U().mhead(t("bk.title"))}
      <form id="bkForm" class="stack bk-form">
        <p class="muted small">${esc(file.name || "")}${period ? " · " + esc(U().fmtDate(period, { month: "long", year: "numeric" })) : ""}${parsed.meta.iban ? " · " + esc(parsed.meta.iban) : ""}</p>
        <div class="bk-sum card">${v.opening != null ? `<div><span class="label">${t("bk.opening")}</span><b>${M(v.opening)}</b></div>` : ""}
          <div><span class="label">${t("tx.ins")}</span><b>${M(v.sumIn)}</b>${v.totalIn != null && Math.abs(v.dIn) > 0.011 ? `<small class="neg">${t("bk.expected")} ${M(v.totalIn)}</small>` : ""}</div>
          <div><span class="label">${t("tx.outs")}</span><b>${M(v.sumOut)}</b>${v.totalOut != null && Math.abs(v.dOut) > 0.011 ? `<small class="neg">${t("bk.expected")} ${M(v.totalOut)}</small>` : ""}</div>
          ${v.closing != null ? `<div><span class="label">${t("bk.closing")}</span><b>${M(v.closing)}</b></div>` : ""}
        </div>
        ${warn ? `<p class="notice bk-warn">${t("bk.mismatch")}</p>` : ""}
        ${prev ? `<p class="notice bk-warn">${t("bk.already", { d: U().fmtDate((prev.at || "").slice(0, 10)) })}</p>` : ""}
        <label>${t("bk.account")}<select name="accountId">${accs.map((a) => `<option value="${esc(a.id)}" ${a.id === acc0.id ? "selected" : ""}>${esc(a.name)}</option>`).join("")}</select></label>
        <div class="bk-tools"><button type="button" class="btn ghost sm" data-bksel="new">${t("bk.selNew")}</button><button type="button" class="btn ghost sm" data-bksel="none">${t("bk.selNone")}</button><span class="sp"></span><small class="muted" data-bkcount></small></div>
        <div class="bk-list">${rows.map((r, i) => {
          const mv = r.mov, dup = !!r.existing;
          return `<label class="bk-row ${dup ? "dup" : "new"}"><input type="checkbox" data-bki="${i}" ${r.selected ? "checked" : ""}>
            <span class="bk-date">${esc(U().fmtDate(mv.date, { day: "numeric", month: "short" }))}${mv.execDate && mv.execDate !== mv.date ? `<small>${esc(t("bk.exec", { d: U().fmtDate(mv.execDate, { day: "numeric", month: "short" }) }))}</small>` : ""}</span>
            <span class="bk-amt ${mv.amount < 0 ? "neg" : "pos"}">${esc((mv.amount < 0 ? "−" : "+") + M(Math.abs(mv.amount)))}</span>
            <span class="bk-desc" title="${esc(mv.desc)}">${esc(mv.desc)}</span>
            <select data-bkcat="${i}">${catOptions(mv.amount >= 0 ? "in" : "out", r.categoryId)}</select>
            <small class="bk-st">${dup ? esc(t("bk.dup") + (r.existing.label ? ": " + r.existing.label : "")) : esc(t("bk.fresh"))}</small></label>`;
        }).join("")}</div>
        <label class="chk" id="bkAlignBox"><input type="checkbox" name="alignManual"> ${t("bk.alignManual")}${v.closing != null ? " (" + M(v.closing) + ")" : ""}</label>
        <div class="form-err" id="bkErr"></div>
        <div class="actions"><button type="button" class="btn" data-close>${t("a.cancel")}</button><span class="sp"></span><button class="btn primary" id="bkSave">${t("bk.confirm")}</button></div>
      </form>`, "lg");

    const recount = () => {
      const n = $$("[data-bki]", m).filter((c) => c.checked).length;
      const el = $("[data-bkcount]", m); if (el) el.textContent = t("bk.nSel", { n: String(n) });
    };
    recount();
    m.addEventListener("click", (e) => {
      if (e.target.closest("[data-close]")) U().closeModal();
      const sel = e.target.closest("[data-bksel]");
      if (sel) {
        $$("[data-bki]", m).forEach((c, i) => { c.checked = sel.dataset.bksel === "new" ? !rows[i].existing : false; });
        recount();
      }
    });
    m.addEventListener("change", (e) => { if (e.target.matches("[data-bki]")) recount(); });

    $("#bkForm", m).onsubmit = async (e) => {
      e.preventDefault();
      const accId = $("[name=accountId]", m).value;
      const align = $("[name=alignManual]", m).checked;
      const recs = [];
      const B = S().book || {};
      const dept = (S().departments[0] || {}).id || "";
      $$("[data-bki]", m).forEach((c) => {
        if (!c.checked) return;
        const i = +c.dataset.bki, r = rows[i], mv = r.mov;
        const cat = ($("[data-bkcat=\"" + i + "\"]", m) || {}).value || r.categoryId;
        recs.push({
          type: mv.amount >= 0 ? "in" : "out",
          paid: true,
          date: mv.date,
          accountId: accId,
          deptId: dept,
          categoryId: cat || "",
          desc: mv.desc.slice(0, 240),
          notes: [mv.valuta && mv.valuta !== mv.date ? t("bk.valuta") + " " + mv.valuta : "", mv.execDate ? t("bk.exec", { d: mv.execDate }) : ""].filter(Boolean).join(" · "),
          gross: Math.abs(mv.amount),
          vatId: mv.amount >= 0 ? B.vatDefaultIn : B.vatDefaultOut,
          dedId: B.dedDefault || "",
          ref: "",
        });
      });
      try {
        if (recs.length) await api.transactions.bulk(recs);
        if (hash && U().isAdmin()) {
          const list = ((S().book || {}).importedStatements || []).slice(-23).concat([{ hash, at: new Date().toISOString(), n: recs.length, period, name: file.name || "", accountId: accId }]);
          try { await api.book.set({ importedStatements: list }); } catch (er) { /* non bloccare l'import se manca il permesso */ }
        }
        if (align && v.closing != null) {
          const acc = (S().accounts || []).find((a) => a.id === accId);
          if (acc && U().isAdmin()) {
            try { await api.accounts.save(Object.assign({}, acc, { manual: v.closing })); } catch (er) { /* stesso */ }
          }
        }
        U().closeModal();
        U().toast(t("bk.saved", { n: String(recs.length) }));
        U().refresh();
      } catch (er) { $("#bkErr", m).textContent = U().errMsg(er); }
    };
  }

  function open() {
    const inp = document.createElement("input");
    inp.type = "file";
    inp.accept = "application/pdf,.pdf,text/csv,.csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,.xlsx,.xls";
    inp.onchange = async () => {
      const file = inp.files && inp.files[0];
      if (!file) return;
      const wait = U().modal(`${U().mhead(t("bk.title"))}<p class="muted">${t("bk.reading")}</p>`, "sm");
      try {
        const buf = new Uint8Array(await file.arrayBuffer());
        const hash = await P().hashBytes(buf);
        /* rilesgo il file: arrayBuffer già consumato su alcuni browser, uso buf */
        const file2 = new File([buf], file.name, { type: file.type });
        const parsed = await parseFile(file2);
        U().closeModal();
        if (!parsed.movements.length) { U().toast(t("bk.empty"), true); return; }
        review(parsed, file, hash);
      } catch (er) {
        U().closeModal();
        U().toast(U().errMsg(er), true);
      }
    };
    inp.click();
  }

  GA.bankImportUI = { open };
})();
