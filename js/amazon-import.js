/* =========================================================
 * Importa ordini Amazon Business in Movimenti.
 * Nulla viene salvato senza conferma nella schermata di revisione.
 * ========================================================= */
window.GA = window.GA || {};
(function () {
  const U = () => GA.ui, t = (p, v) => GA.t(p, v), I = GA.icon, api = GA.api, E = GA.engine, P = () => GA.amazonParse;
  const S = () => U().S, esc = (v) => U().esc(v), $ = (s, el = document) => el.querySelector(s), $$ = (s, el = document) => Array.from(el.querySelectorAll(s));
  const M = (v) => U().money(v);
  let chart = null;

  function destroyChart() { if (chart) { try { chart.destroy(); } catch (e) {} chart = null; } }

  function selectable(keepId) {
    return (E.selectableAccounts ? E.selectableAccounts(S().accounts, keepId) : (S().accounts || []).filter((a) => a.active !== false));
  }
  function defAccount() {
    const accs = selectable();
    return (E.defaultAccountId && accs.find((a) => a.id === E.defaultAccountId(accs))) || accs.find((a) => /banca|bank|bper/i.test(a.name || "")) || accs.find((a) => a.id === "acc-bank") || accs[0] || {};
  }
  function catOptions(sel) {
    return `<option value="">${esc(t("tx.noCat"))}</option>` + (S().categories || []).filter((c) => c.type === "out" && (c.active !== false || c.id === sel)).map((c) => `<option value="${esc(c.id)}" ${c.id === sel ? "selected" : ""}>${esc(c.name)}</option>`).join("");
  }
  function importedIds() {
    return ((S().book || {}).importedAmazonOrders || []).map((x) => x && x.id).filter(Boolean);
  }

  function titlesOf(o) {
    return (o.items || []).map((it) => (it.qty && it.qty !== 1 ? it.qty + "× " : "") + (it.title || "")).filter(Boolean).join("; ");
  }
  function orderDesc(o) {
    const titles = titlesOf(o);
    return ("Amazon" + (titles ? " · " + titles : (o.id ? " · " + o.id : ""))).slice(0, 240);
  }
  function orderNotes(o) {
    const lines = ["Amazon " + o.id];
    if (o.date) lines.push("Ordine " + o.date);
    if (o.paymentDate && o.paymentDate !== o.date) lines.push("Pagamento " + o.paymentDate);
    if (o.paymentMethod && !/^n\/a$/i.test(o.paymentMethod)) lines.push(o.paymentMethod);
    (o.items || []).forEach((it) => {
      const bits = [];
      if (it.qty && it.qty !== 1) bits.push(it.qty + "×");
      if (it.title) bits.push(it.title);
      if (it.category) bits.push(it.category);
      if (it.net != null) bits.push(String(it.net));
      if (bits.length) lines.push(bits.join(" · "));
    });
    return lines.join("\n").slice(0, 1500);
  }
  function mergeNotes(prev, add) {
    const a = String(prev || "").trim(), b = String(add || "").trim();
    if (!a) return b;
    if (!b || a.indexOf(b) >= 0) return a;
    return (a + "\n" + b).slice(0, 1500);
  }

  async function parseFile(file) {
    const name = file.name || "";
    const isCsv = /\.csv$/i.test(name) || (file.type || "").indexOf("csv") >= 0;
    let matrix;
    if (isCsv || /\.txt$/i.test(name)) {
      matrix = P().parseCsv(await file.text());
    } else {
      if (!window.XLSX) throw Object.assign(new Error("xlsx"), { code: "format" });
      const wb = window.XLSX.read(await file.arrayBuffer(), { type: "array", raw: false, defval: "", dateNF: "dd/mm/yyyy" });
      const sh = wb.Sheets[wb.SheetNames[0]];
      matrix = window.XLSX.utils.sheet_to_json(sh, { header: 1, raw: false, defval: "", dateNF: "dd/mm/yyyy" });
    }
    if (P().detectMatrix(matrix) < 0) throw Object.assign(new Error("not-amazon"), { code: "not-amazon" });
    return P().parseMatrix(matrix);
  }

  function statusLabel(row) {
    const o = row.order;
    if (o.flag === "cancelled") return t("amz.cancelled");
    if (o.flag === "returned") return t("amz.returned");
    if (row.action === "enrich" && row.existing) return t("amz.enrich") + (row.existing.date || row.existing.label ? " — " + t("amz.enrichHint", { d: U().fmtDate(row.existing.date || o.date), desc: row.existing.label || "" }) : "");
    if (row.existing) return t("amz.dup") + (row.existing.label && row.existing.label !== o.id ? ": " + row.existing.label : "");
    if (o.flag === "pending") return t("amz.pending") + " · " + t("amz.fresh");
    return t("amz.fresh");
  }

  function review(parsed, file) {
    destroyChart();
    const acc0 = defAccount();
    const accs = selectable();
    const B = S().book || {};
    const vatRates = S().vatRates || [];
    const cats = S().categories || [];
    const sum = P().summarize(parsed.orders);
    const rows = P().matchOrders(parsed.orders, { transactions: S().tx, importedIds: importedIds() });
    rows.forEach((r) => {
      const vat = P().pickVat(r.order, vatRates);
      r.categoryId = P().guessCategory(r.order, cats);
      r.vatId = vat.vatId;
      r.vatManual = vat.vatManual;
    });
    const already = rows.some((r) => r.existing && r.action === "skip");
    const period = sum.periodFrom && sum.periodTo
      ? (sum.periodFrom === sum.periodTo ? U().fmtDate(sum.periodFrom) : U().fmtDate(sum.periodFrom) + " – " + U().fmtDate(sum.periodTo))
      : "";

    const m = U().modal(`${U().mhead(t("amz.title"))}
      <form id="amzForm" class="stack bk-form">
        <p class="muted small">${esc(file && file.name || "")}${period ? " · " + esc(period) : ""}</p>
        <div class="bk-sum card">
          <div><span class="label">${t("amz.orders")}</span><b>${sum.nOrders}</b>${sum.nCancelled ? `<small>${esc(t("amz.cancelled"))}: ${sum.nCancelled}</small>` : ""}${sum.nPending ? `<small>${esc(t("amz.pending"))}: ${sum.nPending}</small>` : ""}</div>
          <div><span class="label">${t("amz.items")}</span><b>${sum.nItems}</b></div>
          <div><span class="label">${t("amz.net")}</span><b>${M(sum.net)}</b></div>
          <div><span class="label">${t("amz.vat")}</span><b>${M(sum.vat)}</b></div>
          <div><span class="label">${t("amz.total")}</span><b>${M(sum.gross)}</b></div>
        </div>
        <div class="amz-cat card">
          <span class="label">${t("amz.byCat")}</span>
          <div class="amz-chart-wrap"><canvas id="amzChart"></canvas></div>
        </div>
        ${already ? `<p class="notice bk-warn">${t("amz.already")}</p>` : ""}
        <label>${t("amz.account")}<select name="accountId">${accs.map((a) => `<option value="${esc(a.id)}" ${a.id === acc0.id ? "selected" : ""}>${esc(a.name)}</option>`).join("")}</select></label>
        <div class="bk-tools"><button type="button" class="btn ghost sm" data-amzsel="new">${t("amz.selNew")}</button><button type="button" class="btn ghost sm" data-amzsel="none">${t("amz.selNone")}</button><span class="sp"></span><small class="muted" data-amzcount></small></div>
        <div class="bk-list amz-list">${rows.map((r, i) => {
          const o = r.order, titles = titlesOf(o);
          const cls = r.action === "create" && !o.flag ? "new" : (r.action === "enrich" ? "enrich" : "dup");
          const catName = (o.items[0] && o.items[0].category) || "";
          return `<label class="bk-row amz-row ${cls}"><input type="checkbox" data-amzi="${i}" ${r.selected ? "checked" : ""}>
            <span class="bk-date">${esc(U().fmtDate(o.date || o.paymentDate, { day: "numeric", month: "short" }))}${o.paymentDate && o.paymentDate !== o.date ? `<small>${esc(t("amz.paidOn", { d: U().fmtDate(o.paymentDate, { day: "numeric", month: "short" }) }))}</small>` : ""}</span>
            <span class="bk-amt neg">${esc("−" + M(o.gross))}</span>
            <span class="bk-desc" title="${esc(titles)}">${esc(titles || o.id)}</span>
            <select data-amzcat="${i}">${catOptions(r.categoryId)}</select>
            <small class="bk-st">${esc(statusLabel(r))}${catName ? " · " + esc(catName) : ""}</small></label>`;
        }).join("")}</div>
        <div class="form-err" id="amzErr"></div>
        <div class="actions"><button type="button" class="btn" data-close>${t("a.cancel")}</button><span class="sp"></span><button class="btn primary" id="amzSave">${t("amz.confirm")}</button></div>
      </form>`, "lg");

    const canvas = $("#amzChart", m);
    if (canvas && window.Chart && sum.byCategory.length) {
      const ink = getComputedStyle(document.body).getPropertyValue("--ink") || "#222";
      const mute = getComputedStyle(document.body).getPropertyValue("--mute") || "#666";
      const accent = getComputedStyle(document.body).getPropertyValue("--accent") || "#0f766e";
      const wrap = canvas.parentElement;
      if (wrap) wrap.style.height = Math.max(120, 28 * sum.byCategory.length + 36) + "px";
      chart = new Chart(canvas, {
        type: "bar",
        data: {
          labels: sum.byCategory.map((c) => c.name || t("amz.noCat")),
          datasets: [{ data: sum.byCategory.map((c) => c.gross), backgroundColor: accent, borderRadius: 3, maxBarThickness: 18 }]
        },
        options: {
          indexAxis: "y", responsive: true, maintainAspectRatio: false, animation: false,
          plugins: { legend: { display: false }, tooltip: { callbacks: { label: (c) => M(c.parsed.x) } } },
          scales: {
            x: { grid: { color: "transparent" }, ticks: { color: mute, font: { size: 10 }, callback: (v) => M(v) } },
            y: { grid: { display: false }, ticks: { color: ink, font: { size: 10 }, autoSkip: false } }
          }
        }
      });
    } else if (canvas && canvas.parentElement) canvas.parentElement.style.display = "none";

    const recount = () => {
      const n = $$("[data-amzi]", m).filter((c) => c.checked).length;
      const el = $("[data-amzcount]", m); if (el) el.textContent = t("amz.nSel", { n: String(n) });
    };
    recount();
    const close = () => { destroyChart(); U().closeModal(); };
    m.addEventListener("click", (e) => {
      if (e.target.closest("[data-close]")) { e.preventDefault(); close(); }
      const sel = e.target.closest("[data-amzsel]");
      if (sel) {
        $$("[data-amzi]", m).forEach((c, i) => {
          const r = rows[i];
          c.checked = sel.dataset.amzsel === "new" ? (r.action === "create" || r.action === "enrich") && r.order.flag !== "cancelled" && r.order.flag !== "returned" && r.action !== "skip" : false;
        });
        recount();
      }
    });
    m.addEventListener("change", (e) => { if (e.target.matches("[data-amzi]")) recount(); });

    $("#amzForm", m).onsubmit = async (e) => {
      e.preventDefault();
      const accId = $("[name=accountId]", m).value;
      const dept = (S().departments[0] || {}).id || "";
      const create = [], enrich = [];
      $$("[data-amzi]", m).forEach((c) => {
        if (!c.checked) return;
        const i = +c.dataset.amzi, r = rows[i], o = r.order;
        const cat = ($("[data-amzcat=\"" + i + "\"]", m) || {}).value || r.categoryId;
        const rec = {
          type: "out", paid: true,
          date: o.paymentDate || o.date,
          accountId: accId, deptId: dept, categoryId: cat || "",
          desc: orderDesc(o), notes: orderNotes(o),
          gross: Math.abs(o.gross), vatId: r.vatId, vatManual: r.vatManual || 0,
          dedId: B.dedDefault || "", ref: o.id
        };
        if (r.action === "enrich" && r.existing && r.existing.id) enrich.push({ rec, existingId: r.existing.id, orderId: o.id });
        else if (r.action !== "skip") create.push({ rec, orderId: o.id });
      });
      try {
        if (create.length) await api.transactions.bulk(create.map((x) => x.rec));
        for (let i = 0; i < enrich.length; i++) {
          const x = enrich[i];
          const tx = (S().tx || []).find((t) => t.id === x.existingId);
          if (!tx) continue;
          await api.transactions.save(Object.assign({}, tx, {
            desc: x.rec.desc, notes: mergeNotes(tx.notes, x.rec.notes),
            ref: x.rec.ref, vatId: x.rec.vatId, vatManual: x.rec.vatManual,
            dedId: tx.dedId || x.rec.dedId, categoryId: x.rec.categoryId || tx.categoryId
          }));
        }
        const ids = create.concat(enrich).map((x) => x.orderId);
        if (ids.length && U().isAdmin()) {
          const seen = new Set();
          const list = ((S().book || {}).importedAmazonOrders || []).filter((x) => x && x.id && !ids.includes(x.id)).slice(-200)
            .concat(ids.filter((id) => { if (seen.has(id)) return false; seen.add(id); return true; }).map((id) => ({ id, at: new Date().toISOString(), name: (file && file.name) || "" })));
          try { await api.book.set({ importedAmazonOrders: list }); } catch (er) { /* non bloccare se manca il permesso */ }
        }
        close();
        const bits = [];
        if (create.length) bits.push(t("amz.saved", { n: String(create.length) }));
        if (enrich.length) bits.push(t("amz.enriched", { n: String(enrich.length) }));
        U().toast(bits.join(" · ") || t("amz.saved", { n: "0" }));
        U().refresh();
      } catch (er) { $("#amzErr", m).textContent = U().errMsg(er); }
    };
  }

  async function handleFile(file) {
    if (!file) return;
    const wait = U().modal(`${U().mhead(t("amz.title"))}<p class="muted">${t("amz.reading")}</p>`, "sm");
    try {
      const parsed = await parseFile(file);
      U().closeModal();
      if (!parsed.orders.length) { U().toast(t("amz.empty"), true); return; }
      review(parsed, file);
    } catch (er) {
      U().closeModal();
      U().toast(er && er.code === "not-amazon" ? t("amz.notAmazon") : U().errMsg(er), true);
    }
  }

  function open() {
    const inp = document.createElement("input");
    inp.type = "file";
    inp.accept = "text/csv,.csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,.xlsx,.xls";
    inp.onchange = () => handleFile(inp.files && inp.files[0]);
    inp.click();
  }

  GA.amazonImportUI = { open, handleFile, review, parseFile };
})();
