
const TARGET = 30000;
const LEGACY_KEY = "fintrack_tx";
const DATA_KEY = "finkastra_v2_data";
const rupiah = (n) =>
  new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(Number(n) || 0);
const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const defaultAccounts = () => [
  { id: "cash", name: "Cash", type: "cash", openingBalance: 356000 },
  {
    id: "investment",
    name: "Investasi",
    type: "investment",
    openingBalance: 149000,
  },
];
let data = loadData();
let editingAccountId = null;

function loadData() {
  try {
    const saved = JSON.parse(localStorage.getItem(DATA_KEY) || "null");
    if (
      saved &&
      Array.isArray(saved.accounts) &&
      Array.isArray(saved.transactions)
    )
      return saved;
  } catch (e) {
    console.warn("Data V2 tidak dapat dibaca.", e);
  }
  let legacy = [];
  try {
    legacy = JSON.parse(localStorage.getItem(LEGACY_KEY) || "[]");
    if (!Array.isArray(legacy)) legacy = [];
  } catch (e) {
    legacy = [];
  }
  // Preserve V1 transactions. V1 investment entries become transfers to the investment account.
  const migrated = legacy.map((t) => ({
    ...t,
    accountId: t.type === "investment" ? "cash" : "cash",
    destinationId: t.type === "investment" ? "investment" : undefined,
    type: t.type === "investment" ? "transfer" : t.type,
    category: t.category || "Lainnya",
  }));
  const initial = { accounts: defaultAccounts(), transactions: migrated };
  try {
    localStorage.setItem(DATA_KEY, JSON.stringify(initial));
  } catch (e) {
    console.warn(e);
  }
  return initial;
}
function persist() {
  localStorage.setItem(DATA_KEY, JSON.stringify(data));
  // Keep a legacy-compatible copy of transaction data for easier rollback to V1.
  localStorage.setItem(LEGACY_KEY, JSON.stringify(data.transactions));
  render();
}
function accountById(id) {
  return data.accounts.find((a) => a.id === id);
}
function accountTypeLabel(type) {
  return (
    {
      cash: "Cash",
      ewallet: "E-wallet",
      bank: "Bank",
      investment: "Investasi",
    }[type] || type
  );
}
function accountIcon(type) {
  return { cash: "◈", ewallet: "▣", bank: "▤", investment: "↗" }[type] || "◈";
}
function balanceFor(account) {
  return data.transactions.reduce(
    (balance, t) => {
      if (t.type === "transfer") {
        if (t.accountId === account.id) balance -= t.amount;
        if (t.destinationId === account.id) balance += t.amount;
      } else if (t.accountId === account.id) {
        if (t.type === "income") balance += t.amount;
        if (t.type === "expense") balance -= t.amount;
      }
      return balance;
    },
    Number(account.openingBalance) || 0,
  );
}
function totals() {
  const balances = data.accounts.map((a) => ({
    account: a,
    balance: balanceFor(a),
  }));
  const investment = balances
    .filter((x) => x.account.type === "investment")
    .reduce((s, x) => s + x.balance, 0);
  const liquid = balances
    .filter((x) => x.account.type !== "investment")
    .reduce((s, x) => s + x.balance, 0);
  return { balances, investment, liquid, total: investment + liquid };
}
function updateTransactionForm() {
  const type = document.getElementById("type").value;
  const isTransfer = type === "transfer";
  document
    .getElementById("categoryLabel")
    .classList.toggle("hidden", isTransfer);
  document
    .getElementById("destinationLabel")
    .classList.toggle("hidden", !isTransfer);
  const accountLabel = document.getElementById("accountLabel");
  accountLabel.querySelector("label");
  accountLabel.firstChild.textContent = isTransfer
    ? "Dari akun"
    : "Akun sumber";
  const categories =
    type === "income"
      ? ["Uang saku", "Gaji/Upah", "Hadiah", "Penjualan", "Lainnya"]
      : type === "investment"
        ? ["Reksa dana", "Crypto", "Emas", "Saham", "Investasi lain"]
        : [
            "Makanan",
            "Transportasi",
            "Kuliah",
            "Tagihan/Angsuran",
            "Belanja",
            "Hiburan",
            "Kesehatan",
            "Lainnya",
          ];
  const category = document.getElementById("category");
  category.innerHTML = categories
    .map((c) => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`)
    .join("");
  populateAccountSelects();
}
function populateAccountSelects() {
  const source = document.getElementById("accountId");
  const dest = document.getElementById("destinationId");
  const type = document.getElementById("type").value;
  const allowed =
    type === "investment"
      ? data.accounts.filter((a) => a.type !== "investment")
      : data.accounts;
  source.innerHTML = allowed
    .map(
      (a) =>
        `<option value="${a.id}">${escapeHtml(a.name)} · ${rupiah(balanceFor(a))}</option>`,
    )
    .join("");
  dest.innerHTML = data.accounts
    .map(
      (a) =>
        `<option value="${a.id}">${escapeHtml(a.name)} · ${rupiah(balanceFor(a))}</option>`,
    )
    .join("");
  if (type === "investment") {
    const investmentAccount = data.accounts.find(
      (a) => a.type === "investment",
    );
    if (investmentAccount) dest.value = investmentAccount.id;
  }
}
function addTransaction() {
  const type = document.getElementById("type").value;
  const amount = Math.round(Number(document.getElementById("amount").value));
  const date = document.getElementById("date").value || today();
  const accountId = document.getElementById("accountId").value;
  const destinationId = document.getElementById("destinationId").value;
  const category = document.getElementById("category").value || "Lainnya";
  const note = document.getElementById("noteInput").value.trim();
  if (!Number.isFinite(amount) || amount <= 0) {
    alert("Masukkan nominal lebih dari Rp0.");
    return;
  }
  if (!accountById(accountId)) {
    alert("Pilih akun terlebih dahulu.");
    return;
  }
  if (
    (type === "expense" || type === "transfer" || type === "investment") &&
    balanceFor(accountById(accountId)) < amount
  ) {
    alert(
      "Saldo akun sumber tidak cukup. Cek saldo akun atau koreksi saldo awal.",
    );
    return;
  }
  if (type === "transfer" && (!destinationId || destinationId === accountId)) {
    alert("Akun tujuan harus berbeda dari akun sumber.");
    return;
  }
  if (type === "investment") {
    const target = accountById(destinationId);
    if (!target || target.type !== "investment") {
      alert(
        "Pilih akun tujuan dengan jenis Investasi. Tambahkan akun investasi jika belum ada.",
      );
      return;
    }
  }
  data.transactions.unshift({
    id: Date.now() + Math.floor(Math.random() * 1000),
    date,
    type,
    amount,
    category,
    accountId,
    destinationId:
      type === "transfer" || type === "investment" ? destinationId : undefined,
    note,
  });
  document.getElementById("amount").value = "";
  document.getElementById("noteInput").value = "";
  persist();
}
function deleteTransaction(id) {
  if (!confirm("Hapus transaksi ini? Saldo akun akan dihitung ulang.")) return;
  data.transactions = data.transactions.filter((t) => t.id !== id);
  persist();
}
function resetData() {
  if (
    !confirm(
      "Reset akan menghapus semua transaksi dan akun tambahan, lalu mengembalikan akun awal V2.0. Export backup dulu jika diperlukan. Lanjutkan?",
    )
  )
    return;
  data = { accounts: defaultAccounts(), transactions: [] };
  persist();
}
function openAccountForm(id = null) {
  editingAccountId = id;
  document.getElementById("accountForm").reset();
  document.getElementById("accountDialogTitle").textContent = id
    ? "Edit akun"
    : "Tambah akun";
  const account = id ? accountById(id) : null;
  document.getElementById("newAccountName").value = account?.name || "";
  document.getElementById("newAccountType").value = account?.type || "cash";
  document.getElementById("newAccountBalance").value = account
    ? account.openingBalance
    : 0;
  document.getElementById("newAccountBalance").disabled = !!account;
  document.getElementById("accountDialog").showModal();
}
function closeAccountForm() {
  document.getElementById("accountDialog").close();
}
function saveAccount(event) {
  event.preventDefault();
  const name = document.getElementById("newAccountName").value.trim();
  const type = document.getElementById("newAccountType").value;
  const balance = Math.round(
    Number(document.getElementById("newAccountBalance").value),
  );
  if (!name || !Number.isFinite(balance) || balance < 0) {
    alert("Isi nama akun dan saldo awal dengan benar.");
    return;
  }
  if (editingAccountId) {
    const a = accountById(editingAccountId);
    if (a) a.name = name;
  } else {
    if (
      data.accounts.some((a) => a.name.toLowerCase() === name.toLowerCase())
    ) {
      alert("Nama akun sudah ada. Gunakan nama yang berbeda.");
      return;
    }
    data.accounts.push({
      id: "acc_" + Date.now(),
      name,
      type,
      openingBalance: balance,
    });
  }
  closeAccountForm();
  persist();
}
function deleteAccount(id) {
  const account = accountById(id);
  if (!account) return;
  if (data.accounts.length <= 1) {
    alert("Minimal harus ada satu akun.");
    return;
  }
  if (
    data.transactions.some((t) => t.accountId === id || t.destinationId === id)
  ) {
    alert(
      "Akun ini sudah dipakai transaksi. Hapus atau ubah transaksi terkait terlebih dahulu agar riwayat tidak rusak.",
    );
    return;
  }
  if (!confirm(`Hapus akun ${account.name}?`)) return;
  data.accounts = data.accounts.filter((a) => a.id !== id);
  persist();
}
function getWeekStart(date = new Date()) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return d;
}
function render() {
  const t = totals();
  document.getElementById("totalAsset").textContent = rupiah(t.total);
  document.getElementById("cash").textContent = rupiah(t.liquid);
  document.getElementById("investment").textContent = rupiah(t.investment);
  renderAccounts(t.balances);
  renderWeeklyProgress();
  renderMonthlySummary();
  renderChart();
  populateAccountSelects();
  renderMonthFilter();
  renderTable();
}
function renderAccounts(balances) {
  const host = document.getElementById("accounts");
  if (!balances.length) {
    host.innerHTML = '<div class="empty-state">Belum ada akun.</div>';
    return;
  }
  host.innerHTML = balances
    .map(
      ({ account, balance }) =>
        `<article class="account-card"><div class="account-top"><span class="account-icon">${accountIcon(account.type)}</span><div class="account-actions"><button class="danger" title="Hapus akun" onclick="deleteAccount('${account.id}')">Hapus</button></div></div><div class="account-name">${escapeHtml(account.name)}</div><div class="account-balance ${balance < 0 ? "red" : ""}">${rupiah(balance)}</div><div class="account-type">${accountTypeLabel(account.type)} · Saldo awal ${rupiah(account.openingBalance)}</div><div class="actions"><button class="secondary" onclick="openAccountForm('${account.id}')">Ubah nama</button></div></article>`,
    )
    .join("");
}
function renderWeeklyProgress() {
  const start = getWeekStart();
  const next = new Date(start);
  next.setDate(next.getDate() + 7);
  const amount =
    data.transactions
      .filter(
        (t) =>
          t.type === "transfer" &&
          accountById(t.destinationId)?.type === "investment" &&
          new Date(t.date + "T00:00:00") >= start &&
          new Date(t.date + "T00:00:00") < next,
      )
      .reduce((s, t) => s + t.amount, 0) +
    data.transactions
      .filter(
        (t) =>
          t.type === "investment" &&
          new Date(t.date + "T00:00:00") >= start &&
          new Date(t.date + "T00:00:00") < next,
      )
      .reduce((s, t) => s + t.amount, 0);
  document.getElementById("weeklyProgress").textContent =
    `${rupiah(amount)} / ${rupiah(TARGET)}`;
  document.getElementById("progressBar").style.width =
    Math.min(100, (amount / TARGET) * 100) + "%";
  let streak = 0;
  for (let i = 0; i < 104; i++) {
    const s = new Date(start);
    s.setDate(s.getDate() - 7 * i);
    const e = new Date(s);
    e.setDate(e.getDate() + 7);
    const total = data.transactions
      .filter(
        (t) =>
          (t.type === "investment" ||
            (t.type === "transfer" &&
              accountById(t.destinationId)?.type === "investment")) &&
          new Date(t.date + "T00:00:00") >= s &&
          new Date(t.date + "T00:00:00") < e,
      )
      .reduce((sum, t) => sum + t.amount, 0);
    if (total >= TARGET) streak++;
    else break;
  }
  document.getElementById("streak").textContent = streak + " 🔥";
}
function renderMonthlySummary() {
  const now = new Date();
  const tx = data.transactions.filter((t) => {
    const d = new Date(t.date + "T00:00:00");
    return (
      d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear()
    );
  });
  document.getElementById("monthIncome").textContent = rupiah(
    tx.filter((t) => t.type === "income").reduce((s, t) => s + t.amount, 0),
  );
  document.getElementById("monthExpense").textContent = rupiah(
    tx.filter((t) => t.type === "expense").reduce((s, t) => s + t.amount, 0),
  );
  document.getElementById("monthInvest").textContent = rupiah(
    tx
      .filter(
        (t) =>
          t.type === "investment" ||
          (t.type === "transfer" &&
            accountById(t.destinationId)?.type === "investment"),
      )
      .reduce((s, t) => s + t.amount, 0),
  );
}
function renderChart() {
  const host = document.getElementById("chart");
  const values = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    const value = data.transactions
      .filter(
        (t) =>
          t.date === key &&
          (t.type === "investment" ||
            (t.type === "transfer" &&
              accountById(t.destinationId)?.type === "investment")),
      )
      .reduce((s, t) => s + t.amount, 0);
    values.push({
      key,
      label: d.toLocaleDateString("id-ID", { weekday: "short" }),
      value,
    });
  }
  const max = Math.max(TARGET, ...values.map((v) => v.value));
  host.innerHTML = values
    .map(
      (v) =>
        `<div class="barwrap"><div class="barvalue">${v.value ? rupiah(v.value).replace(",00", "") : ""}</div><div class="bar-track"><div class="bar" style="height:${v.value ? Math.max(4, (v.value / max) * 100) : 3}%" title="${rupiah(v.value)}"></div></div><div class="barlabel">${v.label}</div></div>`,
    )
    .join("");
}
function renderMonthFilter() {
  const select = document.getElementById("filterMonth");
  const current = select.value;
  const months = [...new Set(data.transactions.map((t) => t.date.slice(0, 7)))]
    .sort()
    .reverse();
  select.innerHTML =
    '<option value="all">Semua bulan</option>' +
    months
      .map(
        (m) =>
          `<option value="${m}">${new Date(m + "-01T00:00:00").toLocaleDateString("id-ID", { month: "long", year: "numeric" })}</option>`,
      )
      .join("");
  if (months.includes(current)) select.value = current;
}
function typeLabel(t) {
  return (
    {
      income: "Pemasukan",
      expense: "Pengeluaran",
      investment: "Investasi",
      transfer: "Transfer",
    }[t] || t
  );
}
function renderTable() {
  const host = document.getElementById("table");
  const query = (document.getElementById("searchInput").value || "")
    .trim()
    .toLowerCase();
  const type = document.getElementById("filterType").value;
  const month = document.getElementById("filterMonth").value;
  const list = data.transactions
    .filter(
      (t) =>
        (type === "all" || t.type === type) &&
        (month === "all" || t.date.startsWith(month)) &&
        (!query ||
          `${t.category} ${t.note || ""} ${accountById(t.accountId)?.name || ""} ${accountById(t.destinationId)?.name || ""}`
            .toLowerCase()
            .includes(query)),
    )
    .sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id);
  document.getElementById("transactionCount").textContent =
    `${list.length} transaksi`;
  if (!list.length) {
    host.innerHTML = '<div class="empty">Belum ada transaksi yang cocok.</div>';
    return;
  }
  host.innerHTML =
    "<table><thead><tr><th>Tanggal</th><th>Jenis</th><th>Kategori</th><th>Akun</th><th>Nominal</th><th>Catatan</th><th></th></tr></thead><tbody>" +
    list
      .map((t) => {
        const from = accountById(t.accountId)?.name || "Akun dihapus";
        const to = accountById(t.destinationId)?.name;
        let accountText =
          t.type === "transfer" || t.type === "investment"
            ? `${from} → ${to || "?"}`
            : from;
        let sign = t.type === "expense" ? "−" : t.type === "income" ? "+" : "";
        let amountClass =
          t.type === "expense"
            ? "expense"
            : t.type === "income"
              ? "income"
              : t.type === "investment"
                ? "green"
                : "";
        return `<tr><td>${escapeHtml(t.date)}</td><td>${typeLabel(t.type)}</td><td>${escapeHtml(t.category || "-")}</td><td>${escapeHtml(accountText)}</td><td class="${amountClass}">${sign}${rupiah(t.amount)}</td><td class="note-cell">${escapeHtml(t.note || "-")}</td><td><button class="danger" onclick="deleteTransaction(${t.id})">Hapus</button></td></tr>`;
      })
      .join("") +
    "</tbody></table>";
}
function escapeHtml(value) {
  return String(value ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#039;",
      })[c],
  );
}
function exportCSV() {
  if (!data.transactions.length) {
    alert("Belum ada transaksi.");
    return;
  }
  const rows = [
    [
      "Tanggal",
      "Jenis",
      "Kategori",
      "Akun sumber",
      "Akun tujuan",
      "Nominal",
      "Catatan",
    ],
    ...data.transactions.map((t) => [
      t.date,
      t.type,
      t.category || "",
      accountById(t.accountId)?.name || "",
      accountById(t.destinationId)?.name || "",
      t.amount,
      t.note || "",
    ]),
  ];
  const csv =
    "\uFEFF" +
    rows
      .map((r) =>
        r.map((v) => `"${String(v).replaceAll('"', '""')}"`).join(","),
      )
      .join("\r\n");
  downloadFile(csv, "finkastra-transaksi.csv", "text/csv;charset=utf-8");
}
function exportBackup() {
  downloadFile(
    JSON.stringify(data, null, 2),
    "finkastra-backup.json",
    "application/json",
  );
}
function downloadFile(content, name, type) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}
function importBackup(event) {
  const file = event.target.files?.[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const imported = JSON.parse(reader.result);
      if (
        !Array.isArray(imported.accounts) ||
        !Array.isArray(imported.transactions)
      )
        throw new Error("format");
      if (
        !confirm(
          "Import backup akan menggantikan data yang sekarang ada di browser. Lanjutkan?",
        )
      )
        return;
      data = imported;
      persist();
      alert("Backup berhasil dimuat.");
    } catch (e) {
      alert("File backup tidak valid.");
    } finally {
      event.target.value = "";
    }
  };
  reader.readAsText(file);
}
document.getElementById("date").value = today();
updateTransactionForm();
render();
