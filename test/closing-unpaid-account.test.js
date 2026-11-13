/* Chiusura «unpaid» (Altro incasso): conto predefinito, saveClosing e migrazione ga-v23.
 * Eseguire con: node --test
 */
const assert = require("assert/strict");
const fs = require("fs");
const path = require("path");
const test = require("node:test");
const vm = require("vm");

const ROOT = path.join(__dirname, "..");
const E = require("../js/engine.js");

function cashBook(extra) {
  return Object.assign({
    lang: "it",
    closingAccCash: "acc-cash",
    closingAccPos: "acc-bank",
    closingAccUnpaid: "acc-cash",
  }, extra || {});
}
function baseAccounts() {
  return [
    { id: "acc-cash", name: "Contanti", kind: "account", icon: "cash", opening: 0, manual: "", active: true },
    { id: "acc-bank", name: "Banca", kind: "account", icon: "bank", opening: 0, manual: "", active: true },
    { id: "acc-other", name: "Altro incasso", kind: "account", icon: "receipt", opening: 0, manual: "", active: true },
  ];
}
function tx(id, extra) {
  return Object.assign({ id: id, type: "in", paid: true, date: "2026-11-01", gross: 10, desc: "Chiusura serata", closing: "unpaid", accountId: "acc-cash" }, extra || {});
}
function idsOf(plan) {
  return plan.moves.map((m) => m.id).sort();
}

test("new books route Altro incasso to acc-other and bust the cache to ga-v23", () => {
  const ctx = loadScripts(["js/engine.js", "js/config.js"]);
  const book = ctx.GA.defaults.book("it");
  assert.equal(book.closingAccCash, "acc-cash");
  assert.equal(book.closingAccPos, "acc-bank");
  assert.equal(book.closingAccUnpaid, "acc-other");
  assert.equal(ctx.GA.defaults.book("en").closingAccUnpaid, "acc-other");
  const other = ctx.GA.defaults.accounts("it").find((a) => a.id === "acc-other");
  assert.equal(other.name, "Altro incasso");
  assert.equal(other.active, true);
  assert.equal(ctx.GA.config.appVersion, 23);
  const sw = fs.readFileSync(path.join(ROOT, "sw.js"), "utf8");
  const html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
  assert.match(sw, /const VERSION = "ga-v23"/);
  assert.match(html, /js\/config\.js\?v=23/);
  assert.match(html, /js\/storage\.js\?v=23/);
  assert.doesNotMatch(html, /\?v=22/);
});

