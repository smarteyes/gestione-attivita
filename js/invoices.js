/* =========================================================
 * FATTURE DA PAGARE: elenco, modulo, scansione, segno pagata.
 * Ogni fattura è collegata a una spesa pianificata in Movimenti (liquidità sì, netto no).
 * ========================================================= */
window.GA = window.GA || {};
(function () {
  const U = () => GA.ui, t = (p, v) => GA.t(p, v), I = GA.icon, api = GA.api, E = GA.engine;
  const S = () => U().S, esc = (v) => U().esc(v), $ = (s, el = document) => el.querySelector(s), $$ = (s, el = document) => Array.from(el.querySelectorAll(s));
  const M = (v) => U().money(v);
  const today = () => E.today();
  const catOf = (id) => S().categories.find((c) => c.id === id);
  const accOf = (id) => S().accounts.find((a) => a.id === id);
  const canEdit = (r) => U().isAdmin() || r.createdBy === S().user.id;
  const remaining = (inv) => E.invoiceRemaining(inv);
  const dueState = (inv) => E.invoiceDueState(inv, today());

  function foldSupplier(s) {
    return String(s || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[''`´]/g, "")
      .replace(/[.\/,&-]+/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .toLowerCase();
  }
  function normSupplier(s) {
    return foldSupplier(s)
      .replace(/\b(?:s r l(?:\s?s)?|srls?|s p a|spa|s n c|snc|s a s|sas|ltd|limited|gmbh)\s*$/, "")
      .replace(/\s+/g, " ")
      .trim();
  }
  function supplierMatch(name, q) {
    const qf = foldSupplier(q);
    if (!qf) return true;
    const nf = foldSupplier(name);
    if (nf.includes(qf)) return true;
    const qn = normSupplier(q), nn = normSupplier(name);
    return !!(qn && nn && (nn === qn || nn.includes(qn) || qn.includes(nn)));
  }
  function supplierOptions(list) {
    const map = new Map();
    (list || []).forEach((inv) => {
      const raw = String(inv.supplier || "").trim();
      if (!raw) return;
      const k = normSupplier(raw) || foldSupplier(raw);
      const cur = map.get(k);
      if (!cur) map.set(k, { name: raw, n: 1 });
      else {
        cur.n++;
        if (raw.length < cur.name.length) cur.name = raw;
      }
    });
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name, "it", { sensitivity: "base" }));
  }

  function filterList(tab, q) {
    const list = (S().invoices || []).slice();
    return list.filter((inv) => {
      const st = dueState(inv);
      if (tab === "paid" && st !== "paid") return false;
      if (tab === "overdue" && st !== "overdue") return false;
      if (tab === "open" && st === "paid") return false;
      return supplierMatch(inv.supplier, q);
    }).sort((a, b) => {
      const pa = dueState(a) === "paid", pb = dueState(b) === "paid";
      if (pa !== pb) return pa ? 1 : -1;
      return String(a.dueDate || a.invoiceDate || "").localeCompare(String(b.dueDate || b.invoiceDate || "")) || String(a.supplier || "").localeCompare(String(b.supplier || ""));
    });
  }

  function view(parts) {
    const tab = ["open", "overdue", "paid", "all"].includes(parts[1]) ? parts[1] : "open";
    S()._invTab = tab;
    const q = S()._invQ || "";
    const all = S().invoices || [];
    const rows = filterList(tab, q);
    const tot = E.invoiceTotals(q ? rows : all, today());
    const sumGross = Math.round(rows.reduce((s, inv) => s + Number(inv.gross || 0), 0) * 100) / 100;
    const tabs = [["open", "inv.open"], ["overdue", "inv.overdue"], ["paid", "inv.paid"], ["all", "inv.all"]];
    const opts = supplierOptions(all);
    const totals = q
      ? `<div><span class="label">${t("dash.total")}</span><b>${M(sumGross)}</b><small class="muted">${t("inv.found", { n: String(rows.length), v: M(sumGross) })}</small></div>
        <div><span class="label">${t("inv.toPay")}</span><b>${M(tot.toPay)}</b></div>`
      : `<div><span class="label">${t("inv.toPay")}</span><b>${M(tot.toPay)}</b></div>
        <div><span class="label">${t("inv.overdueTot")}</span><b class="${tot.overdue ? "neg" : ""}">${M(tot.overdue)}</b><small class="muted">${tot.nOverdue} ${t("inv.overdue").toLowerCase()}</small></div>`;
    const filters = all.length ? `<div class="filters card inv-filters">
        <input type="search" data-invq list="invSuppliers" placeholder="${t("inv.search")}" value="${esc(q)}" autocomplete="off" enterkeyhint="search">
        <datalist id="invSuppliers">${opts.map((o) => `<option value="${esc(o.name)}"></option>`).join("")}</datalist>
        <select data-invsup aria-label="${t("inv.supplier")}"><option value="">${t("inv.allSuppliers")}</option>
          ${opts.map((o) => `<option value="${esc(o.name)}" ${normSupplier(o.name) && normSupplier(o.name) === normSupplier(q) ? "selected" : ""}>${esc(o.name)}</option>`).join("")}</select>
      </div>` : "";
    const empty = `<div class="card empty-state">${I("receipt", "big")}<p>${t(q ? "inv.noMatch" : "inv.empty")}</p>${q ? "" : `<button class="btn primary" data-invnew>${I("plus")}${t("inv.new")}</button>`}</div>`;
    return `<header class="page-head"><h1>${t("inv.title")}</h1><div class="head-actions">
        <button type="button" class="btn ghost sm" data-invscan>${I("camera")}<span>${t("inv.scan")}</span></button>
        <button type="button" class="btn primary sm" data-invnew>${I("plus")}<span>${t("inv.new")}</span></button>
      </div></header>
      <div class="totals card inv-totals">${totals}</div>
      ${filters}
      <div class="seg scroll">${tabs.map(([k, l]) => `<a href="#/invoices/${k}" class="${tab === k ? "on" : ""}">${t(l)}</a>`).join("")}</div>
      ${rows.length ? `<div class="card list inv-list">${rows.map(row).join("")}</div>` : empty}`;
  }

  function row(inv) {
    const st = dueState(inv);
    const rem = remaining(inv);
    const due = inv.dueDate ? U().fmtDate(inv.dueDate, { weekday: "short", day: "numeric", month: "short" }) : "—";
    const sub = [inv.number ? t("inv.number") + " " + inv.number : "", due, inv.paidDate ? t("inv.paidOn", { d: U().fmtDate(inv.paidDate) }) : ""].filter(Boolean).join(" · ");
    const showPay = st !== "paid" && canEdit(inv);
    return `<div class="li inv-row ${st}" data-invid="${inv.id}">
      <span class="tx-ic out">${I("receipt")}</span>
      <div class="li-main"><b>${esc(inv.supplier || t("inv.supplier"))}</b><small>${esc(sub)}</small></div>
      <div class="li-side inv-amt"><b class="${st === "overdue" ? "neg" : ""}">${M(st === "paid" ? inv.gross : rem)}</b>
        ${st !== "paid" && rem < Number(inv.gross) - 0.004 ? `<small class="muted">${t("inv.remaining")}</small>` : ""}
        ${showPay ? `<button type="button" class="btn sm" data-invpay="${inv.id}">${I("check", "xs")}<span>${t("inv.markPaid")}</span></button>` : ""}
      </div></div>`;
  }

  function form(id, preset) {
    const old = id ? (S().invoices || []).find((x) => x.id === id) : null;
    const B = S().book;
    const r = Object.assign({
      supplier: "", number: "", invoiceDate: today(), dueDate: today(),
      gross: "", vat: "", vatId: B.vatDefaultOut, vatManual: "", dedId: B.dedDefault,
      categoryId: "", accountId: (S().accounts.find((a) => a.active !== false) || {}).id,
      notes: "", attachmentId: "",
    }, old || {}, preset || {});
    if (preset && preset.gross != null) r.gross = preset.gross;
    const ro = old && !canEdit(old) ? "disabled" : "";
    const cats = S().categories.filter((c) => c.type === "out" && (c.active !== false || c.id === r.categoryId));
    const accs = S().accounts.filter((a) => a.active !== false || a.id === r.accountId);
    const sc = r._scan;
    const m = U().modal(`${U().mhead(sc ? t("sc.review") : old ? t("inv.edit") : t("inv.new"))}
      <form id="invForm" class="stack">
        ${sc ? `<div class="scan-head">${sc.image ? `<button type="button" class="scan-thumb" data-zoom aria-label="${t("sc.photo")}"><img src="${sc.image.dataUrl}" alt=""></button>` : ""}<div><b>${t("sc.reviewHint")}</b></div></div>` : ""}
        ${!old ? GA.scan.buttons() : ""}
        ${r.attachmentId && !sc ? `<button type="button" class="btn ghost scan-see" data-invphoto>${I("clip")}${t("inv.attach")}</button>` : ""}
        <label>${t("inv.supplier")} *<input name="supplier" required value="${esc(r.supplier)}" list="invFormSuppliers" autocomplete="off" ${ro}></label>
        <datalist id="invFormSuppliers">${supplierOptions(S().invoices).map((o) => `<option value="${esc(o.name)}"></option>`).join("")}</datalist>
        <div class="form-grid">
          <label>${t("inv.number")}<input name="number" value="${esc(r.number)}" ${ro}></label>
          <label>${t("inv.invoiceDate")} *<input type="date" name="invoiceDate" required value="${esc(r.invoiceDate)}" ${ro}></label>
          <label>${t("inv.dueDate")} *<input type="date" name="dueDate" required value="${esc(r.dueDate || r.invoiceDate)}" ${ro}></label>
          <label class="amount-in">${t("inv.gross")} *<input name="gross" type="number" inputmode="decimal" step="0.01" min="0.01" required value="${esc(r.gross)}" ${ro}></label>
          <label>${t("inv.vat")}<input name="vat" type="number" inputmode="decimal" step="0.01" min="0" value="${esc(r.vat)}" ${ro}></label>
          <label>${t("tx.vat")}<select name="vatId" ${ro}>${S().vatRates.map((v) => `<option value="${v.id}" ${v.id === r.vatId ? "selected" : ""}>${esc(v.name)}</option>`).join("")}</select></label>
          <label>${t("tx.ded")}<select name="dedId" ${ro}>${S().dedRates.map((d) => `<option value="${d.id}" ${d.id === r.dedId ? "selected" : ""}>${esc(d.name)}</option>`).join("")}</select></label>
          <label class="full">${t("inv.category")}<select name="categoryId" ${ro}><option value="">${t("tx.noCat")}</option>${cats.map((c) => `<option value="${c.id}" ${c.id === r.categoryId ? "selected" : ""}>${esc(c.name)}</option>`).join("")}</select></label>
          <label class="full">${t("inv.account")}<select name="accountId" required ${ro}>${accs.map((a) => `<option value="${a.id}" ${a.id === r.accountId ? "selected" : ""}>${esc(a.name)}</option>`).join("")}</select></label>
          <label class="full">${t("inv.notes")}<input name="notes" value="${esc(r.notes)}" ${ro}></label>
        </div>
        <div class="form-err" id="invErr"></div>
        <div class="actions">${old && canEdit(old) ? `<button type="button" class="btn danger-ghost" data-invdel>${t("a.delete")}</button>` : ""}<span class="sp"></span>
          <button type="button" class="btn" data-close>${t("a.cancel")}</button>${ro ? "" : `<button class="btn primary">${t("a.save")}</button>`}</div>
      </form>`, "sheet");
    m.addEventListener("click", (e) => {
      if (e.target.closest("[data-close]")) U().closeModal();
      if (e.target.closest("[data-zoom]") && sc && sc.image) { /* thumb already visible */ }
      if (e.target.closest("[data-invphoto]") && r.attachmentId) GA.scan.view(r.attachmentId, () => form(id, r));
      if (e.target.closest("[data-invdel]")) {
        U().confirmBox(t("inv.confirmDel")).then(async (ok) => {
          if (!ok) return;
          try { await api.invoices.remove(id); U().closeModal(); U().toast(t("m.deleted")); U().refresh(); }
          catch (er) { $("#invErr", m).textContent = U().errMsg(er); }
        });
      }
    });
    GA.scan.bindInputs(m, () => Object.fromEntries(new FormData($("#invForm", m))), (preset) => { U().closeModal(); openFromScan(preset, old && old.id); });
    $("#invForm", m).onsubmit = async (e) => {
      e.preventDefault();
      const d = Object.fromEntries(new FormData(e.target));
      d.gross = d.gross; d.vat = d.vat;
      if (old) d.id = old.id;
      if (old) { d.txId = old.txId; d.paidAmount = old.paidAmount; d.status = old.status; d.paidDate = old.paidDate; d.paidAccountId = old.paidAccountId; d.payTxIds = old.payTxIds; d.attachmentId = old.attachmentId; }
      try {
        if (sc && sc.image && !d.attachmentId) {
          d.attachmentId = await GA.scan.saveImage(sc.image);
        }
        await api.invoices.save(d);
        U().closeModal(); U().toast(t("inv.saved")); U().refresh();
      } catch (er) { $("#invErr", m).textContent = U().errMsg(er); }
    };
  }

  function openFromScan(preset, id) {
    const p = {
      supplier: preset.desc || "",
      number: preset.ref || "",
      invoiceDate: preset.date || today(),
      dueDate: preset.date || today(),
      gross: preset.gross || "",
      vat: preset.vatManual || (preset._scan && preset._scan.vat != null ? preset._scan.vat : ""),
      vatId: preset.vatId, vatManual: preset.vatManual, dedId: preset.dedId,
      categoryId: preset.categoryId, accountId: preset.accountId, notes: preset.notes || "",
      _scan: preset._scan,
    };
    form(id || null, p);
  }

  function payForm(id) {
    const inv = (S().invoices || []).find((x) => x.id === id); if (!inv) return;
    const rem = remaining(inv);
    const accs = S().accounts.filter((a) => a.active !== false);
    const defAcc = inv.accountId || (accs[0] || {}).id;
    const m = U().modal(`${U().mhead(t("inv.markPaid"))}
      <form id="invPayForm" class="stack">
        <p class="hint">${esc(inv.supplier || "")}${inv.number ? " · " + esc(inv.number) : ""} · <b>${M(rem)}</b> ${t("inv.remaining").toLowerCase()}</p>
        <label>${t("inv.payDate")}<input type="date" name="date" required value="${today()}"></label>
        <label>${t("inv.payAccount")}<select name="accountId">${accs.map((a) => `<option value="${a.id}" ${a.id === defAcc ? "selected" : ""}>${esc(a.name)}</option>`).join("")}</select></label>
        <label>${t("inv.payAmount")}<input type="number" name="amount" inputmode="decimal" step="0.01" min="0.01" max="${rem}" required value="${rem}"></label>
        <p class="muted small">${t("inv.partialHint")}</p>
        <div class="form-err" id="invPayErr"></div>
        <div class="actions"><span class="sp"></span><button type="button" class="btn" data-close>${t("a.cancel")}</button><button class="btn primary">${I("check", "xs")}${t("inv.markPaid")}</button></div>
      </form>`, "sheet");
    m.addEventListener("click", (e) => { if (e.target.closest("[data-close]")) U().closeModal(); });
    $("#invPayForm", m).onsubmit = async (e) => {
      e.preventDefault();
      const d = Object.fromEntries(new FormData(e.target));
      try {
        await api.invoices.markPaid(id, { date: d.date, accountId: d.accountId, amount: d.amount });
        U().closeModal(); U().toast(t("inv.marked")); U().refresh();
      } catch (er) { $("#invPayErr", m).textContent = U().errMsg(er); }
    };
  }

  function homeCard() {
    const list = S().invoices || [];
    const tot = E.invoiceTotals(list, today());
    if (!tot.nOpen) return "";
    return `<a class="card inv-home" href="#/invoices/open"><span class="tx-ic out">${I("receipt")}</span>
      <span class="grow"><b>${t("inv.homeTitle")}</b><small>${t("inv.homeLine", { v: M(tot.toPay), n: String(tot.nOverdue) })}</small></span>
      ${I("right", "chev")}</a>`;
  }

  function bind(main) {
    const qEl = $("[data-invq]", main);
    if (qEl) qEl.addEventListener("input", () => {
      S()._invQ = qEl.value;
      clearTimeout(S()._invQt);
      S()._invQt = setTimeout(() => U().route().then(() => {
        const s = $("[data-invq]"); if (!s) return; s.focus(); const n = s.value.length; s.setSelectionRange(n, n);
      }), 250);
    });
    const sel = $("[data-invsup]", main);
    if (sel) sel.addEventListener("change", () => { S()._invQ = sel.value; U().route(); });
    main.addEventListener("click", (e) => {
      const el = (s) => e.target.closest(s);
      if (el("[data-invnew]")) { e.stopPropagation(); return form(null); }
      if (el("[data-invscan]")) {
        e.stopPropagation();
        const sh = U().modal(`${U().mhead(t("inv.scan"))}<p class="muted small">${t("sc.intro")}</p>${GA.scan.buttons("big")}<p class="muted small">${t("sc.privacy")}</p>`, "small");
        sh.addEventListener("click", (ev) => { if (ev.target.closest("[data-close]")) U().closeModal(); });
        GA.scan.bindInputs(sh, null, (preset) => { U().closeModal(); openFromScan(preset); });
        return;
      }
      const pay = el("[data-invpay]");
      if (pay) { e.stopPropagation(); return payForm(pay.dataset.invpay); }
      const rowEl = el("[data-invid]");
      if (rowEl) return form(rowEl.dataset.invid);
    });
  }

  GA.invoicesUI = { view, bind, form, payForm, homeCard, openFromScan, normSupplier, supplierMatch };
})();
