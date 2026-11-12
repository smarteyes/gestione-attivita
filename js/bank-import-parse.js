/* =========================================================
 * Estratto conto (BPER e simili): lettura movimenti, totali, categorie, abbinamenti.
 * Puro, senza DOM: usato dall'app e dai test in Node.
 * ========================================================= */
(function (root) {
  const DATE_RE = /^(\d{2})[/.](\d{2})[/.](\d{2}|\d{4})$/;
  const AMT_RE = /^-?\d{1,3}(?:\.\d{3})*,\d{2}$|^-?\d+,\d{2}$/;

  function parseAmount(s) {
    const t = String(s || "").replace(/[€¤\u20ac]|EUR/gi, "").replace(/[\s\u00a0]/g, "");
    if (!t || !AMT_RE.test(t)) return null;
    const v = Number(t.replace(/\./g, "").replace(",", "."));
    return Number.isFinite(v) ? Math.round(v * 100) / 100 : null;
  }
  function parseDate(s) {
    const m = String(s || "").trim().match(DATE_RE);
    if (!m) return "";
    const d = +m[1], mo = +m[2], y = m[3].length === 2 ? 2000 + +m[3] : +m[3];
    if (mo < 1 || mo > 12 || d < 1 || d > 31) return "";
    const iso = y + "-" + String(mo).padStart(2, "0") + "-" + String(d).padStart(2, "0");
    const dt = new Date(iso + "T00:00:00");
    if (isNaN(dt) || dt.getDate() !== d) return "";
    return iso;
  }
  function daysBetween(a, b) {
    const pa = Date.parse(a + "T00:00:00"), pb = Date.parse(b + "T00:00:00");
    if (isNaN(pa) || isNaN(pb)) return 99;
    return Math.abs(Math.round((pa - pb) / 86400000));
  }
  function amtClose(a, b) { return Math.abs(Number(a) - Number(b)) <= 0.011; }
  function normText(s) {
    return String(s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
  }
  function round2(n) { return Math.round((Number(n) || 0) * 100) / 100; }

  function rowsFromItems(items) {
    const rows = [];
    (items || []).forEach((i) => {
      const s = i && (i.str || i.s);
      if (!s || !String(s).trim()) return;
      const x = i.transform ? i.transform[4] : (i.x || 0);
      const y = i.transform ? i.transform[5] : (i.y || 0);
      const w = i.width || i.w || 0;
      const h = i.height || 10;
      let r = rows.find((q) => Math.abs(q.y - y) < Math.max(2, h * 0.5));
      if (!r) rows.push((r = { y, it: [] }));
      r.it.push({ x, s: String(s).trim(), w });
    });
    rows.sort((a, b) => b.y - a.y);
    rows.forEach((r) => r.it.sort((a, b) => a.x - b.x));
    return rows;
  }

  function detectCols(it) {
    const hit = (re) => {
      const x = it.find((i) => re.test(i.s));
      return x ? x.x : null;
    };
    const data = hit(/^DATA$/i), uscite = hit(/^USCITE$/i), entrate = hit(/^ENTRATE$/i), desc = hit(/^DESCRIZIONE$/i);
    if (data == null || uscite == null || entrate == null || desc == null) return null;
    const valuta = hit(/^VALUTA$/i);
    return { data, valuta: valuta == null ? data + 40 : valuta, uscite, entrate, desc };
  }

  function execDateOf(desc) {
    const m = String(desc || "").match(/eseguito il\s+(\d{2}[/.]\d{2}[/.]\d{2,4})/i);
    return m ? parseDate(m[1]) : "";
  }

  function parseItemPages(pages) {
    const cols0 = { data: 47, valuta: 88, uscite: 164, entrate: 226, desc: 276 };
    let cols = null;
    const movements = [];
    const summary = { opening: null, openingDate: "", totalIn: null, totalOut: null, closing: null, closingDate: "" };
    const meta = { iban: "", accountNo: "", periodEnd: "", holder: "", source: "pdf" };
    let cur = null;

    const flush = () => {
      if (!cur) return;
      cur.desc = cur.desc.replace(/\s+/g, " ").trim();
      cur.execDate = execDateOf(cur.desc);
      const low = normText(cur.desc);
      const isSaldo = /^saldo iniziale\b/.test(low) || /^saldo finale\b/.test(low);
      if (isSaldo) {
        if (/iniziale/.test(low)) {
          if (summary.opening == null) summary.opening = cur.amount;
          if (!summary.openingDate) summary.openingDate = cur.date;
        } else {
          if (summary.closing == null) summary.closing = cur.amount;
          if (!summary.closingDate) summary.closingDate = cur.date;
        }
      } else if (cur.amount != null && cur.date) {
        movements.push(cur);
      }
      cur = null;
    };

    const takeAmt = (s) => {
      const m = String(s || "").match(/-?\d{1,3}(?:\.\d{3})*,\d{2}|-?\d+,\d{2}/);
      return m ? parseAmount(m[0]) : null;
    };

    (pages || []).forEach((items) => {
      const rows = rowsFromItems(items);
      rows.forEach((row) => {
        const it = row.it;
        const line = it.map((i) => i.s).join(" ");
        const found = detectCols(it);
        if (found) { cols = found; return; }

        const mEst = line.match(/ESTRATTO AL\s+(\d{2}[/.]\d{2}[/.]\d{2,4})/i);
        if (mEst && !meta.periodEnd) meta.periodEnd = parseDate(mEst[1]);
        const mNum = line.match(/NUMERO\s+(\d{6,})/i);
        if (mNum && !meta.accountNo) meta.accountNo = mNum[1];
        if (/^IBAN\b/i.test(it[0] && it[0].s) && !meta.iban) {
          meta.iban = it.slice(1).map((i) => i.s).join("").replace(/\s+/g, "");
        }
        if (/Saldo iniziale/i.test(line)) {
          const v = takeAmt(line); if (v != null) summary.opening = v;
          const d = line.match(/al\s+(\d{2}[/.]\d{2}[/.]\d{2,4})/i); if (d) summary.openingDate = parseDate(d[1]);
          return;
        }
        if (/Totale Entrate/i.test(line)) { const v = takeAmt(line); if (v != null) summary.totalIn = v; return; }
        if (/Totale Uscite/i.test(line)) { const v = takeAmt(line); if (v != null) summary.totalOut = v; return; }
        if (/Saldo finale/i.test(line) && !/pagina|mod\./i.test(line)) {
          const v = takeAmt(line); if (v != null) summary.closing = v;
          const d = line.match(/al\s+(\d{2}[/.]\d{2}[/.]\d{2,4})/i); if (d) summary.closingDate = parseDate(d[1]);
          if (/^Saldo finale/i.test(line.trim()) && !it.some((i) => DATE_RE.test(i.s) && i.x < 80)) return;
        }

        const C = cols || cols0;
        const mid = (C.uscite + C.entrate) / 2 + 8;
        const dateIt = it.filter((i) => DATE_RE.test(i.s) && i.x < C.valuta + 8);
        const firstDate = dateIt[0] && dateIt[0].x < C.data + 30 ? dateIt[0] : null;
        if (firstDate) {
          flush();
          const valutaIt = dateIt.find((i) => i !== firstDate && i.x >= C.valuta - 8 && i.x < C.uscite - 8);
          let outV = null, inV = null;
          it.forEach((i) => {
            if (i.x >= C.desc - 8) return;
            const a = parseAmount(i.s);
            if (a == null) return;
            if (i.x < mid) outV = a; else inV = a;
          });
          const desc = it.filter((i) => i.x >= C.desc - 8).map((i) => i.s).join(" ");
          let amount = 0, type = "out";
          if (inV != null && outV != null) {
            /* riga anomala con entrambi: preferisci quello non zero; se entrambi, usa differenza */
            if (outV && !inV) { amount = -outV; type = "out"; }
            else if (inV && !outV) { amount = inV; type = "in"; }
            else { amount = round2(inV - outV); type = amount < 0 ? "out" : "in"; }
          } else if (outV != null) { amount = -outV; type = "out"; }
          else if (inV != null) { amount = inV; type = "in"; }
          else return;
          cur = {
            date: parseDate(firstDate.s),
            valuta: valutaIt ? parseDate(valutaIt.s) : "",
            execDate: "",
            amount: round2(amount),
            type,
            desc: desc || "",
          };
          return;
        }
        if (cur && it.length && it.every((i) => i.x >= C.desc - 20 || !DATE_RE.test(i.s))) {
          const extra = it.map((i) => i.s).join(" ");
          if (extra && !/^Pag\.\s*\d/i.test(extra) && !/^Mod\./i.test(extra) && !/segue ESTRATTO/i.test(extra)) {
            cur.desc = (cur.desc + " " + extra).replace(/\s+/g, " ").trim();
          }
        }
      });
    });
    flush();

    const sumIn = round2(movements.filter((m) => m.amount > 0).reduce((s, m) => s + m.amount, 0));
    const sumOut = round2(movements.filter((m) => m.amount < 0).reduce((s, m) => s + (-m.amount), 0));
    return { movements, summary, meta, sumIn, sumOut };
  }

  function parseTable(matrix) {
    const rows = (matrix || []).map((r) => (r || []).map((c) => String(c == null ? "" : c).trim()));
    let hi = rows.findIndex((r) => r.some((c) => /descriz|causale|description/i.test(c)) && r.some((c) => /data|date/i.test(c)));
    if (hi < 0) hi = 0;
    const head = (rows[hi] || []).map((c) => normText(c));
    const col = (preds) => head.findIndex((h) => preds.some((re) => re.test(h)));
    const iData = col([/^data$/, /data oper/, /data contab/, /^date$/]);
    const iValuta = col([/valuta/, /value date/, /data valuta/]);
    const iOut = col([/uscite/, /^dare$/, /addebito/, /^debit/, /^out$/]);
    const iIn = col([/entrate/, /^avere$/, /accredito/, /^credit/, /^in$/]);
    const iAmt = col([/^importo$/, /^amount$/, /^euro$/, /^somma$/]);
    const iDesc = col([/descriz/, /causale/, /description/, /^desc$/]);
    if (iData < 0 || (iAmt < 0 && iOut < 0 && iIn < 0)) return { movements: [], summary: {}, meta: { source: "table" }, sumIn: 0, sumOut: 0, error: "format" };
    const movements = [];
    const summary = { opening: null, openingDate: "", totalIn: null, totalOut: null, closing: null, closingDate: "" };
    for (let r = hi + 1; r < rows.length; r++) {
      const row = rows[r];
      const date = parseDate(row[iData] || "");
      if (!date) continue;
      const valuta = iValuta >= 0 ? parseDate(row[iValuta] || "") : "";
      const desc = iDesc >= 0 ? row[iDesc] || "" : row.slice(Math.max(iData, iAmt, iOut, iIn) + 1).join(" ");
      let amount = null, type = "out";
      if (iAmt >= 0 && parseAmount(row[iAmt]) != null) {
        amount = parseAmount(row[iAmt]);
        /* signed or with + / - */
        const raw = row[iAmt];
        if (/^\s*\+/.test(raw) || (amount > 0 && !/^\s*-/.test(raw) && iOut < 0)) type = amount < 0 ? "out" : "in";
        if (/^\s*-/.test(raw)) { amount = -Math.abs(amount); type = "out"; }
        else if (amount < 0) type = "out";
        else type = "in";
      } else {
        const o = iOut >= 0 ? parseAmount(row[iOut]) : null;
        const i = iIn >= 0 ? parseAmount(row[iIn]) : null;
        if (o != null && o !== 0) { amount = -Math.abs(o); type = "out"; }
        else if (i != null && i !== 0) { amount = Math.abs(i); type = "in"; }
        else continue;
      }
      const low = normText(desc);
      if (/^saldo iniziale\b/.test(low)) { summary.opening = Math.abs(amount); summary.openingDate = date; continue; }
      if (/^saldo finale\b/.test(low)) { summary.closing = Math.abs(amount); summary.closingDate = date; continue; }
      movements.push({ date, valuta, execDate: execDateOf(desc), amount: round2(amount), type, desc: desc.replace(/\s+/g, " ").trim() });
    }
    const sumIn = round2(movements.filter((m) => m.amount > 0).reduce((s, m) => s + m.amount, 0));
    const sumOut = round2(movements.filter((m) => m.amount < 0).reduce((s, m) => s + (-m.amount), 0));
    return { movements, summary, meta: { source: "table" }, sumIn, sumOut };
  }

  function validateStatement(parsed) {
    const s = (parsed && parsed.summary) || {};
    const sumIn = parsed.sumIn, sumOut = parsed.sumOut;
    const computed = s.opening != null ? round2(s.opening + sumIn - sumOut) : null;
    const dIn = s.totalIn != null ? round2(sumIn - s.totalIn) : 0;
    const dOut = s.totalOut != null ? round2(sumOut - s.totalOut) : 0;
    const dClose = s.closing != null && computed != null ? round2(computed - s.closing) : 0;
    const ok = Math.abs(dIn) <= 0.011 && Math.abs(dOut) <= 0.011 && Math.abs(dClose) <= 0.011;
    return { ok, sumIn, sumOut, opening: s.opening, closing: s.closing, totalIn: s.totalIn, totalOut: s.totalOut, computedClosing: computed, dIn, dOut, dClose };
  }

  function fingerprint(parsed) {
    const rows = ((parsed && parsed.movements) || []).map((m) => [m.date, m.valuta || "", m.amount, normText(m.desc).slice(0, 80)].join("|"));
    return rows.join("\n");
  }

  function findCat(cats, type, preds) {
    const L = (cats || []).filter((c) => c.type === type && c.active !== false);
    for (let i = 0; i < preds.length; i++) {
      const hit = L.find((c) => preds[i](normText(c.name), c));
      if (hit) return hit.id;
    }
    const fb = L.find((c) => /altre|other/.test(normText(c.name)));
    return (fb || L[L.length - 1] || {}).id || "";
  }

  function guessCategory(mov, cats) {
    const d = normText(mov && mov.desc);
    const type = (mov && mov.amount) >= 0 ? "in" : "out";
    if (type === "in") {
      if (/giroconto/.test(d) && /the ace/.test(d)) {
        return findCat(cats, "in", [(n) => /\bpos\b|carta|card/.test(n), (n) => /incass/.test(n)]);
      }
      return findCat(cats, "in", [(n) => /altre entrate|other income/.test(n), (n) => /altre|other/.test(n)]);
    }
    if (/f24|imposte e tasse|agenzia entrate|\bimu\b|\binps\b|\binail\b/.test(d)) {
      return findCat(cats, "out", [(n) => /tass|contribut|tax/.test(n)]);
    }
    if (/commission/.test(d) || /imposta di bollo|canone .*conto|spese conto/.test(d)) {
      return findCat(cats, "out", [(n) => /banca|commission|bank/.test(n)]);
    }
    if (/amzn|amazon|bennet|conad|esselunga|lidl|tigros|eurospin|carrefour/.test(d)) {
      return findCat(cats, "out", [(n) => /fornitor|merci|acquist|supplier|goods/.test(n)]);
    }
    if (/\baffitto\b|locazione/.test(d)) {
      return findCat(cats, "out", [(n) => /affitto|rent/.test(n)]);
    }
    if ((/sdd|rid|addebito/.test(d)) && /enel|a2a|hera|acea|iren|vodafone|\btim\b|windtre|iliad|italiaonline|fastweb|open fiber/.test(d)) {
      return findCat(cats, "out", [(n) => /utenz|utilit/.test(n)]);
    }
    if (/stipendio|cedolino|\bpersonale\b/.test(d)) {
      return findCat(cats, "out", [(n) => /personal|staff|stipend/.test(n)]);
    }
    if (/disposizione|bonifico|pag fattura|fattura/.test(d)) {
      return findCat(cats, "out", [(n) => /fornitor|merci|acquist|supplier/.test(n)]);
    }
    return findCat(cats, "out", [(n) => /altre spese|other exp/.test(n), (n) => /altre|other/.test(n)]);
  }

  function movDates(m) { return [m.date, m.valuta, m.execDate].filter(Boolean); }

  function matchAll(movements, opt) {
    const txs = ((opt && opt.transactions) || []).filter((t) => t && t.paid && Number(t.gross) > 0);
    const invs = (opt && opt.invoices) || [];
    const usedTx = new Set(), usedInv = new Set();
    const acc = opt && opt.accountId;
    function bestTx(m) {
      const wantType = m.amount >= 0 ? "in" : "out";
      const abs = Math.abs(m.amount);
      const dates = movDates(m);
      let best = null, score = 0;
      txs.forEach((t) => {
        if (usedTx.has(t.id) || t.type !== wantType || !amtClose(t.gross, abs)) return;
        const dt = t.date || "";
        const day = dates.reduce((mn, d) => Math.min(mn, daysBetween(d, dt)), 99);
        if (day > 3) return;
        let sc = 20 - day;
        if (acc && t.accountId === acc) sc += 5;
        const nd = normText(t.desc || "");
        const md = normText(m.desc || "");
        if (nd && md && (nd.includes(md.slice(0, 24)) || md.includes(nd.slice(0, 24)))) sc += 6;
        if (sc > score) { score = sc; best = t; }
      });
      return best;
    }
    function bestInv(m) {
      if (m.amount >= 0) return null;
      const abs = Math.abs(m.amount);
      const dates = movDates(m);
      let best = null, score = 0;
      invs.forEach((inv) => {
        if (usedInv.has(inv.id)) return;
        const paid = Number(inv.paidAmount) || 0;
        const gross = Number(inv.gross) || 0;
        const paidOk = (inv.status === "paid" || paid >= gross - 0.004) && (amtClose(paid, abs) || amtClose(gross, abs));
        const partOk = paid > 0.004 && amtClose(paid, abs);
        if (!paidOk && !partOk) return;
        const idates = [inv.paidDate, inv.invoiceDate, inv.dueDate].filter(Boolean);
        const day = dates.reduce((mn, d) => Math.min(mn, idates.reduce((m2, x) => Math.min(m2, daysBetween(d, x)), 99)), 99);
        if (day > 3) return;
        const sc = 15 - day + (paidOk ? 3 : 0);
        if (sc > score) { score = sc; best = inv; }
      });
      return best;
    }
    return (movements || []).map((m) => {
      const t = bestTx(m);
      if (t) {
        usedTx.add(t.id);
        const label = [t.date, t.desc || "", String(t.gross)].filter(Boolean).join(" · ");
        return { mov: m, existing: { kind: "tx", id: t.id, label }, selected: false };
      }
      const inv = bestInv(m);
      if (inv) {
        usedInv.add(inv.id);
        const label = [inv.paidDate || inv.invoiceDate, inv.supplier || "", String(inv.gross)].filter(Boolean).join(" · ");
        return { mov: m, existing: { kind: "invoice", id: inv.id, label }, selected: false };
      }
      return { mov: m, existing: null, selected: true };
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
    /* fallback debole, solo se manca SubtleCrypto */
    let s = 0;
    for (let i = 0; i < u8.length; i++) s = (s * 33 + u8[i]) >>> 0;
    return "x" + s.toString(16) + u8.length.toString(16);
  }

  const api = {
    parseAmount, parseDate, daysBetween, amtClose, normText, rowsFromItems,
    parseItemPages, parseTable, validateStatement, fingerprint, guessCategory, matchAll, hashBytes,
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else { root.GA = root.GA || {}; root.GA.bankParse = api; }
})(typeof window !== "undefined" ? window : globalThis);