test("migration moves past unpaid closings off cash onto Altro incasso", () => {
  const accounts = baseAccounts().concat([
    { id: "acc-cassa", name: "Cassa serale", kind: "account", icon: "cash", opening: 0, active: true },
    { id: "acc-wallet", name: "Wallet", kind: "account", icon: "bank", opening: 0, active: true },
  ]);
  const txs = [
    tx("u1", { date: "2026-11-01", gross: 40, accountId: "acc-cash" }),
    tx("u2", { date: "2026-11-02", gross: 15.5, accountId: "acc-cash" }),
    tx("u3", { date: "2026-11-03", gross: 20, accountId: "" }),
    tx("u11", { date: "2026-11-11", gross: 7.25, accountId: "acc-cassa" }),
    tx("keep-bank", { date: "2026-11-01", gross: 99, accountId: "acc-bank" }),
    tx("keep-wallet", { date: "2026-11-02", gross: 5, accountId: "acc-wallet" }),
    tx("keep-other", { date: "2026-11-04", gross: 3, accountId: "acc-other" }),
    tx("keep-cash-ch", { date: "2026-11-01", gross: 8, accountId: "acc-cash", closing: "cash" }),
    tx("keep-pos", { date: "2026-11-01", gross: 12, accountId: "acc-bank", closing: "pos" }),
    tx("keep-income", { date: "2026-11-01", gross: 4, accountId: "acc-cash", closing: "" }),
  ];
  const plan = E.migrateClosingUnpaidAccount(cashBook(), accounts, txs);
  assert.equal(plan.already, false);
  assert.equal(plan.bookChanged, true);
  assert.equal(plan.created, false);
  assert.equal(plan.book.closingAccUnpaid, "acc-other");
  assert.equal(plan.book.closingAccCash, "acc-cash");
  assert.equal(plan.book.closingUnpaidRoutedV23, true);
  assert.deepEqual(idsOf(plan), ["u1", "u11", "u2", "u3"]);
  assert.equal(plan.gross, 82.75);
  plan.moves.forEach((m) => assert.equal(m.to, "acc-other"));

  const applied = E.applyClosingUnpaidAccount(txs, plan);
  assert.equal(applied.changed, 4);
  const byId = Object.fromEntries(applied.transactions.map((t) => [t.id, t]));
  assert.equal(byId.u1.accountId, "acc-other");
  assert.equal(byId.u2.accountId, "acc-other");
  assert.equal(byId.u3.accountId, "acc-other");
  assert.equal(byId.u11.accountId, "acc-other");
  assert.equal(byId["keep-bank"].accountId, "acc-bank");
  assert.equal(byId["keep-wallet"].accountId, "acc-wallet");
  assert.equal(byId["keep-other"].accountId, "acc-other");
  assert.equal(byId["keep-cash-ch"].accountId, "acc-cash");
  assert.equal(byId["keep-pos"].accountId, "acc-bank");
  assert.equal(byId["keep-income"].accountId, "acc-cash");
  assert.equal(byId.u1.closing, "unpaid");
  assert.equal(byId.u1.paid, true);

  const enriched = E.enrich(applied.transactions, { vatRates: [{ id: "v0", pct: 0 }], dedRates: [] });
  const bal = E.balances(plan.accounts, enriched, []);
  const other = bal.find((a) => a.id === "acc-other");
  const cash = bal.find((a) => a.id === "acc-cash");
  // 82.75 spostati + 3 già su Altro incasso; in cassa restano il canale contanti (8) e l'entrata (4)
  assert.equal(other.income, 85.75);
  assert.equal(other.balance, 85.75);
  assert.equal(cash.income, 12);
  const visible = E.filterTx(enriched, { accountId: "acc-other" }, null);
  assert.deepEqual(visible.map((t) => t.id).sort(), ["keep-other", "u1", "u11", "u2", "u3"]);
  assert.ok(E.selectableAccounts(plan.accounts).some((a) => a.id === "acc-other"));
});

test("migration is idempotent and does not undo a later Settings choice", () => {
  const accounts = baseAccounts();
  const txs = [tx("u1", { gross: 40 }), tx("cash", { closing: "cash", gross: 8 })];
  const first = E.migrateClosingUnpaidAccount(cashBook(), accounts, txs);
  const applied = E.applyClosingUnpaidAccount(txs, first);
  const second = E.migrateClosingUnpaidAccount(first.book, first.accounts, applied.transactions);
  assert.equal(second.already, true);
  assert.equal(second.bookChanged, false);
  assert.equal(second.n, 0);
  assert.equal(second.book.closingAccUnpaid, "acc-other");
  assert.equal(E.applyClosingUnpaidAccount(applied.transactions, second).changed, 0);

  const chosen = Object.assign({}, second.book, { closingAccUnpaid: "acc-cash" });
  const later = [applied.transactions.find((t) => t.id === "u1"), tx("new-cash", { date: "2026-11-12", gross: 18, accountId: "acc-cash" })];
  const third = E.migrateClosingUnpaidAccount(chosen, second.accounts, later);
  assert.equal(third.bookChanged, false);
  assert.equal(third.n, 0);
  assert.equal(third.book.closingAccUnpaid, "acc-cash");
  assert.equal(E.applyClosingUnpaidAccount(later, third).changed, 0);
});

