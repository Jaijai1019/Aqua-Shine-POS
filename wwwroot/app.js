'use strict';
/* helpers */
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const peso = n => '₱' + Number(n || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const ymd = d => d.toLocaleDateString('en-CA');
const stat = i => i.stock <= 0 ? ['Out of stock', 'out'] : i.stock <= i.reorder ? ['Low stock', 'low'] : ['Available', 'ok'];

let toastTimer;
function toast(msg, bad = false) {
  const t = $('#toast'); t.textContent = msg; t.className = 'toast show' + (bad ? ' bad' : '');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => t.className = 'toast', 2600);
}

// Export to Excel via HTML Table (Fixes the ##### issue and auto-sizes columns)
function downloadExcel(filename, rows, headersMap) {
  if (!rows || !rows.length) return toast('No data to export.', true);
  
  const keys = Object.keys(headersMap);
  
  // Create HTML table with styling
  let html = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
  <head><meta charset="utf-8"><style>
    table { border-collapse: collapse; font-family: Arial, sans-serif; font-size: 12px; }
    th { background-color: #eaf5ff; color: #245587; border: 1px solid #9bb7d6; padding: 8px; text-align: left; }
    td { border: 1px solid #d5dde6; padding: 6px; }
    /* Force Date & Time column to be wide enough */
    .col-date { mso-number-format:"\\@"; width: 150px; }
    .col-currency { mso-number-format:"\\#\\,##0\\.00"; width: 80px; }
  </style></head><body><table>`;
  
  // Header Row
  html += `<tr>`;
  keys.forEach(k => {
    const cls = k === 'date' ? 'class="col-date"' : (k === 'total' ? 'class="col-currency"' : '');
    html += `<th ${cls}>${esc(headersMap[k])}</th>`;
  });
  html += `</tr>`;
  
  // Data Rows
  rows.forEach(row => {
    html += `<tr>`;
    keys.forEach(k => {
      const val = row[k] === null ? '' : row[k];
      let cls = '';
      if (k === 'date') cls = 'class="col-date"';
      if (k === 'total') cls = 'class="col-currency"';
      

      let displayVal = val;
      if (k === 'total') displayVal = String(val).replace('₱', '').replace(/,/g, '');
      
      html += `<td ${cls}>${esc(displayVal)}</td>`;
    });
    html += `</tr>`;
  });
  
  html += `</table></body></html>`;
  
  // Create and download the file
  const blob = new Blob([html], { type: 'application/vnd.ms-excel' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename.replace('.csv', '.xls');
  a.click();
  URL.revokeObjectURL(url);
}

/* bridge to C# (all database work happens there) */
const pending = new Map(); let seq = 0;
if (window.chrome?.webview) {
  chrome.webview.addEventListener('message', e => {
    const m = e.data, p = pending.get(m.id); if (!p) return; pending.delete(m.id);
    if (m.data && m.data.error) p.reject(new Error(m.data.error)); else p.resolve(m.data);
  });
}
function api(action, payload = {}) {
  return new Promise((resolve, reject) => {
    if (!window.chrome?.webview) { reject(new Error('Open this page through the Aqua Shine desktop app (dotnet run).')); return; }
    const id = ++seq; pending.set(id, { resolve, reject });
    chrome.webview.postMessage({ id, action, payload });
  });
}

/* modal helpers */
function openModal(html) { $('#modalBox').innerHTML = html; $('#modal').classList.remove('hidden'); }
function closeModal() { $('#modal').classList.add('hidden'); $('#modalBox').innerHTML = ''; }
function openForm(title, fields, submit = 'SAVE') {
  return new Promise(res => {
    openModal(`<h2>${esc(title)}</h2><form id="mf">${fields.map(f =>
      `<label>${esc(f.label)} ${f.attrs && f.attrs.includes('required') ? '<span class="req">*</span>' : ''}<input name="${f.key}" type="${f.type || 'text'}" value="${esc(f.value ?? '')}" ${f.attrs || ''}></label>`).join('')}
      <div class="modal-actions"><button class="gradient-button" type="submit">${submit}</button>
      <button class="gradient-button ghost" type="button" id="mc">CANCEL</button></div></form>`);
    const form = $('#mf'); form.querySelector('input').select();
    form.onsubmit = e => { e.preventDefault(); const v = Object.fromEntries(new FormData(form)); closeModal(); res(v); };
    $('#mc').onclick = () => { closeModal(); res(null); };
  });
}
function askConfirm(msg) {
  return new Promise(res => {
    openModal(`<h2>Please confirm</h2><p>${esc(msg)}</p><div class="modal-actions">
      <button class="gradient-button" id="yes">YES</button><button class="gradient-button ghost" id="no">NO</button></div>`);
    $('#yes').onclick = () => { closeModal(); res(true); }; $('#no').onclick = () => { closeModal(); res(false); };
  });
}

/* state */
let user = null, items = [], baskets = [[], []];
const newMeta = () => ({ type: 'Walk-in', customer: '', address: '', contact: '', fee: '', paid: '' });
let meta = [newMeta(), newMeta()];

/* login / sign up */
let signup = false;
function setMode(s, msg = '') {
  signup = s;
  $('#authTitle').textContent = s ? 'ADD NEW USER' : 'LOGIN';
  $('#authSubmit').textContent = s ? 'CREATE ACCOUNT' : 'LOGIN';
  document.querySelectorAll('.signup-only').forEach(e => e.classList.toggle('hidden', !s));
  document.querySelectorAll('.login-only').forEach(e => e.classList.toggle('hidden', s));
  $('#switchText').textContent = s ? 'ALREADY HAVE AN ACCOUNT?' : 'ARE YOU A NEW USER?';
  $('#switchLink').textContent = s ? 'LOGIN' : 'SIGN UP';
  $('#authMsg').textContent = msg || (s ? 'New accounts start as Cashier. An Admin can change roles.' : '');
}
$('#switchLink').onclick = e => { e.preventDefault(); setMode(!signup); };
$('#authForm').onsubmit = async e => {
  e.preventDefault(); $('#authMsg').textContent = '';
  try {
    if (signup) {
      await api('auth.signup', { first: $('#first').value, last: $('#last').value, username: $('#username').value, password: $('#password').value });
      $('#password').value = ''; setMode(false, 'Account created. You can log in now.');
    } else {
      const u = await api('auth.login', { username: $('#username').value, password: $('#password').value, role: $('#role').value });
      $('#password').value = ''; startApp(u);
    }
  } catch (err) { $('#authMsg').textContent = err.message; }
};
setMode(false);
api('auth.info').then(i => { if (i.firstRun) $('#authMsg').textContent = 'First run: log in as admin / admin123 (Role: Admin), then change the password under USERS.'; }).catch(() => { });

/* shell */
const TITLES = { items: 'ITEMS', add: 'ADD ITEMS', stock: 'STOCK', b1: 'BASKET 1', b2: 'BASKET 2', history: 'TRANSACTION HISTORY', users: 'USERS', audit: 'AUDIT LOG' };
function tabsFor(role) {
  const t = ['items'];
  if (role === 'Admin') t.push('add');
  if (role === 'Admin' || role === 'Manager') t.push('stock');
  if (role === 'Cashier') t.push('b1', 'b2');
  t.push('history');
  if (role === 'Admin') t.push('users', 'audit');
  return t;
}
function startApp(u) {
  user = u; baskets = [[], []]; meta = [newMeta(), newMeta()];
  $('#authScreen').classList.add('hidden'); $('#app').classList.remove('hidden');
  $('#userInfo').textContent = `${u.name} · ${u.role}`;
  $('#nav').innerHTML = tabsFor(u.role).map(k =>
    `<button class="gradient-button nav-button" data-view="${k}">${TITLES[k].replace('TRANSACTION HISTORY', 'TRANSACTION<br>HISTORY').replace('AUDIT LOG', 'AUDIT LOG')}` +
    (k === 'b1' || k === 'b2' ? ` <span class="count" id="count${k[1]}">0</span>` : '') + `</button>`).join('');
  go('items');
}

$('#nav').onclick = e => { const b = e.target.closest('[data-view]'); if (b) go(b.dataset.view); };

$('#logoutBtn').onclick = async () => {
  const confirmLogout = await askConfirm('Are you sure you want to log out?');
  if (!confirmLogout) return; 

  if (baskets.some(b => b.length)) {
    const discard = await askConfirm('Warning: Your active baskets have items. Logging out will discard them. Continue?');
    if (!discard) return; 
  }

  await api('auth.logout').catch(() => { });
  user = null; 
  $('#app').classList.add('hidden'); 
  $('#authScreen').classList.remove('hidden'); 
  setMode(false); 
  $('#username').value = ''; 
  $('#username').focus();
};

function updateCounts() { [1, 2].forEach(n => { const el = $('#count' + n); if (el) el.textContent = baskets[n - 1].length; }); }
async function go(k) {
  document.querySelectorAll('.nav-button[data-view]').forEach(b => b.classList.toggle('active', b.dataset.view === k));
  $('#pageTitle').textContent = `${user.role.toUpperCase()} DASHBOARD  ›  ${TITLES[k]}`;
  $('#view').innerHTML = ''; updateCounts();
  const views = { items: viewItems, add: viewAdd, stock: viewStock, b1: () => viewBasket(0), b2: () => viewBasket(1), history: viewHistory, users: viewUsers, audit: viewAudit };
  try { await views[k](); } catch (e) { toast(e.message, true); }
}
function tick() {
  const d = new Date();
  $('#dateToday').textContent = 'DATE TODAY: ' + d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  $('#timeNow').textContent = 'TIME: ' + d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
}
tick(); setInterval(tick, 1000);

/* ITEMS */
async function viewItems() {
  items = await api('items.list');
  const cashier = user.role === 'Cashier';
  const cats = [...new Set(items.map(i => i.category))].sort();
  $('#view').innerHTML = `
    <div class="toolbar">
      <div class="search"><span>🔎</span><input id="q" type="search" placeholder="Search for items, brand or category"></div>
      <select id="cat"><option value="">All categories</option>${cats.map(c => `<option>${esc(c)}</option>`).join('')}</select>
      <select id="status">
        <option value="">All statuses</option>
        <option value="ok">Available</option>
        <option value="low">Low stock</option>
        <option value="out">Out of stock</option>
      </select>
      ${cashier ? `<label class="qtybox">QTY <input id="qty" type="number" min="1" value="1"></label>` : ''}
    </div>
    <div class="tablewrap"><table class="grid"><thead><tr><th>Item</th><th>Brand</th><th>Category</th><th class="num">Price</th><th class="num">Stock</th><th>Status</th>${cashier ? '<th></th>' : ''}</tr></thead><tbody id="rows"></tbody></table></div>`;
  
  const draw = () => {
    const q = $('#q').value.trim().toLowerCase(), c = $('#cat').value, s = $('#status').value;
    const list = items.filter(i => {
      if (c && i.category !== c) return false;
      if (q && ![i.name, i.brand, i.category].some(x => x.toLowerCase().includes(q))) return false;
      if (s) {
        const itemStat = stat(i)[1];
        if (itemStat !== s) return false;
      }
      return true;
    });
    
    $('#rows').innerHTML = list.length ? list.map(i => { const st = stat(i); return `<tr>
      <td><b>${esc(i.name)}</b></td><td>${esc(i.brand)}</td><td>${esc(i.category)}</td><td class="num">${peso(i.price)}</td><td class="num">${i.stock}</td>
      <td><span class="chip ${st[1]}">${st[0]}</span></td>
      ${cashier ? `<td class="act"><button class="small-button" data-b="0" data-id="${i.id}" ${i.stock < 1 ? 'disabled' : ''}>+ BASKET 1</button> <button class="small-button" data-b="1" data-id="${i.id}" ${i.stock < 1 ? 'disabled' : ''}>+ BASKET 2</button></td>` : ''}</tr>`; }).join('')
      : `<tr><td colspan="7" class="emptyrow">No items match your filters.</td></tr>`;
  };
  $('#q').oninput = draw; $('#cat').onchange = draw; $('#status').onchange = draw; draw(); $('#q').focus();
  if (cashier) $('#rows').onclick = e => {
    const b = e.target.closest('button[data-b]'); if (!b) return;
    addToBasket(+b.dataset.b, +b.dataset.id, Math.max(1, parseInt($('#qty').value) || 1));
  };
}
function addToBasket(b, id, qty) {
  const it = items.find(i => i.id === id), line = baskets[b].find(l => l.id === id), have = line ? line.qty : 0;
  if (have + qty > it.stock) { toast(`Only ${it.stock} in stock (Basket ${b + 1} already has ${have}).`, true); return; }
  if (line) { line.qty += qty; line.stock = it.stock; line.price = it.price; }
  else baskets[b].push({ id, name: it.name, price: it.price, qty, stock: it.stock });
  updateCounts(); toast(`Added ${qty} × ${it.name} → Basket ${b + 1}`);
}

/* ADD ITEMS (Admin) */
async function viewAdd() {
  items = await api('items.list');
  const cats = [...new Set(['Water Bottles', 'Caps', 'Seals', 'Filters', 'Pumps', 'Water Products', 'Other', ...items.map(i => i.category)])];
  $('#view').innerHTML = `
    <form id="itemForm" class="formbar" autocomplete="off">
      <label>ITEM NAME <span class="req">*</span><input id="f_name" required></label>
      <label>BRAND<input id="f_brand"></label>
      <label>CATEGORY<input id="f_cat" list="catlist" value="Other"><datalist id="catlist">${cats.map(c => `<option value="${esc(c)}">`).join('')}</datalist></label>
      <label>UNIT PRICE <span class="req">*</span><input id="f_price" type="number" step="0.01" min="0.01" required></label>
      <label>QUANTITY <span class="req">*</span><input id="f_qty" type="number" min="0" value="0" required></label>
      <label>REORDER AT <span class="req">*</span><input id="f_re" type="number" min="0" value="10" required></label>
      <div class="formbtns"><button class="gradient-button" type="submit" id="f_save">SAVE</button><button class="gradient-button ghost" type="button" id="f_clear">NEW</button></div>
    </form>
    <div class="tablewrap"><table class="grid"><thead><tr><th>Item</th><th>Brand</th><th>Category</th><th class="num">Price</th><th class="num">Stock</th><th>Status</th><th></th></tr></thead>
    <tbody>${items.map(i => { const s = stat(i); return `<tr><td><b>${esc(i.name)}</b></td><td>${esc(i.brand)}</td><td>${esc(i.category)}</td>
      <td class="num">${peso(i.price)}</td><td class="num">${i.stock}</td><td><span class="chip ${s[1]}">${s[0]}</span></td>
      <td class="act"><button class="small-button light" data-act="edit" data-id="${i.id}">EDIT</button> <button class="small-button danger" data-act="del" data-id="${i.id}">DELETE</button></td></tr>`; }).join('')}</tbody></table></div>`;
  let editId = 0;
  const clear = () => { editId = 0; $('#itemForm').reset(); $('#f_save').textContent = 'SAVE'; $('#f_name').focus(); };
  $('#f_clear').onclick = clear;
  $('#itemForm').onsubmit = async e => {
    e.preventDefault();
    try {
      await api('items.save', { id: editId, name: $('#f_name').value, brand: $('#f_brand').value, category: $('#f_cat').value, price: $('#f_price').value, qty: $('#f_qty').value, reorder: $('#f_re').value });
      toast(editId ? 'Item updated' : 'Item added'); await viewAdd();
    } catch (err) { toast(err.message, true); }
  };
  $('#view tbody').onclick = async e => {
    const b = e.target.closest('button[data-act]'); if (!b) return;
    const it = items.find(i => i.id === +b.dataset.id);
    if (b.dataset.act === 'edit') {
      editId = it.id; $('#f_name').value = it.name; $('#f_brand').value = it.brand; $('#f_cat').value = it.category;
      $('#f_price').value = it.price; $('#f_qty').value = it.stock; $('#f_re').value = it.reorder; $('#f_save').textContent = 'UPDATE'; $('#f_name').focus();
    } else if (await askConfirm(`Delete "${it.name}"? Past transactions keep their records.`)) {
      try { await api('items.delete', { id: it.id }); toast('Item deleted'); await viewAdd(); } catch (err) { toast(err.message, true); }
    }
  };
  $('#f_name').focus();
}

/* STOCK (Admin / Manager) */
async function viewStock() {
  items = await api('items.list');
  $('#view').innerHTML = `
    <div class="toolbar">
      <div class="search"><span>🔎</span><input id="q" type="search" placeholder="Search item, brand or category"></div>
      <label class="check"><input type="checkbox" id="low"> Low / out of stock only</label>
    </div>
    <div class="tablewrap"><table class="grid"><thead><tr><th>Item</th><th>Brand</th><th>Category</th><th class="num">Price</th><th class="num">Stock</th><th class="num">Reorder at</th><th>Status</th><th></th></tr></thead><tbody id="rows"></tbody></table></div>`;
  const draw = () => {
    const q = $('#q').value.trim().toLowerCase(), low = $('#low').checked;
    const list = items.filter(i => (!low || i.stock <= i.reorder) && (!q || [i.name, i.brand, i.category].some(x => x.toLowerCase().includes(q))));
    $('#rows').innerHTML = list.length ? list.map(i => { const s = stat(i); return `<tr><td><b>${esc(i.name)}</b></td><td>${esc(i.brand)}</td><td>${esc(i.category)}</td>
      <td class="num">${peso(i.price)}</td><td class="num"><b>${i.stock}</b></td><td class="num">${i.reorder}</td><td><span class="chip ${s[1]}">${s[0]}</span></td>
      <td class="act"><button class="small-button" data-act="stock" data-id="${i.id}">+ ADD STOCK</button> <button class="small-button light" data-act="price" data-id="${i.id}">SET PRICE</button></td></tr>`; }).join('')
      : `<tr><td colspan="8" class="emptyrow">Nothing to show.</td></tr>`;
  };
  $('#q').oninput = draw; $('#low').onchange = draw; draw();
  $('#rows').onclick = async e => {
    const b = e.target.closest('button[data-act]'); if (!b) return;
    const it = items.find(i => i.id === +b.dataset.id);
    try {
      if (b.dataset.act === 'stock') {
        const v = await openForm(`Add stock — ${it.name}`, [{ key: 'qty', label: `QUANTITY TO ADD (now ${it.stock})`, type: 'number', value: 1, attrs: 'min="1" required' }, { key: 'reason', label: 'REASON', value: 'Restock' }], 'ADD STOCK');
        if (v) Object.assign(it, await api('stock.add', { id: it.id, qty: v.qty, reason: v.reason }));
      } else {
        const v = await openForm(`Set price — ${it.name}`, [{ key: 'price', label: 'NEW UNIT PRICE (₱)', type: 'number', value: it.price, attrs: 'min="0.01" step="0.01" required' }], 'SET PRICE');
        if (v) Object.assign(it, await api('stock.price', { id: it.id, price: v.price }));
      }
      draw();
    } catch (err) { toast(err.message, true); }
  };
  $('#q').focus();
}

/* BASKETS (Cashier) */
function viewBasket(b) {
  const cart = baskets[b], m = meta[b];
  const subTotal = cart.reduce((s, l) => s + l.price * l.qty, 0);
  const fee = parseFloat(m.fee) || 0;
  const grandTotal = subTotal + fee;
  const units = cart.reduce((s, l) => s + l.qty, 0);
  
  $('#view').innerHTML = `<div class="pos">
    <div class="tablewrap">${cart.length ? `<table class="grid"><thead><tr><th>Item</th><th class="num">Price</th><th class="num">Qty</th><th class="num">Total</th><th></th></tr></thead><tbody id="lines">
      ${cart.map((l, i) => `<tr><td><b>${esc(l.name)}</b></td><td class="num">${peso(l.price)}</td>
        <td class="num"><div class="qty"><button data-a="dec" data-i="${i}">−</button><span>${l.qty}</span><button data-a="inc" data-i="${i}">+</button></div></td>
        <td class="num">${peso(l.price * l.qty)}</td><td class="act"><button class="small-button danger" data-a="del" data-i="${i}">✕</button></td></tr>`).join('')}</tbody></table>`
      : `<div class="empty"><div><strong>BASKET ${b + 1} IS EMPTY</strong>Open ITEMS and add products to this basket.</div></div>`}</div>
    <aside class="summary">
      <h2>BASKET ${b + 1}</h2>
      <label>SALE TYPE<select id="m_type"><option>Walk-in</option><option>Delivery</option></select></label>
      <label>CUSTOMER NAME<input id="m_cust"></label>
      <div id="deliveryFields" style="display:none; flex-direction:column; gap:8px;">
        <label>DELIVERY ADDRESS<input id="m_addr"></label>
        <label>CONTACT NO.<input id="m_contact"></label>
        <label>DELIVERY FEE (₱)<input id="m_fee" type="number" step="0.01" min="0" value="0"></label>
      </div>
      
      <div class="units">${units} unit(s) · ${cart.length} item(s)</div>
      <div style="display:flex; justify-content:space-between; font-size:14px;"><span>Subtotal:</span> <span>${peso(subTotal)}</span></div>
      ${fee > 0 ? `<div style="display:flex; justify-content:space-between; font-size:14px; color:#b3261e;"><span>Delivery Fee:</span> <span>+ ${peso(fee)}</span></div>` : ''}
      <div class="total">TOTAL ${peso(grandTotal)}</div>
      
      <label>AMOUNT PAID<input id="m_paid" type="number" step="0.01" min="0"></label>
      <button class="small-button light" id="m_exact">EXACT AMOUNT</button>
      <div class="change" id="m_change"></div>
      <button class="gradient-button checkout" id="m_pay">CHECKOUT</button>
      <button class="gradient-button ghost" id="m_clear">CLEAR BASKET</button>
    </aside></div>`;
    
  $('#m_type').value = m.type; $('#m_cust').value = m.customer; $('#m_addr').value = m.address; $('#m_contact').value = m.contact; $('#m_fee').value = m.fee; $('#m_paid').value = m.paid;
  
  const toggleDelivery = () => {
    $('#deliveryFields').style.display = m.type === 'Delivery' ? 'flex' : 'none';
  };
  
  const sync = () => { 
    const ch = (parseFloat(m.paid) || 0) - grandTotal;
    $('#m_change').textContent = (ch >= 0 ? 'CHANGE  ' : 'SHORT  ') + peso(Math.abs(ch)); 
    $('#m_change').className = 'change ' + (ch >= 0 ? 'ok' : 'short'); 
  };
  
  $('#m_type').onchange = e => { m.type = e.target.value; if (m.type !== 'Delivery') { m.address = ''; m.contact = ''; m.fee = '0'; } toggleDelivery(); sync(); };
  $('#m_cust').oninput = e => m.customer = e.target.value;
  $('#m_addr').oninput = e => m.address = e.target.value;
  $('#m_contact').oninput = e => m.contact = e.target.value;
  $('#m_fee').oninput = e => { m.fee = e.target.value; viewBasket(b); }; 
  $('#m_paid').oninput = e => { m.paid = e.target.value; sync(); };
  $('#m_exact').onclick = () => { m.paid = grandTotal.toFixed(2); $('#m_paid').value = m.paid; sync(); };
  $('#m_clear').onclick = async () => { if (cart.length && await askConfirm('Remove everything from this basket?')) { baskets[b] = []; meta[b] = newMeta(); updateCounts(); viewBasket(b); } };
  $('#m_pay').onclick = () => checkout(b, grandTotal);
  
  if (cart.length) $('#lines').onclick = e => {
    const btn = e.target.closest('button[data-a]'); if (!btn) return;
    const i = +btn.dataset.i, l = cart[i];
    if (btn.dataset.a === 'del') cart.splice(i, 1);
    else if (btn.dataset.a === 'dec') { l.qty--; if (l.qty < 1) cart.splice(i, 1); }
    else { if (l.qty + 1 > l.stock) { toast(`Only ${l.stock} in stock.`, true); return; } l.qty++; }
    updateCounts(); viewBasket(b);
  };
  toggleDelivery(); sync();
}

async function checkout(b, total) {
  const cart = baskets[b], m = meta[b];
  if (!cart.length) return toast('The basket is empty.', true);
  if (m.type === 'Delivery' && !m.address.trim()) return toast('Enter a delivery address.', true);
  if ((parseFloat(m.paid) || 0) < total) return toast('Amount paid is less than the total.', true);
  try {
    const r = await api('sales.checkout', { lines: cart.map(l => ({ id: l.id, qty: l.qty })), type: m.type, customer: m.customer, address: m.address, contact: m.contact, fee: m.fee, paid: m.paid });
    baskets[b] = []; meta[b] = newMeta(); updateCounts(); viewBasket(b); showReceipt(r.saleId);
  } catch (err) { toast(err.message, true); }
}

/* RECEIPT */
async function showReceipt(id) {
  try {
    const r = await api('sales.receipt', { id });
    openModal(`<div id="receipt"><img class="rlogo" src="img/logo.png" alt=""><h3>AQUA SHINE</h3><div class="c">Electrical and Industrial Supplies Trading</div><hr>
      Receipt : ${esc(r.receipt_no)}<br>Date    : ${esc(r.date)}<br>Cashier : ${esc(r.cashier)}<br>Type    : ${esc(r.type)}<br>
      Customer: ${esc(r.customer || 'Walk-in customer')}<br>
      ${r.type === 'Delivery' ? `Address : ${esc(r.address)}<br>Contact : ${esc(r.contact)}<br>Status  : ${esc(r.d_status)}<br>` : ''}<hr>
      <table><tr><th>ITEM</th><th class="r">QTY</th><th class="r">PRICE</th><th class="r">TOTAL</th></tr>
      ${r.lines.map(l => `<tr><td>${esc(l.name)}</td><td class="r">${l.qty}</td><td class="r">${Number(l.price).toFixed(2)}</td><td class="r">${Number(l.total).toFixed(2)}</td></tr>`).join('')}</table><hr>
      <table>
        <tr><td>Subtotal</td><td class="r">${peso(Number(r.total) - Number(r.fee))}</td></tr>
        ${Number(r.fee) > 0 ? `<tr><td>Delivery Fee</td><td class="r">${peso(r.fee)}</td></tr>` : ''}
        <tr><td><b>TOTAL</b></td><td class="r"><b>${peso(r.total)}</b></td></tr>
        <tr><td>PAID</td><td class="r">${peso(r.paid)}</td></tr>
        <tr><td>CHANGE</td><td class="r">${peso(r.chg)}</td></tr>
      </table><hr>
      <div class="c">Thank you for your purchase!</div></div>
      <div class="modal-actions"><button class="gradient-button" id="pr">PRINT</button><button class="gradient-button ghost" id="cl">CLOSE</button></div>`);
    $('#pr').onclick = () => window.print(); $('#cl').onclick = closeModal;
  } catch (err) { toast(err.message, true); }
}

/* TRANSACTION HISTORY */
let historyCache = []; 

async function viewHistory() {
  const from = new Date(); from.setDate(from.getDate() - 30);
  $('#view').innerHTML = `
    <div class="toolbar">
      <div class="search"><span>🔎</span><input id="h_q" type="search" placeholder="Search receipt no. or customer"></div>
      <label class="qtybox">FROM <input id="h_from" type="date" value="${ymd(from)}"></label>
      <label class="qtybox">TO <input id="h_to" type="date" value="${ymd(new Date())}"></label>
      <button class="gradient-button" id="h_export" style="height:46px; padding:0 20px; font-size:16px;">EXPORT EXCEL</button>
    </div>
    <div class="tablewrap"><table class="grid clickable"><thead><tr><th>Receipt</th><th>Date</th><th>Cashier</th><th>Type</th><th>Customer</th><th>Status (Delivery)</th><th class="num">Total</th></tr></thead><tbody id="rows"></tbody></table></div>
    <div class="footline" id="foot"></div>`;
  let timer;
  const load = async () => {
    try {
      historyCache = await api('sales.list', { from: $('#h_from').value, to: $('#h_to').value, q: $('#h_q').value });
      $('#rows').innerHTML = historyCache.length ? historyCache.map(r => `<tr data-id="${r.id}"><td><b>${esc(r.receipt)}</b></td><td>${esc(r.date)}</td><td>${esc(r.cashier)}</td><td>${esc(r.type)}</td>
        <td>${esc(r.customer || 'Walk-in customer')}</td>
        <td>${r.type === 'Delivery' ? `<span class="chip ${r.d_status === 'Delivered' ? 'ok' : r.d_status === 'Cancelled' ? 'out' : 'low'}">${esc(r.d_status)}</span>` : '-'}</td>
        <td class="num">${peso(r.total)}</td></tr>`).join('') : `<tr><td colspan="7" class="emptyrow">No transactions found.</td></tr>`;
      $('#foot').textContent = `${historyCache.length} transaction(s)  ·  Sales total: ${peso(historyCache.reduce((s, r) => s + Number(r.total), 0))}  ·  Click a row to view the receipt`;
    } catch (err) { toast(err.message, true); }
  };
  
  $('#h_export').onclick = () => downloadExcel(`Transactions_${ymd(new Date())}.xls`, historyCache, {
    receipt: 'Receipt No', date: 'Date & Time', cashier: 'Cashier', type: 'Type', customer: 'Customer', total: 'Total'
  });
  
  $('#h_q').oninput = () => { clearTimeout(timer); timer = setTimeout(load, 250); };
  $('#h_from').onchange = load; $('#h_to').onchange = load;
  $('#rows').onclick = e => { 
    const tr = e.target.closest('tr[data-id]'); 
    if (tr) { 
      const id = +tr.dataset.id;
      const rowData = e.target.closest('tbody').rows[Array.from(e.target.closest('tbody').rows).indexOf(tr)];
      if (user.role !== 'Cashier' && tr.innerHTML.includes('Delivery')) {
        openDeliveryStatus(id);
      } else {
        showReceipt(id); 
      }
    } 
  };
  load(); $('#h_q').focus();
}

async function openDeliveryStatus(id) {
  try {
    const r = await api('sales.receipt', { id });
    openModal(`<h2>Delivery Status</h2>
      <p><b>Receipt:</b> ${esc(r.receipt_no)}<br><b>Customer:</b> ${esc(r.customer)}<br><b>Address:</b> ${esc(r.address)}</p>
      <label style="display:block; margin-bottom:8px;">Update Status:
        <select id="d_status" style="width:100%; height:40px; margin-top:4px; padding:0 8px; border:1px solid #6d8fb5; border-radius:6px;">
          <option ${r.d_status === 'Pending' ? 'selected' : ''}>Pending</option>
          <option ${r.d_status === 'Out for Delivery' ? 'selected' : ''}>Out for Delivery</option>
          <option ${r.d_status === 'Delivered' ? 'selected' : ''}>Delivered</option>
          <option ${r.d_status === 'Cancelled' ? 'selected' : ''}>Cancelled</option>
        </select>
      </label>
      <div class="modal-actions">
        <button class="gradient-button" id="upd">UPDATE</button>
        <button class="gradient-button ghost" id="view_rcpt">VIEW RECEIPT</button>
        <button class="gradient-button ghost" id="cancel">CANCEL</button>
      </div>`);
    
    $('#upd').onclick = async () => {
      try {
        await api('sales.updateDelivery', { id: r.id, status: $('#d_status').value });
        toast('Delivery status updated');
        closeModal();
        viewHistory(); 
      } catch (e) { toast(e.message, true); }
    };
    $('#view_rcpt').onclick = () => { closeModal(); showReceipt(r.id); };
    $('#cancel').onclick = closeModal;
  } catch (err) { toast(err.message, true); }
}

/* USERS (Admin) */
async function viewUsers() {
  const users = await api('users.list');
  $('#view').innerHTML = `<div class="tablewrap"><table class="grid"><thead><tr><th>Username</th><th>Name</th><th>Role</th><th>Created</th><th></th></tr></thead><tbody id="rows">
    ${users.map(u => `<tr><td><b>${esc(u.username)}</b></td><td>${esc(u.name)}</td>
      <td><select data-role="${u.id}">${['Admin', 'Manager', 'Cashier'].map(r => `<option ${r === u.role ? 'selected' : ''}>${r}</option>`).join('')}</select></td>
      <td>${esc(String(u.created).slice(0, 10))}</td>
      <td class="act">
        <button class="small-button" data-act="role" data-id="${u.id}">APPLY ROLE</button> 
        <button class="small-button light" data-act="pw" data-id="${u.id}" data-name="${esc(u.username)}">RESET PASSWORD</button>
        <button class="small-button danger" data-act="del" data-id="${u.id}" data-name="${esc(u.username)}">DELETE</button>
      </td></tr>`).join('')}</tbody></table></div>`;
      
  $('#rows').onclick = async e => {
    const b = e.target.closest('button[data-act]'); if (!b) return;
    try {
      if (b.dataset.act === 'role') {
        await api('users.setRole', { id: +b.dataset.id, role: $(`select[data-role="${b.dataset.id}"]`).value }); toast('Role updated'); viewUsers();
      } else if (b.dataset.act === 'pw') {
        const v = await openForm(`New password for ${b.dataset.name}`, [{ key: 'password', label: 'NEW PASSWORD (min. 6 characters)', type: 'password', attrs: 'required minlength="6"' }], 'RESET');
        if (v) { await api('users.resetPassword', { id: +b.dataset.id, password: v.password }); toast('Password updated'); }
      } else if (b.dataset.act === 'del') {
        if (await askConfirm(`Are you sure you want to remove access for "${b.dataset.name}"?`)) {
            await api('users.delete', { id: +b.dataset.id }); 
            toast('User deactivated'); 
            viewUsers();
        }
      }
    } catch (err) { toast(err.message, true); }
  };
}

/*AUDIT LOG (Admin)*/
let auditCache = []; 

async function viewAudit() {
  auditCache = await api('audit.list');
  $('#view').innerHTML = `
    <div class="toolbar">
      <h2 style="flex:1; margin:0; font:700 20px var(--head); color:var(--brand);">System Audit Logs</h2>
      <button class="gradient-button" id="a_export" style="height:46px; padding:0 20px; font-size:16px;">EXPORT EXCEL</button>
    </div>
    <div class="tablewrap"><table class="grid"><thead><tr><th>Date & Time</th><th>User</th><th>Action</th><th>Details</th></tr></thead><tbody>
    ${auditCache.length ? auditCache.map(l => `<tr><td>${esc(l.date)}</td><td><b>${esc(l.username)}</b></td>
      <td><span class="chip ${l.action.includes('Delete') || l.action.includes('Cancelled') ? 'out' : 'ok'}">${esc(l.action)}</span></td>
      <td>${esc(l.details)}</td></tr>`).join('') : `<tr><td colspan="4" class="emptyrow">No audit logs found.</td></tr>`}
  </tbody></table></div>`;
  
  $('#a_export').onclick = () => downloadExcel(`AuditLogs_${ymd(new Date())}.xls`, auditCache, {
    date: 'Date & Time', username: 'User', action: 'Action', details: 'Details'
  });
}