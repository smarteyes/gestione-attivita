/* =========================================================
 * Resoconto ordini Amazon Business (CSV/Excel): raggruppamento,
 * IVA, categorie, abbinamenti. Puro, senza DOM: app e test Node.
 * ========================================================= */
(function (root) {
  const HEAD = {
    "data ordine": "orderDate", "order date": "orderDate",
    "numero dellordine": "orderId", "numero dell ordine": "orderId", "order number": "orderId", "order id": "orderId",
    "subtotale ordine": "orderSub", "order subtotal": "orderSub",
    "spedizione e gestione dellordine": "orderShip", "spedizione e gestione dell ordine": "orderShip",
    "order shipping handling": "orderShip", "order shipping and handling": "orderShip", "order shipping": "orderShip",
    "promozione per ordine": "orderPromo", "order promotion": "orderPromo",
    "imposta sullordine": "orderTax", "imposta sull ordine": "orderTax", "order tax": "orderTax",
    "totale netto dellordine": "orderNet", "totale netto dell ordine": "orderNet",
    "order net total": "orderNet", "order total": "orderNet",
    "stato ordine": "orderStatus", "order status": "orderStatus",
    "stato della fattura": "invoiceStatus", "invoice status": "invoiceStatus",
    "importo totale fattura": "invoiceTotal", "invoice total amount": "invoiceTotal", "invoice amount": "invoiceTotal",
    "data di pagamento": "paymentDate", "payment date": "paymentDate",
    "importo pagamento": "paymentAmount", "payment amount": "paymentAmount",
    "tipo di metodo di pagamento": "paymentMethod", "payment method type": "paymentMethod", "payment method": "paymentMethod",
    "amazon categoria prodotto interno": "category", "amazon internal product category": "category",
    "categoria di prodotto": "productCategory", "product category": "productCategory",
    "asin": "asin",
    "titolo": "title", "title": "title",
    "quantita articoli": "qty", "item quantity": "qty", "quantity": "qty",
    "subtotale articoli": "itemSub", "item subtotal": "itemSub",
    "spedizione e gestione dellarticolo": "itemShip", "spedizione e gestione dell articolo": "itemShip",
    "item shipping handling": "itemShip", "item shipping": "itemShip",
    "promozione articolo": "itemPromo", "item promotion": "itemPromo",
    "imposta sullarticolo": "itemTax", "imposta sull articolo": "itemTax", "item tax": "itemTax",
    "totale netto dellarticolo": "itemNet", "totale netto dell articolo": "itemNet", "item net total": "itemNet", "item total": "itemNet",
    "tasso iva del subtotale articoli": "itemVatRate", "item subtotal vat rate": "itemVatRate", "item vat rate": "itemVatRate",
    "valuta": "currency", "currency": "currency"
  };

  function normHead(s) {
    return String(s || "").replace(/^\uFEFF/, "").normalize("NFD").replace(/[\u0300-\u036f]/g, "")
      .toLowerCase().replace(/[''`’]/g, "").replace(/&/g, " ").replace(/[^a-z0-9]+/g, " ").trim();
  }
  function normText(s) {
    return String(s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
  }
  function round2(n) { return Math.round((Number(n) || 0) * 100) / 100; }
  function amtClose(a, b) { return Math.abs(Number(a) - Number(b)) <= 0.011; }
  function daysBetween(a, b) {
    const pa = Date.parse(a + "T00:00:00"), pb = Date.parse(b + "T00:00:00");
    if (isNaN(pa) || isNaN(pb)) return 99;
    return Math.abs(Math.round((pa - pb) / 86400000));
  }
  function isBlank(s) {
    const t = String(s == null ? "" : s).trim();
    return !t || /^n\/a$/i.test(t) || t === "-";
  }

  function parseAmount(s) {
    if (s == null) return null;
    let t = String(s).replace(/[€¤\u20ac]|EUR/gi, "").replace(/[\s\u00a0]/g, "").trim();
    if (!t || /^n\/a$/i.test(t) || t === "-") return null;
    let neg = false;
    if (/^\(.*\)$/.test(t)) { neg = true; t = t.slice(1, -1); }
    if (t[0] === "-") { neg = true; t = t.slice(1); }
    else if (t[0] === "+") t = t.slice(1);
    if (!t) return null;
    if (/^\d{1,3}(?:\.\d{3})*,\d{1,2}$/.test(t) || /^\d+,\d{1,2}$/.test(t)) t = t.replace(/\./g, "").replace(",", ".");
    else if (/^\d{1,3}(?:,\d{3})*\.\d{1,2}$/.test(t)) t = t.replace(/,/g, "");
    else if (/^\d+,\d{1,2}$/.test(t)) t = t.replace(",", ".");
    else if (!/^\d+(\.\d+)?$/.test(t)) return null;
    const v = Number(t);
    if (!Number.isFinite(v)) return null;
    return round2(neg ? -v : v);
  }

  function parseDate(s) {
    const raw = String(s || "").trim();
    if (!raw || /^n\/a$/i.test(raw)) return "";
    let m = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) return validIso(+m[1], +m[2], +m[3]);
    m = raw.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{2}|\d{4})$/);
    if (!m) return "";
    const d = +m[1], mo = +m[2], y = m[3].length === 2 ? 2000 + +m[3] : +m[3];
    return validIso(y, mo, d);
  }
  function validIso(y, mo, d) {
    if (mo < 1 || mo > 12 || d < 1 || d > 31) return "";
    const iso = y + "-" + String(mo).padStart(2, "0") + "-" + String(d).padStart(2, "0");
    const dt = new Date(iso + "T00:00:00");
    if (isNaN(dt) || dt.getDate() !== d) return "";
    return iso;
  }

  function parseRate(s) {
    if (isBlank(s)) return null;
    let t = String(s).trim().replace("%", "").replace(",", ".").replace(/\s/g, "");
    const v = Number(t);
    if (!Number.isFinite(v)) return null;
    const pct = v > 1 + 1e-9 ? v / 100 : v;
    if (pct < 0 || pct > 1) return null;
    return Math.round(pct * 10000) / 10000;
  }

  function detectDelim(s) {
    let comma = 0, semi = 0, q = false;
    const line = s.split("\n")[0] || "";
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (c === "\"") { q = !q; continue; }
      if (q) continue;
      if (c === ",") comma++;
      if (c === ";") semi++;
    }
    return semi > comma ? ";" : ",";
  }

  function parseCsv(text) {
    const s = String(text || "").replace(/^\uFEFF/, "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
    const delim = detectDelim(s);
    const rows = [];
    let row = [], field = "", q = false;
    for (let i = 0; i < s.length; i++) {
      const c = s[i];
      if (q) {
        if (c === "\"") {
          if (s[i + 1] === "\"") { field += "\""; i++; }
          else q = false;
        } else field += c;
      } else if (c === "\"") q = true;
      else if (c === delim) { row.push(field); field = ""; }
      else if (c === "\n") { row.push(field); field = ""; rows.push(row); row = []; }
      else field += c;
    }
    if (q) { row.push(field); rows.push(row); }
    else if (field.length || row.length) { row.push(field); rows.push(row); }
    return rows.filter((r) => r.some((c) => String(c).trim()));
  }

  function mapHeaders(cells) {
    const idx = {};
    (cells || []).forEach((h, i) => {
      const key = HEAD[normHead(h)];
      if (key && idx[key] == null) idx[key] = i;
    });
    return idx;
  }
  function isAmazonHeaders(idx) {
    return !!(idx && idx.orderId != null && (idx.orderDate != null || idx.paymentDate != null)
      && (idx.orderNet != null || idx.itemNet != null || idx.title != null));
  }
  function detectMatrix(matrix) {
    const rows = matrix || [];
    for (let i = 0; i < Math.min(rows.length, 8); i++) {
      if (isAmazonHeaders(mapHeaders(rows[i]))) return i;
    }
    return -1;
  }
  function detectText(text) { return detectMatrix(parseCsv(text)) >= 0; }

  function cell(row, idx, key) { return idx[key] == null ? "" : row[idx[key]]; }

  function orderFlag(status) {
    const s = normText(status);
    if (/annull|cancel|void|cancellat/.test(s)) return "cancelled";
    if (/\breso\b|\breturn(?:ed|s)?\b|rimbors|refund/.test(s)) return "returned";
    if (/sospes|pending|in elaborazione|processing/.test(s)) return "pending";
    return "";
  }

  function itemKey(it) {
    return [it.asin || "", it.title || "", it.qty, it.sub, it.tax, it.net, it.rate, it.category].join("|");
  }

  function uniqueItems(items) {
    const seen = Object.create(null), out = [];
    (items || []).forEach((it) => {
      const k = itemKey(it);
      if (seen[k]) return;
      seen[k] = 1;
      out.push(it);
    });
    return out;
  }

  function buildItem(row, idx) {
    const title = String(cell(row, idx, "title") || "").trim();
    const category = String(cell(row, idx, "category") || cell(row, idx, "productCategory") || "").trim();
    const rateStr = cell(row, idx, "itemVatRate");
    return {
      title, category,
      asin: String(cell(row, idx, "asin") || "").trim(),
      qty: parseAmount(cell(row, idx, "qty")),
      sub: parseAmount(cell(row, idx, "itemSub")),
      tax: parseAmount(cell(row, idx, "itemTax")),
      net: parseAmount(cell(row, idx, "itemNet")),
      ship: parseAmount(cell(row, idx, "itemShip")),
      promo: parseAmount(cell(row, idx, "itemPromo")),
      rate: rateStr, ratePct: parseRate(rateStr)
    };
  }

  function buildOrder(id, rawItems, idx) {
    const row = (rawItems[0] && rawItems[0]._row) || [];
    const items = uniqueItems(rawItems.map((r) => {
      const it = buildItem(r._row, idx);
      return it;
    }).filter((it) => it.title || it.net != null || it.sub != null));
    const gross = parseAmount(cell(row, idx, "orderNet"));
    const vat = parseAmount(cell(row, idx, "orderTax"));
    const subtotal = parseAmount(cell(row, idx, "orderSub"));
    const promo = parseAmount(cell(row, idx, "orderPromo"));
    const shipping = parseAmount(cell(row, idx, "orderShip"));
    const paymentAmount = parseAmount(cell(row, idx, "paymentAmount"));
    const flag = orderFlag(cell(row, idx, "orderStatus"));
    const net = (gross != null && vat != null) ? round2(gross - vat) : (subtotal != null ? round2(subtotal + (promo || 0) + (shipping || 0)) : null);
    const date = parseDate(cell(row, idx, "orderDate"));
    const paymentDate = parseDate(cell(row, idx, "paymentDate"));
    return {
      id: String(id || "").trim(),
      date, paymentDate,
      status: String(cell(row, idx, "orderStatus") || "").trim(),
      flag,
      currency: String(cell(row, idx, "currency") || "EUR").trim() || "EUR",
      gross: gross == null ? 0 : gross,
      vat: vat == null ? 0 : vat,
      net: net == null ? 0 : net,
      subtotal: subtotal == null ? 0 : subtotal,
      promo: promo || 0,
      shipping: shipping || 0,
      paymentAmount: paymentAmount,
      paymentMethod: String(cell(row, idx, "paymentMethod") || "").trim(),
      items,
      itemGross: round2(items.reduce((s, it) => s + (it.net || 0), 0)),
      itemVat: round2(items.reduce((s, it) => s + (it.tax || 0), 0))
    };
  }

  function parseMatrix(matrix) {
    const rows = matrix || [];
    const headAt = detectMatrix(rows);
    if (headAt < 0) {
      const err = new Error("not-amazon");
      err.code = "format";
      throw err;
    }
    const idx = mapHeaders(rows[headAt]);
    const by = Object.create(null);
    const orderOf = [];
    for (let i = headAt + 1; i < rows.length; i++) {
      const row = rows[i];
      const id = String(cell(row, idx, "orderId") || "").trim();
      if (!id) continue;
      if (!by[id]) { by[id] = []; orderOf.push(id); }
      by[id].push({ _row: row });
    }
    const orders = orderOf.map((id) => buildOrder(id, by[id], idx));
    return { source: "amazon", headerRow: headAt, nRows: rows.length - headAt - 1, orders };
  }

  function parseText(text) { return parseMatrix(parseCsv(text)); }

  function summarize(orders, opt) {
    opt = opt || {};
    const includeCancelled = !!opt.includeCancelled;
    const list = (orders || []).filter((o) => includeCancelled || (o.flag !== "cancelled" && o.flag !== "returned"));
    const byCat = Object.create(null);
    let gross = 0, vat = 0, net = 0, nItems = 0;
    const dates = [];
    list.forEach((o) => {
      gross = round2(gross + (o.gross || 0));
      vat = round2(vat + (o.vat || 0));
      net = round2(net + (o.net || 0));
      nItems += (o.items || []).length;
      if (o.date) dates.push(o.date);
      if (o.paymentDate) dates.push(o.paymentDate);
      (o.items || []).forEach((it) => {
        const name = it.category || "";
        const rec = byCat[name] || (byCat[name] = { name: name || "", n: 0, gross: 0, vat: 0, net: 0 });
        rec.n++;
        rec.gross = round2(rec.gross + (it.net || 0));
        rec.vat = round2(rec.vat + (it.tax || 0));
        rec.net = round2(rec.net + ((it.net || 0) - (it.tax || 0)));
      });
    });
    dates.sort();
    const cats = Object.keys(byCat).map((k) => byCat[k]).sort((a, b) => b.gross - a.gross);
    return {
      nOrders: list.length,
      nCancelled: (orders || []).filter((o) => o.flag === "cancelled" || o.flag === "returned").length,
      nPending: list.filter((o) => o.flag === "pending").length,
      nItems, gross, vat, net,
      periodFrom: dates[0] || "",
      periodTo: dates[dates.length - 1] || "",
      byCategory: cats
    };
  }

  function isAmazonBankDesc(desc) {
    return /\bamzn\b|\bamazon\b|amznmk?tp|amznprime|\bamazn\b/i.test(String(desc || ""));
  }

  function findCat(cats, preds) {
    const list = (cats || []).filter((c) => c && c.type === "out" && c.active !== false);
    for (let i = 0; i < preds.length; i++) {
      const hit = list.find((c) => preds[i](normText(c.name || "")));
      if (hit) return hit.id;
    }
    return (list[0] || {}).id || "";
  }

  function guessCategory(order, cats) {
    const blob = normText(((order.items || []).map((it) => (it.category || "") + " " + (it.title || "")).join(" ")) + " amazon");
    if (/alcol|birra|vino|spirit|bevande alcol|alcohol|beer|wine|gin|whisky/.test(blob)
      || /drogheria|grocery|aliment|food|cucina|kitchen|casa\b|home/.test(blob)
      || /ufficio|office|canceller/.test(blob)) {
      return findCat(cats, [(n) => /fornitor|merci|acquist|supplier|goods/.test(n)]);
    }
    return findCat(cats, [(n) => /fornitor|merci|acquist|supplier|goods/.test(n), (n) => /altre spese|other exp/.test(n)]);
  }

  function pickVat(order, vatRates) {
    const rates = vatRates || [];
    const pcts = [...new Set((order.items || []).map((it) => it.ratePct).filter((p) => p != null))];
    const man = rates.find((v) => v.manual);
    const matchPct = (p) => rates.find((v) => !v.manual && Math.abs(Number(v.pct) - p) < 0.0015);
    if (pcts.length === 1) {
      const id = (matchPct(pcts[0]) || {}).id;
      if (id) {
        const g = Number(order.gross) || 0, v = Number(order.vat) || 0;
        const theo = pcts[0] <= 0 ? 0 : round2(g - round2(g / (1 + pcts[0])));
        if (amtClose(theo, v)) return { vatId: id, vatManual: 0 };
      }
    }
    if (man) return { vatId: man.id, vatManual: Number(order.vat) || 0 };
    if (pcts.length === 1 && matchPct(pcts[0])) return { vatId: matchPct(pcts[0]).id, vatManual: Number(order.vat) || 0 };
    return { vatId: (rates[0] || {}).id || "", vatManual: Number(order.vat) || 0 };
  }

  function txDates(t) {
    const d = [];
    if (t.date) d.push(t.date);
    return d;
  }

  function matchOrders(orders, opt) {
    opt = opt || {};
    const txs = (opt.transactions || []).filter((t) => t && t.type === "out" && t.paid && !t.invoiceId);
    const imported = new Set((opt.importedIds || []).map((x) => String(x)));
    const used = new Set();
    const byRef = Object.create(null);
    txs.forEach((t) => {
      const ref = String(t.ref || "").trim();
      if (ref) byRef[ref] = t;
    });

    function bestBank(o) {
      const cand = [];
      txs.forEach((t) => {
        if (used.has(t.id)) return;
        if (!amtClose(t.gross, o.gross)) return;
        if (!isAmazonBankDesc(t.desc) && !isAmazonBankDesc(t.notes)) return;
        const anchors = [o.date, o.paymentDate].filter(Boolean);
        const td = txDates(t);
        let days = 99;
        anchors.forEach((a) => td.forEach((b) => { days = Math.min(days, daysBetween(a, b)); }));
        if (days <= 7) cand.push({ t, days });
      });
      cand.sort((a, b) => a.days - b.days);
      return cand[0] ? cand[0].t : null;
    }

    return (orders || []).map((o) => {
      const cancelled = o.flag === "cancelled" || o.flag === "returned";
      const alreadyTx = byRef[o.id];
      if (alreadyTx) {
        used.add(alreadyTx.id);
        return { order: o, selected: false, action: "skip", existing: { kind: "imported", id: alreadyTx.id, label: alreadyTx.desc || o.id, date: alreadyTx.date } };
      }
      if (imported.has(o.id)) {
        return { order: o, selected: false, action: "skip", existing: { kind: "imported", id: "", label: o.id, date: o.date } };
      }
      if (cancelled) {
        return { order: o, selected: false, action: "skip", existing: null };
      }
      const bank = bestBank(o);
      if (bank) {
        used.add(bank.id);
        return { order: o, selected: true, action: "enrich", existing: { kind: "bank", id: bank.id, label: bank.desc || "", date: bank.date } };
      }
      return { order: o, selected: true, action: "create", existing: null };
    });
  }

  async function hashBytes(buf) {
    const u8 = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
    if (root.crypto && root.crypto.subtle) {
      const h = await root.crypto.subtle.digest("SHA-256", u8);
      return Array.from(new Uint8Array(h)).map((b) => b.toString(16).padStart(2, "0")).join("");
    }
    if (typeof require === "function") {
      return require("crypto").createHash("sha256").update(Buffer.from(u8)).digest("hex");
    }
    let s = 0;
    for (let i = 0; i < u8.length; i++) s = (s * 33 + u8[i]) >>> 0;
    return "x" + s.toString(16) + u8.length.toString(16);
  }

  const api = {
    parseAmount, parseDate, parseRate, parseCsv, parseText, parseMatrix,
    detectText, detectMatrix, isAmazonHeaders, mapHeaders, uniqueItems,
    summarize, guessCategory, pickVat, isAmazonBankDesc, matchOrders,
    daysBetween, amtClose, normText, hashBytes, orderFlag
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else { root.GA = root.GA || {}; root.GA.amazonParse = api; }
})(typeof window !== "undefined" ? window : globalThis);