test("an explicit non-cash channel is kept, and a missing Altro incasso account is created", () => {
  const accounts = [
    { id: "acc-cash", name: "Contanti", kind: "account", icon: "cash", opening: 0, active: true },
    { id: "acc-bank", name: "Banca", kind: "account", icon: "bank", opening: 0, active: true },
    { id: "acc-wallet", name: "Wallet", kind: "account", icon: "card", opening: 0, active: true },
  ];
  const txs = [
    tx("on-cash", { gross: 10, accountId: "acc-cash" }),
    tx("on-wallet", { gross: 6, accountId: "acc-wallet" }),
  ];
  const plan = E.migrateClosingUnpaidAccount(cashBook({ closingAccUnpaid: "acc-wallet" }), accounts, txs);
  assert.equal(plan.created, true);
  assert.equal(plan.accountsChanged, 1);
  assert.equal(plan.account.id, "acc-other");
  assert.equal(plan.account.name, "Altro incasso");
  assert.equal(plan.book.closingAccUnpaid, "acc-wallet");
  assert.equal(plan.book.closingUnpaidRoutedV23, true);
  assert.deepEqual(idsOf(plan), ["on-cash"]);

  const renamed = E.migrateClosingUnpaidAccount(cashBook(), [
    { id: "acc-cash", name: "Contanti", kind: "account", icon: "cash", active: true },
    { id: "acc-nr", name: "Non riscosso", kind: "account", icon: "receipt", active: false },
  ], [tx("old", { gross: 9 })]);
  assert.equal(renamed.created, false);
  assert.equal(renamed.renamed, true);
  assert.equal(renamed.account.id, "acc-nr");
  assert.equal(renamed.account.name, "Altro incasso");
  assert.equal(renamed.account.active, true);
  assert.equal(renamed.book.closingAccUnpaid, "acc-nr");
  assert.equal(renamed.moves[0].to, "acc-nr");
});

test("closings already pointed at Altro incasso in Settings still leave Contanti", () => {
  const plan = E.migrateClosingUnpaidAccount(cashBook({ closingAccUnpaid: "acc-other" }), baseAccounts(), [
    tx("old", { gross: 11, accountId: "acc-cash" }),
    tx("fresh", { gross: 4, accountId: "acc-other" }),
  ]);
  assert.equal(plan.book.closingAccUnpaid, "acc-other");
  assert.equal(plan.book.closingUnpaidRoutedV23, true);
  assert.deepEqual(idsOf(plan), ["old"]);
  const applied = E.applyClosingUnpaidAccount([
    tx("old", { gross: 11, accountId: "acc-cash" }),
    tx("fresh", { gross: 4, accountId: "acc-other" }),
  ], plan);
  assert.equal(applied.transactions.find((t) => t.id === "old").accountId, "acc-other");
  assert.equal(applied.transactions.find((t) => t.id === "fresh").accountId, "acc-other");
});

test("unset channel and a channel still tied to closingAccCash are pointed at Altro incasso", () => {
  const accounts = baseAccounts();
  const missing = E.migrateClosingUnpaidAccount(cashBook({ closingAccUnpaid: "" }), accounts, [tx("a", { gross: 2 })]);
  assert.equal(missing.book.closingAccUnpaid, "acc-other");
  assert.deepEqual(idsOf(missing), ["a"]);

  const tied = E.migrateClosingUnpaidAccount(
    cashBook({ closingAccCash: "acc-cassa", closingAccUnpaid: "acc-cassa" }),
    baseAccounts().concat([{ id: "acc-cassa", name: "Cassetto", kind: "account", icon: "box", active: true }]),
    [tx("b", { gross: 4, accountId: "acc-cassa" }), tx("c", { gross: 1, accountId: "acc-bank", closing: "unpaid" })]
  );
  assert.equal(tied.book.closingAccUnpaid, "acc-other");
  assert.equal(tied.book.closingAccCash, "acc-cassa");
  assert.deepEqual(idsOf(tied), ["b"]);
});

test("saveClosing and the stored migration route unpaid takings and then stay put", async () => {
  const ctx = loadScripts(["js/engine.js", "js/config.js", "js/storage.js"]);
  ctx.GA.config.auth.pbkdf2Iterations = 1000;
  const api = ctx.GA.api;
  await api.bootstrap({ username: "admin", password: "password1", displayName: "Ada" }, "it");

  const fresh = await api.book.get();
  assert.equal(fresh.closingAccUnpaid, "acc-other");
  assert.equal(fresh.closingUnpaidRoutedV23, undefined);

  await api.book.set({ closingAccUnpaid: undefined });
  const unset = await api.transactions.saveClosing({
    date: "2026-11-10",
    rows: { cash: { gross: "10" }, pos: { gross: "20,5" }, unpaid: { gross: 30 } },
  });
  const unsetBy = Object.fromEntries(unset.map((t) => [t.closing, t]));
  assert.equal(unsetBy.cash.accountId, "acc-cash");
  assert.equal(unsetBy.pos.accountId, "acc-bank");
  assert.equal(unsetBy.unpaid.accountId, "acc-other");
  assert.equal(unsetBy.unpaid.paid, true);
  assert.equal(unsetBy.unpaid.closing, "unpaid");

  await api.book.set({ closingAccUnpaid: "acc-cash" });
  const dept = (await api.departments.list())[0].id;
  const seeded = [];
  for (const [date, gross] of [["2026-11-01", 40], ["2026-11-02", 15.5], ["2026-11-03", 20], ["2026-11-11", 7.25]]) {
    seeded.push(await api.transactions.save({
      type: "in", paid: true, date, gross, accountId: "acc-cash", deptId: dept,
      desc: "Chiusura serata", closing: "unpaid", vatId: "v0",
    }));
  }
  const blank = await api.transactions.save({
    type: "in", paid: true, date: "2026-11-05", gross: 9, accountId: "", deptId: dept,
    desc: "Chiusura serata", closing: "unpaid", vatId: "v0",
  });
  const onBank = await api.transactions.save({
    type: "in", paid: true, date: "2026-11-06", gross: 50, accountId: "acc-bank", deptId: dept,
    desc: "Chiusura serata", closing: "unpaid", vatId: "v0",
  });
  const cashChannel = await api.transactions.save({
    type: "in", paid: true, date: "2026-11-01", gross: 8, accountId: "acc-cash", deptId: dept,
    desc: "Chiusura serata", closing: "cash", vatId: "v22",
  });

  await api.users.create({ username: "staff", password: "password1", displayName: "Staff", role: "user" });
  await api.auth.logout();
  await api.auth.login("staff", "password1");
  const skipped = await api.migrateClosingUnpaidAccountV23();
  assert.equal(skipped.n, 0);
  assert.equal((await api.book.get()).closingAccUnpaid, "acc-cash");
  assert.equal((await api.book.get()).closingUnpaidRoutedV23, undefined);
  assert.equal((await api.transactions.list()).find((t) => t.id === seeded[0].id).accountId, "acc-cash");

  await api.auth.logout();
  await api.auth.login("admin", "password1");
  const moved = await api.migrateClosingUnpaidAccountV23();
  assert.equal(moved.n, 5);
  assert.equal(moved.gross, 91.75);
  assert.equal(moved.id, "acc-other");
  const book = await api.book.get();
  assert.equal(book.closingAccUnpaid, "acc-other");
  assert.equal(book.closingUnpaidRoutedV23, true);
  const after = await api.transactions.list();
  const row = (id) => after.find((t) => t.id === id);
  seeded.forEach((t) => assert.equal(row(t.id).accountId, "acc-other"));
  assert.equal(row(blank.id).accountId, "acc-other");
  assert.equal(row(onBank.id).accountId, "acc-bank");
  assert.equal(row(cashChannel.id).accountId, "acc-cash");
  assert.equal(row(unsetBy.unpaid.id).accountId, "acc-other");
  const stamp = row(seeded[0].id).updatedAt;

  const again = await api.migrateClosingUnpaidAccountV23();
  assert.equal(again.n, 0);
  assert.equal(again.book, false);
  assert.equal((await api.transactions.list()).find((t) => t.id === seeded[0].id).updatedAt, stamp);
  assert.equal((await api.book.get()).closingAccUnpaid, "acc-other");

  const enriched = ctx.GA.engine.enrich(await api.transactions.list(), {
    vatRates: await api.vatRates.list(), dedRates: await api.dedRates.list(),
  });
  const bal = ctx.GA.engine.balances(await api.accounts.list(), enriched, []);
  const other = bal.find((a) => a.id === "acc-other");
  const cash = bal.find((a) => a.id === "acc-cash");
  // 30 della chiusura con conto mancante + 40+15.5+20+7.25+9 spostati
  assert.equal(other.income, 121.75);
  assert.equal(cash.income, 18);

  await api.book.set({ closingAccUnpaid: "acc-bank" });
  const kept = await api.migrateClosingUnpaidAccountV23();
  assert.equal(kept.n, 0);
  assert.equal((await api.book.get()).closingAccUnpaid, "acc-bank");
  const custom = await api.transactions.saveClosing({
    date: "2026-11-12",
    rows: { unpaid: { gross: 6 } },
  });
  assert.equal(custom[0].accountId, "acc-bank");
  assert.equal(custom[0].closing, "unpaid");
  const afterChoice = await api.migrateClosingUnpaidAccountV23();
  assert.equal(afterChoice.n, 0);
  assert.equal((await api.transactions.list()).find((t) => t.id === custom[0].id).accountId, "acc-bank");
  assert.equal((await api.book.get()).closingAccUnpaid, "acc-bank");
});

test("migration creates Altro incasso when the account is missing and leaves it active", async () => {
  const ctx = loadScripts(["js/engine.js", "js/config.js", "js/storage.js"]);
  ctx.GA.config.auth.pbkdf2Iterations = 1000;
  const api = ctx.GA.api;
  await api.bootstrap({ username: "admin", password: "password1", displayName: "Ada" }, "it");
  await api.accounts.remove("acc-other");
  await api.book.set({ closingAccUnpaid: "acc-cash" });
  const saved = await api.transactions.save({
    type: "in", paid: true, date: "2026-11-01", gross: 12, accountId: "acc-cash",
    desc: "Chiusura serata", closing: "unpaid", vatId: "v0",
  });
  const out = await api.migrateClosingUnpaidAccountV23();
  assert.equal(out.created, true);
  assert.equal(out.n, 1);
  assert.equal(out.id, "acc-other");
  const acc = (await api.accounts.list()).find((a) => a.id === "acc-other");
  assert.equal(acc.name, "Altro incasso");
  assert.equal(acc.active, true);
  assert.equal((await api.book.get()).closingAccUnpaid, "acc-other");
  assert.equal((await api.transactions.list()).find((t) => t.id === saved.id).accountId, "acc-other");
  const second = await api.migrateClosingUnpaidAccountV23();
  assert.equal(second.n, 0);
  assert.equal(second.created, false);
  assert.equal((await api.accounts.list()).filter((a) => a.id === "acc-other").length, 1);
});

function loadScripts(files) {
  const bag = Object.create(null);
  const localStorage = {
    getItem: (k) => (Object.prototype.hasOwnProperty.call(bag, k) ? bag[k] : null),
    setItem: (k, v) => { bag[k] = String(v); },
    removeItem: (k) => { delete bag[k]; },
    key: (i) => Object.keys(bag)[i] || null,
    get length() { return Object.keys(bag).length; },
  };
  const context = {
    console, crypto: globalThis.crypto, TextEncoder, TextDecoder, URL, Uint8Array,
    localStorage, indexedDB: null, setTimeout, clearTimeout, queueMicrotask,
  };
  context.window = context;
  context.globalThis = context;
  context.self = context;
  vm.createContext(context);
  for (const file of files) {
    vm.runInContext(fs.readFileSync(path.join(ROOT, file), "utf8"), context, { filename: file });
  }
  return context;
}
