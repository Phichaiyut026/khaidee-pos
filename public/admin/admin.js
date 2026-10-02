// ===== Helpers =====
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const money = (n) => '฿' + Number(n || 0).toLocaleString('th-TH', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
const toDate = (s) => new Date(String(s).replace(' ', 'T') + 'Z'); // SQLite stores UTC
const fmtDate = (s) => toDate(s).toLocaleString('th-TH', { dateStyle: 'short', timeStyle: 'short' });
const fmtTime = (s) => {
  const d = toDate(s);
  return d.toDateString() === new Date().toDateString()
    ? d.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })
    : d.toLocaleDateString('th-TH', { day: 'numeric', month: 'short' });
};

const CHANNELS = { pos: 'หน้าร้าน', tiktok: 'TikTok Shop' };
const STATUSES = { pending: 'รอชำระ/รอยืนยัน', paid: 'ชำระแล้ว รอส่ง', shipped: 'จัดส่งแล้ว', completed: 'สำเร็จ', cancelled: 'ยกเลิก' };
const PLATFORMS = { line: 'LINE', instagram: 'Instagram', facebook: 'Facebook' };
const PAYMENTS = { cash: 'เงินสด', promptpay: 'พร้อมเพย์', card: 'บัตร', transfer: 'โอนเงิน', cod: 'เก็บเงินปลายทาง' };
const ICONS = {
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
  trend: '<path d="M3 17l6-6 4 4 8-8"/><path d="M15 7h6v6"/>',
  store: '<path d="M3 9l1.5-5h15L21 9"/><path d="M4 9v11h16V9"/><path d="M3 9h18"/><path d="M9 20v-6h6v6"/>',
  music: '<path d="M9 18V5l11-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="17" cy="16" r="3"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  cash: '<rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="2.5"/><path d="M6 12h.01M18 12h.01"/>',
  qr: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><path d="M14 14h3v3h-3zM18 18h3v3h-3zM14 20h1M20 14h1"/>',
  transfer: '<path d="M4 8h14l-3-3"/><path d="M20 16H6l3 3"/>',
  card: '<rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20M6 15h4"/>',
  cart: '<circle cx="9" cy="20" r="1.5"/><circle cx="18" cy="20" r="1.5"/><path d="M2 3h3l2.7 12.4a2 2 0 0 0 2 1.6h8.6a2 2 0 0 0 2-1.6L22 7H6"/>',
  trash: '<path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  print: '<path d="M6 9V3h12v6"/><rect x="3" y="9" width="18" height="8" rx="2"/><path d="M7 14h10v7H7z"/>',
  box: '<path d="M21 8 12 3 3 8v8l9 5 9-5z"/><path d="M3 8l9 5 9-5M12 13v8"/>',
  scan: '<path d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2M7 8v8M10.5 8v8M14 8v8M17 8v8"/>',
  refresh: '<path d="M21 12a9 9 0 1 1-3-6.7L21 8"/><path d="M21 3v5h-5"/>',
  edit: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>',
  layers: '<path d="m12 3 9 5-9 5-9-5z"/><path d="m3 13 9 5 9-5"/>',
};
const icon = (name) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${ICONS[name]}</svg>`;

// Soft pastel tile for products/avatars without a picture (hue derived from the name)
const hueFor = (s) => [...String(s)].reduce((a, c) => (a * 31 + c.charCodeAt(0)) % 360, 7);
const tint = (s) => {
  const h = hueFor(s);
  return `background:linear-gradient(135deg,hsl(${h} 90% 94%),hsl(${(h + 30) % 360} 75% 84%));color:hsl(${h} 45% 34%)`;
};
// Thai names often start with a leading vowel (เสื้อ, แก้ว) — show the first consonant instead
const initialOf = (name) => String(name || '?').replace(/^[เแโใไ]+/, '').slice(0, 1).toUpperCase();

function productImg(p, cls = 'thumb') {
  if (p.image_url) return `<img class="${cls}" src="${esc(p.image_url)}" alt="">`;
  return `<div class="${cls}" style="${tint(p.name)}">${esc(initialOf(p.name))}</div>`;
}

async function api(path, opts = {}) {
  const res = await fetch('/api/admin' + path, {
    method: opts.method || 'GET',
    headers: opts.body ? { 'Content-Type': 'application/json' } : undefined,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  if (res.status === 401) { location.href = '/admin/login.html'; throw new Error('unauthorized'); }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'เกิดข้อผิดพลาด');
  return data;
}

function toast(msg, type = '') {
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.innerHTML = `<span class="ti">${type === 'error' ? '!' : '✓'}</span><span></span>`;
  el.lastChild.textContent = msg;
  $('#toasts').append(el);
  setTimeout(() => el.remove(), 3500);
}

async function attempt(fn) {
  try { return await fn(); } catch (err) { toast(err.message, 'error'); }
}

function modal({ title, body, foot = '', wide = false, kind = '' }) {
  const root = $('#modal-root');
  root.innerHTML = `<div class="modal-bg"><div class="modal" data-kind="${kind}" style="${wide ? 'width:min(760px,100%)' : ''}">
    <div class="modal-head"><h2>${title}</h2><button class="x" data-close>&times;</button></div>
    <div class="modal-body">${body}</div>${foot ? `<div class="modal-foot">${foot}</div>` : ''}</div></div>`;
  const bg = $('.modal-bg', root);
  bg.addEventListener('click', (e) => { if (e.target === bg || e.target.closest('[data-close]')) closeModal(); });
  return $('.modal', root);
}
const closeModal = () => { $('#modal-root').innerHTML = ''; };
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeModal(); });

let settings = {};

// ===== Router =====
const views = {};
let current = null;

function route() {
  const name = (location.hash.slice(1).split('?')[0]) || 'dashboard';
  current = views[name] ? name : 'dashboard';
  $$('.nav a[data-view]').forEach((a) => a.classList.toggle('active', a.dataset.view === current));
  views[current].render($('#view'));
}
window.addEventListener('hashchange', route);

// ===== Dashboard =====
views.dashboard = {
  async render(el) {
    const d = await api('/dashboard');
    if (current !== 'dashboard') return;
    const total = d.byChannel.reduce((s, c) => s + c.revenue, 0);
    const count = d.byChannel.reduce((s, c) => s + c.orders, 0);
    const ch = (k) => d.byChannel.find((c) => c.channel === k) || { revenue: 0, orders: 0 };

    const days = [];
    for (let i = 6; i >= 0; i--) {
      const dt = new Date(); dt.setDate(dt.getDate() - i);
      const key = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
      days.push({ label: dt.toLocaleDateString('th-TH', { weekday: 'short' }), revenue: d.last7.find((x) => x.day === key)?.revenue || 0 });
    }
    const max = Math.max(1, ...days.map((x) => x.revenue));

    el.innerHTML = `
      <div class="view-head">
        <div><h1>สวัสดี 👋 ภาพรวมวันนี้</h1><div class="page-sub">${new Date().toLocaleDateString('th-TH', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</div></div>
        <div class="spacer"></div><a class="btn primary" href="#pos">${icon('store')}เปิดหน้าขาย</a></div>
      <div class="kpis">
        <div class="card card-pad kpi hero"><div class="kpi-top"><span class="label">ยอดขายรวมวันนี้</span><span class="kpi-icon">${icon('trend')}</span></div>
          <div class="value num">${money(total)}</div><div class="sub">${count} บิล</div></div>
        <div class="card card-pad kpi"><div class="kpi-top"><span class="label">ขายหน้าร้าน</span><span class="kpi-icon blue">${icon('store')}</span></div>
          <div class="value num">${money(ch('pos').revenue)}</div><div class="sub">${ch('pos').orders} บิล</div></div>
        <div class="card card-pad kpi"><div class="kpi-top"><span class="label">TikTok Shop</span><span class="kpi-icon dark">${icon('music')}</span></div>
          <div class="value num">${money(ch('tiktok').revenue)}</div><div class="sub">${ch('tiktok').orders} ออเดอร์</div></div>
        <div class="card card-pad kpi"><div class="kpi-top"><span class="label">งานค้าง</span><span class="kpi-icon amber">${icon('clock')}</span></div>
          <div class="value num">${d.pending}</div><div class="sub"><a href="#orders">ออเดอร์รอส่ง</a> · <a href="#chat">${d.unread} แชทใหม่</a></div></div>
      </div>
      <div class="dash-grid">
        <div class="card card-pad">
          <div class="card-title"><h2>ยอดขาย 7 วันล่าสุด</h2><span class="muted num">${money(days.reduce((s, x) => s + x.revenue, 0))}</span></div>
          <div class="bars">${days.map((x, i) => `<div class="bar ${i === 6 ? 'today' : ''}" title="${money(x.revenue)}"><b>${x.revenue ? money(x.revenue) : ''}</b><i style="height:${(x.revenue / max) * 100}%"></i><span>${i === 6 ? 'วันนี้' : x.label}</span></div>`).join('')}</div>
        </div>
        <div class="card card-pad">
          <div class="card-title"><h2>สินค้าใกล้หมด</h2><a href="#products" style="font-size:13px">ดูทั้งหมด</a></div>
          ${d.lowStock.length ? d.lowStock.map((p) => `<div class="list-row">${productImg(p)}<span class="grow">${esc(p.name)}</span><span class="pill ${p.stock <= 0 ? 'cancelled' : 'pending'}">เหลือ ${p.stock}</span></div>`).join('') : `<div class="empty">${icon('box')}สต็อกเพียงพอทุกรายการ</div>`}
        </div>
        <div class="card card-pad">
          <div class="card-title"><h2>สินค้าขายดี 30 วัน</h2></div>
          ${d.topProducts.length ? d.topProducts.map((p, i) => `<div class="list-row"><span class="rank r${i + 1}">${i + 1}</span><span class="grow">${esc(p.name)}</span><span class="muted">${p.qty} ชิ้น</span><span class="num" style="font-weight:600">${money(p.revenue)}</span></div>`).join('') : `<div class="empty">${icon('trend')}ยังไม่มียอดขาย</div>`}
        </div>
      </div>`;
  },
};

// ===== POS =====
const pos = {
  products: [],
  cart: [], // {product, qty}
  category: '',
  search: '',
  method: 'cash',
  discount: 0,
};

views.pos = {
  async render(el) {
    pos.products = (await api('/products')).filter((p) => p.active);
    if (current !== 'pos') return;
    el.innerHTML = `
      <div class="pos-layout">
        <div class="pos-left">
          <div class="input-icon">${icon('search')}<input class="input" id="pos-search" data-scan placeholder="ค้นหาชื่อสินค้า / SKU หรือยิงเครื่องสแกนได้เลย" autocomplete="off"></div>
          <div class="scan-hint"><span class="dot"></span>พร้อมสแกนบาร์โค้ด / QR — ยิงได้ทันทีไม่ต้องคลิกช่องค้นหา (ใช้ได้แม้แป้นพิมพ์เป็นภาษาไทย)</div>
          <div class="tabs" id="pos-cats"></div>
          <div class="pos-grid" id="pos-grid"></div>
        </div>
        <div class="card cart">
          <div class="cart-head">
            <h2>ตะกร้า <span class="cart-count" id="cart-count">0</span></h2><button class="btn sm ghost danger" id="pos-clear">${icon('trash')}ล้าง</button>
          </div>
          <div class="cart-items" id="cart-items"></div>
          <div class="cart-foot" id="cart-foot"></div>
        </div>
      </div>`;
    const search = $('#pos-search');
    search.value = pos.search;
    search.focus();
    search.addEventListener('input', () => { pos.search = search.value; drawGrid(); });
    search.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter') return;
      const q = search.value.trim();
      const hit = Scanner.match(q, pos.products) || (filtered().length === 1 ? filtered()[0] : null);
      if (hit) { addToCart(hit); search.value = ''; pos.search = ''; drawGrid(); }
      else toast('ไม่พบสินค้า', 'error');
    });
    $('#pos-clear').onclick = () => { pos.cart = []; pos.discount = 0; drawCart(); };
    drawCats(); drawGrid(); drawCart();
  },
};

function filtered() {
  const q = pos.search.trim().toLowerCase();
  return pos.products.filter((p) => (!pos.category || p.category === pos.category)
    && (!q || p.name.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q) || (p.barcode || '').includes(q)));
}

function drawCats() {
  const cats = [...new Set(pos.products.map((p) => p.category))];
  $('#pos-cats').innerHTML = ['', ...cats].map((c) => `<button class="${c === pos.category ? 'active' : ''}" data-c="${esc(c)}">${esc(c || 'ทั้งหมด')}</button>`).join('');
  $$('#pos-cats button').forEach((b) => b.onclick = () => { pos.category = b.dataset.c; drawCats(); drawGrid(); });
}

function drawGrid() {
  const grid = $('#pos-grid');
  if (!grid) return;
  const list = filtered();
  grid.innerHTML = list.length ? list.map((p) => `
    <button class="pcard" data-id="${p.id}" ${p.stock <= 0 ? 'disabled' : ''}>
      <div class="img" style="${p.image_url ? '' : tint(p.name)}">${p.image_url ? `<img src="${esc(p.image_url)}" alt="">` : esc(initialOf(p.name))}
        <span class="stock-chip ${p.stock <= 5 ? 'low' : ''}">${p.stock <= 0 ? 'หมด' : `เหลือ ${p.stock}`}</span></div>
      <div class="pbody"><div class="name">${esc(p.name)}</div>
        <div class="row"><span class="price num">${money(p.price)}</span><span class="add">+</span></div></div>
    </button>`).join('') : `<div class="empty" style="grid-column:1/-1">${icon('search')}ไม่พบสินค้า</div>`;
  $$('.pcard', grid).forEach((b) => b.onclick = () => addToCart(pos.products.find((p) => p.id === Number(b.dataset.id))));
  markGrid();
}

// Show how many of each product are already in the cart, right on its card
function markGrid() {
  $$('#pos-grid .pcard').forEach((el) => {
    const line = pos.cart.find((l) => l.product.id === Number(el.dataset.id));
    let tag = $('.in-cart', el);
    if (!line) return tag?.remove();
    if (!tag) { tag = document.createElement('span'); tag.className = 'in-cart'; $('.img', el).append(tag); }
    tag.textContent = `×${line.qty}`;
  });
}

function addToCart(product) {
  const line = pos.cart.find((l) => l.product.id === product.id);
  const inCart = line ? line.qty : 0;
  if (inCart + 1 > product.stock) {
    toast(`"${product.name}" คงเหลือ ${product.stock} ชิ้น`, 'error');
    return false;
  }
  if (line) line.qty++; else pos.cart.push({ product, qty: 1 });
  drawCart();
  const card = $(`#pos-grid .pcard[data-id="${product.id}"]`);
  if (card) { card.classList.remove('bump'); void card.offsetWidth; card.classList.add('bump'); }
  return true;
}

const cartTotals = () => {
  const subtotal = pos.cart.reduce((s, l) => s + l.product.price * l.qty, 0);
  const discount = Math.min(subtotal, Math.max(0, Number(pos.discount) || 0));
  return { subtotal, discount, total: subtotal - discount };
};

function drawCart() {
  const items = $('#cart-items');
  if (!items) return;
  items.innerHTML = pos.cart.length ? pos.cart.map((l, i) => `
    <div class="cart-item">
      ${productImg(l.product)}
      <div class="nm">${esc(l.product.name)}</div>
      <div class="line-total num">${money(l.product.price * l.qty)}</div>
      <div class="unit num">${money(l.product.price)} / ชิ้น</div>
      <div class="qty"><button data-i="${i}" data-d="-1">−</button><span>${l.qty}</span><button data-i="${i}" data-d="1">+</button></div>
    </div>`).join('') : `<div class="cart-empty">${icon('cart')}<div>ยังไม่มีสินค้า<br><small>แตะสินค้า หรือยิงเครื่องสแกนเพื่อเริ่มขาย</small></div></div>`;
  $('#cart-count').textContent = pos.cart.reduce((s, l) => s + l.qty, 0);
  markGrid();
  $$('.qty button', items).forEach((b) => b.onclick = () => {
    const line = pos.cart[b.dataset.i];
    const next = line.qty + Number(b.dataset.d);
    if (next > line.product.stock) return toast(`คงเหลือ ${line.product.stock} ชิ้น`, 'error');
    if (next <= 0) pos.cart.splice(b.dataset.i, 1); else line.qty = next;
    drawCart();
  });

  const t = cartTotals();
  $('#cart-foot').innerHTML = `
    <div class="sum-row"><span>ยอดรวม</span><span class="num">${money(t.subtotal)}</span></div>
    <div class="sum-row"><span>ส่วนลด (บาท)</span><input class="input num" id="pos-discount" type="number" min="0" value="${pos.discount || ''}" placeholder="0" style="width:110px;text-align:right;padding:6px 10px"></div>
    <div class="sum-row total"><span>ยอดชำระ</span><span class="amt num">${money(t.total)}</span></div>
    <div class="seg">${[['cash', 'cash'], ['promptpay', 'qr'], ['transfer', 'transfer'], ['card', 'card']].map(([m, ic]) => `<button data-m="${m}" class="${pos.method === m ? 'active' : ''}">${icon(ic)}${PAYMENTS[m]}</button>`).join('')}</div>
    ${pos.method === 'cash' ? `
      <div class="sum-row"><span>รับเงิน</span><input class="input num" id="pos-cash" type="number" min="0" placeholder="${t.total}" style="width:140px;text-align:right;padding:6px 10px"></div>
      <div class="quick-cash">${[0, 100, 500, 1000].map((v) => `<button class="btn sm" data-cash="${v}">${v ? money(v) : 'พอดี'}</button>`).join('')}</div>
      <div class="sum-row change-row"><span>เงินทอน</span><span class="amt num" id="pos-change">฿0</span></div>` : ''}
    <button class="btn success lg pay" id="pos-pay" ${pos.cart.length ? '' : 'disabled'}><span>ชำระเงิน</span><span class="amt num">${money(t.total)}</span></button>`;

  $('#pos-discount').onchange = (e) => { pos.discount = e.target.value; drawCart(); };
  $$('.seg button').forEach((b) => b.onclick = () => { pos.method = b.dataset.m; drawCart(); });
  const cash = $('#pos-cash');
  if (cash) {
    const upd = () => { $('#pos-change').textContent = money(Math.max(0, (Number(cash.value) || t.total) - t.total)); };
    cash.oninput = upd;
    $$('[data-cash]').forEach((b) => b.onclick = () => { cash.value = Number(b.dataset.cash) || t.total; upd(); });
  }
  $('#pos-pay').onclick = () => checkout();
}

async function checkout() {
  const t = cartTotals();
  const cash = $('#pos-cash')?.value;
  if (pos.method === 'cash' && cash && Number(cash) < t.total) return toast('รับเงินไม่พอ', 'error');

  if (pos.method === 'promptpay') {
    const { qr } = await api(`/promptpay?amount=${t.total}`);
    const m = modal({
      title: 'สแกนจ่ายพร้อมเพย์',
      body: qr ? `<div style="text-align:center"><img src="${qr}" style="width:250px;border-radius:14px;border:1px solid var(--border);padding:8px"><div class="success-hero" style="background:var(--primary-soft);margin:14px 0 6px"><div class="muted">ยอดที่ต้องชำระ</div><div class="amt" style="color:var(--primary)">${money(t.total)}</div></div><p class="muted" style="margin:0">ตรวจสอบยอดเงินเข้าก่อนกดยืนยัน</p></div>`
        : '<p>ยังไม่ได้ตั้งค่าหมายเลขพร้อมเพย์ (ไปที่ ตั้งค่า) — ตรวจสอบการโอนแล้วกดยืนยันได้เลย</p>',
      foot: '<button class="btn" data-close>ยกเลิก</button><button class="btn success" id="pp-ok">ได้รับเงินแล้ว</button>',
    });
    $('#pp-ok', m).onclick = () => submitSale(t);
    return;
  }
  submitSale(t, cash);
}

async function submitSale(t, cash) {
  const order = await attempt(() => api('/sales', {
    method: 'POST',
    body: {
      items: pos.cart.map((l) => ({ product_id: l.product.id, qty: l.qty })),
      discount: t.discount,
      payment_method: pos.method,
      cash_received: cash || undefined,
    },
  }));
  if (!order) return;
  pos.cart = []; pos.discount = 0;
  showReceipt(order);
  views.pos.render($('#view'));
}

function receiptHtml(o) {
  return `<div class="receipt">
    <div class="c big">${esc(settings.shop_name)}</div>
    ${settings.shop_address ? `<div class="c">${esc(settings.shop_address)}</div>` : ''}
    ${settings.shop_phone ? `<div class="c">โทร ${esc(settings.shop_phone)}</div>` : ''}
    <hr><div class="r"><span>เลขที่ ${esc(o.order_no)}</span></div><div>${fmtDate(o.created_at)}</div><hr>
    ${o.items.map((it) => `<div>${esc(it.name)}</div><div class="r"><span>&nbsp; ${it.qty} × ${money(it.price)}</span><span>${money(it.qty * it.price)}</span></div>`).join('')}
    <hr><div class="r"><span>รวม</span><span>${money(o.subtotal)}</span></div>
    ${o.discount ? `<div class="r"><span>ส่วนลด</span><span>-${money(o.discount)}</span></div>` : ''}
    ${o.shipping ? `<div class="r"><span>ค่าส่ง</span><span>${money(o.shipping)}</span></div>` : ''}
    <div class="r big"><span>สุทธิ</span><span>${money(o.total)}</span></div>
    <div class="r"><span>ชำระโดย</span><span>${esc(PAYMENTS[o.payment_method] || o.payment_method)}</span></div>
    ${o.payment_method === 'cash' ? `<div class="r"><span>รับเงิน</span><span>${money(o.cash_received)}</span></div><div class="r"><span>เงินทอน</span><span>${money(o.change_amount)}</span></div>` : ''}
    <hr><div class="c">${esc(settings.receipt_footer)}</div></div>`;
}

function showReceipt(o) {
  const m = modal({
    title: 'ชำระเงินสำเร็จ',
    kind: 'receipt',
    body: `<div class="success-hero">${o.payment_method === 'cash' && o.change_amount
      ? `<div class="muted">เงินทอน</div><div class="amt">${money(o.change_amount)}</div>`
      : `<div class="muted">รับชำระแล้ว</div><div class="amt">${money(o.total)}</div>`}</div>${receiptHtml(o)}`,
    foot: `<button class="btn" data-close>ปิด</button><button class="btn primary" id="print">${icon('print')}พิมพ์ใบเสร็จ</button>`,
  });
  $('#print', m).onclick = () => printReceipt(o);
}

function printReceipt(o) {
  $('#print-area').innerHTML = receiptHtml(o);
  window.print();
}

// ===== Products =====
views.products = {
  async render(el) {
    const list = await api('/products');
    if (current !== 'products') return;
    el.innerHTML = `
      <div class="view-head"><h1>สินค้า / สต็อก</h1><div class="spacer"></div>
        <div class="input-icon" style="width:240px">${icon('search')}<input class="input" id="p-search" placeholder="ค้นหาสินค้า..."></div>
        <button class="btn" id="p-labels">${icon('qr')}พิมพ์ป้าย QR</button>
        <button class="btn primary" id="p-add">${icon('plus')}เพิ่มสินค้า</button></div>
      <div class="card table-wrap"><table class="table">
        <thead><tr><th>สินค้า</th><th>หมวด</th><th class="r">ราคา</th><th class="r">ต้นทุน</th><th class="r">คงเหลือ</th><th></th></tr></thead>
        <tbody id="p-rows"></tbody></table></div>`;
    const draw = () => {
      const q = $('#p-search').value.toLowerCase();
      const rows = list.filter((p) => !q || p.name.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q));
      $('#p-rows').innerHTML = rows.map((p) => `
        <tr style="${p.active ? '' : 'opacity:.5'}">
          <td><div class="cell-main">${productImg(p)}<div><div style="font-weight:500">${esc(p.name)}${p.active ? '' : ' <span class="pill">ปิดขาย</span>'}</div>
            <div class="sub">${esc(p.sku)}${p.barcode ? ` · ${esc(p.barcode)}` : ''}</div></div></div></td>
          <td><span class="pill" style="background:var(--surface-3)">${esc(p.category)}</span></td>
          <td class="r num" style="font-weight:600">${money(p.price)}</td><td class="r num muted">${money(p.cost)}</td>
          <td class="r num"><span class="pill ${p.stock <= 0 ? 'cancelled' : p.stock <= 5 ? 'pending' : 'completed'}">${p.stock}</span></td>
          <td class="r" style="white-space:nowrap"><button class="btn sm" data-label="${p.id}" title="ป้าย QR">${icon('qr')}</button> <button class="btn sm" data-stock="${p.id}">${icon('layers')}สต็อก</button> <button class="btn sm" data-edit="${p.id}">${icon('edit')}แก้ไข</button></td>
        </tr>`).join('') || `<tr><td colspan="6"><div class="empty">${icon('box')}ไม่มีสินค้า</div></td></tr>`;
      $$('[data-edit]').forEach((b) => b.onclick = () => productForm(list.find((p) => p.id === Number(b.dataset.edit))));
      $$('[data-stock]').forEach((b) => b.onclick = () => stockForm(list.find((p) => p.id === Number(b.dataset.stock))));
    };
    $('#p-search').oninput = draw;
    $('#p-add').onclick = () => productForm(null);
    $('#p-labels').onclick = () => labelsForm(list.filter((p) => p.active), null);
    $('#p-rows').addEventListener('click', (e) => {
      const id = Number(e.target.closest('[data-label]')?.dataset.label);
      if (id) labelsForm(list.filter((p) => p.active || p.id === id), id);
    });
    draw();
  },
};

function productForm(p, prefill = {}) {
  const v = p || { sku: '', barcode: '', name: '', description: '', category: 'ทั่วไป', price: '', cost: '', stock: 0, image_url: '', active: 1, ...prefill };
  const m = modal({
    title: p ? 'แก้ไขสินค้า' : 'เพิ่มสินค้า',
    wide: true,
    body: `<form id="pf" class="form-grid">
      <label class="field">ชื่อสินค้า *<input class="input" name="name" value="${esc(v.name)}" required></label>
      <label class="field">หมวดหมู่<input class="input" name="category" value="${esc(v.category)}"></label>
      <label class="field">SKU * (ใช้จับคู่กับ TikTok Shop)<input class="input" name="sku" value="${esc(v.sku)}" required></label>
      <label class="field">บาร์โค้ด / รหัส QR (คลิกช่องแล้วยิงเครื่องสแกนได้)<input class="input" name="barcode" value="${esc(v.barcode)}"></label>
      <label class="field">ราคาขาย *<input class="input" name="price" type="number" step="0.01" min="0" value="${v.price}" required></label>
      <label class="field">ต้นทุน<input class="input" name="cost" type="number" step="0.01" min="0" value="${v.cost}"></label>
      <label class="field">จำนวนคงเหลือ<input class="input" name="stock" type="number" step="1" value="${v.stock}"></label>
      <label class="field">ลิงก์รูปภาพ (URL)<input class="input" name="image_url" value="${esc(v.image_url)}" placeholder="https://..."></label>
      <label class="field full">รายละเอียด<textarea class="input" name="description" rows="3">${esc(v.description)}</textarea></label>
      <label class="check"><input type="checkbox" name="active" ${v.active ? 'checked' : ''}> เปิดขาย</label>
    </form>`,
    foot: `${p ? '<button class="btn danger" id="pf-del" style="margin-right:auto">ลบ</button>' : ''}<button class="btn" data-close>ยกเลิก</button><button class="btn primary" id="pf-save">บันทึก</button>`,
  });
  $('#pf-save', m).onclick = async () => {
    const f = $('#pf', m);
    if (!f.reportValidity()) return;
    const body = Object.fromEntries(new FormData(f));
    body.active = f.active.checked;
    const ok = await attempt(() => api(p ? `/products/${p.id}` : '/products', { method: p ? 'PUT' : 'POST', body }));
    if (ok) { closeModal(); toast('บันทึกแล้ว'); route(); }
  };
  if (p) $('#pf-del', m).onclick = async () => {
    if (!confirm(`ลบ "${p.name}" ?`)) return;
    const r = await attempt(() => api(`/products/${p.id}`, { method: 'DELETE' }));
    if (r) { closeModal(); toast(r.deactivated ? 'สินค้ามีประวัติการขาย จึงปิดการขายแทนการลบ' : 'ลบแล้ว'); route(); }
  };
}

function stockForm(p) {
  const m = modal({
    title: `ปรับสต็อก: ${esc(p.name)}`,
    body: `<p>คงเหลือปัจจุบัน <b>${p.stock}</b> ชิ้น</p>
      <label class="field">รับเข้า (+) / ตัดออก (−)<input class="input" id="adj" type="number" step="1" placeholder="เช่น 20 หรือ -3" autofocus></label>`,
    foot: '<button class="btn" data-close>ยกเลิก</button><button class="btn primary" id="adj-ok">บันทึก</button>',
  });
  $('#adj-ok', m).onclick = async () => {
    const n = Math.floor(Number($('#adj', m).value));
    if (!n) return;
    if (await attempt(() => api(`/products/${p.id}`, { method: 'PUT', body: { stock: p.stock + n } }))) { closeModal(); route(); }
  };
}

// QR labels for products that have no barcode printed on them. The QR holds the barcode, or the SKU.
function labelsForm(list, onlyId) {
  const m = modal({
    title: 'พิมพ์ป้าย QR สินค้า',
    wide: true,
    body: `<p class="muted" style="margin-top:0">ใส่จำนวนป้ายที่ต้องการต่อสินค้า แล้วกดพิมพ์ (กระดาษ A4, 4 ป้ายต่อแถว ตัดตามเส้นประ)</p>
      <div style="display:flex;gap:8px;margin-bottom:10px"><button class="btn sm" id="lb-all">ใส่ 1 ทุกรายการ</button><button class="btn sm" id="lb-stock">ใส่ตามจำนวนคงเหลือ</button><button class="btn sm" id="lb-none">ล้าง</button></div>
      <table class="table"><thead><tr><th>สินค้า</th><th>รหัสใน QR</th><th class="r">จำนวนป้าย</th></tr></thead><tbody>
      ${list.map((p) => `<tr><td>${esc(p.name)}</td><td class="muted">${esc(p.barcode || p.sku)}</td>
        <td class="r"><input class="input num" type="number" min="0" step="1" data-lid="${p.id}" value="${onlyId == null || onlyId === p.id ? 1 : 0}" style="width:80px;text-align:right"></td></tr>`).join('')}
      </tbody></table>`,
    foot: '<button class="btn" data-close>ยกเลิก</button><button class="btn primary" id="lb-print">พิมพ์</button>',
  });
  const inputs = $$('[data-lid]', m);
  $('#lb-all', m).onclick = () => inputs.forEach((i) => { i.value = 1; });
  $('#lb-none', m).onclick = () => inputs.forEach((i) => { i.value = 0; });
  $('#lb-stock', m).onclick = () => inputs.forEach((i) => { i.value = Math.max(0, list.find((p) => p.id === Number(i.dataset.lid)).stock); });
  $('#lb-print', m).onclick = async () => {
    const picks = inputs
      .map((i) => ({ p: list.find((x) => x.id === Number(i.dataset.lid)), n: Math.min(500, Math.max(0, Math.floor(Number(i.value) || 0))) }))
      .filter((x) => x.n > 0);
    if (!picks.length) return toast('ยังไม่ได้เลือกจำนวนป้าย', 'error');
    const { qrs } = await api('/qr', { method: 'POST', body: { texts: picks.map((x) => x.p.barcode || x.p.sku) } });
    const html = picks.flatMap((x, i) => Array(x.n).fill(`
      <div class="qr-label"><img src="${qrs[i]}" alt=""><div class="ln">${esc(x.p.name)}</div>
        <div class="lp">${money(x.p.price)}</div><div class="lc">${esc(x.p.barcode || x.p.sku)}</div></div>`)).join('');
    const area = $('#print-area');
    area.innerHTML = `<div class="qr-labels">${html}</div>`;
    await Promise.all($$('img', area).map((img) => img.decode().catch(() => {})));
    closeModal();
    window.print();
  };
}

// ===== Product lookup (price / stock check — the PDA screen) =====
const lookup = { products: [], last: null, history: [] };

views.lookup = {
  async render(el) {
    lookup.products = await api('/products');
    if (current !== 'lookup') return;
    if (lookup.last) lookup.last.p = Scanner.match(lookup.last.code, lookup.products); // refresh after edits
    el.innerHTML = `
      <div class="view-head"><h1>เช็คสินค้า</h1></div>
      <form class="lk-search" id="lk-form">
        <div class="input-icon">${icon('scan')}<input class="input" id="lk-q" data-scan placeholder="ยิงสแกน หรือพิมพ์บาร์โค้ด / SKU" autocomplete="off"></div>
        <button class="btn primary">ค้นหา</button>
      </form>
      <div id="lk-result"></div>
      <h2 style="margin:20px 0 8px">สแกนล่าสุด</h2>
      <div class="card" id="lk-history"></div>`;
    $('#lk-form').onsubmit = async (e) => {
      e.preventDefault();
      const q = $('#lk-q').value.trim();
      if (!q) return;
      $('#lk-q').value = '';
      Scanner.beep(await lookupCode(q));
    };
    drawLookup();
  },
};

async function lookupCode(code) {
  lookup.products = await api('/products'); // always show live stock
  const p = Scanner.match(code, lookup.products);
  lookup.last = { code, p, at: new Date() };
  lookup.history = [lookup.last, ...lookup.history].slice(0, 15);
  if (current === 'lookup') drawLookup();
  return Boolean(p);
}

function drawLookup() {
  const box = $('#lk-result');
  if (!box) return;
  const last = lookup.last;
  if (!last) {
    box.innerHTML = `<div class="card lk-empty"><div class="scan-ico">${icon('scan')}</div>
      <div><b style="color:var(--text)">พร้อมสแกน</b><br>ยิงบาร์โค้ด / QR ของสินค้าเพื่อดูราคาและสต็อก</div></div>`;
  } else if (!last.p) {
    box.innerHTML = `<div class="card lk-card lk-miss">
      <div class="lk-status">ไม่พบสินค้า</div>
      <div class="muted">รหัส <b>${esc(last.code)}</b> ยังไม่มีในระบบ</div>
      <div class="lk-actions"><button class="btn primary" id="lk-new">+ เพิ่มเป็นสินค้าใหม่</button></div></div>`;
    $('#lk-new').onclick = () => productForm(null, { barcode: last.code });
  } else {
    const p = last.p;
    const stockCls = p.stock <= 0 ? 'cancelled' : p.stock <= 5 ? 'pending' : 'completed';
    box.innerHTML = `<div class="card lk-card">
      <div class="lk-top">${productImg(p, 'lk-img')}
        <div style="min-width:0"><div class="lk-name">${esc(p.name)}</div>
          <div class="muted">${esc(p.category)}${p.active ? '' : ' · <span class="pill cancelled">ปิดขาย</span>'}</div></div></div>
      <div class="lk-price num">${money(p.price)}</div>
      <div class="lk-grid">
        <div><div class="muted">คงเหลือ</div><span class="pill ${stockCls}" style="font-size:16px">${p.stock} ชิ้น</span></div>
        <div><div class="muted">ต้นทุน / กำไร</div>${money(p.cost)} / ${money(p.price - p.cost)}</div>
        <div><div class="muted">SKU</div>${esc(p.sku)}</div>
        <div><div class="muted">บาร์โค้ด</div>${esc(p.barcode || '-')}</div>
      </div>
      <div class="lk-actions">
        <button class="btn" id="lk-stock">ปรับสต็อก</button>
        <button class="btn" id="lk-edit">แก้ไข</button>
        <button class="btn primary" id="lk-sell" ${p.active && p.stock > 0 ? '' : 'disabled'}>ขายสินค้านี้</button>
      </div></div>`;
    $('#lk-stock').onclick = () => stockForm(p);
    $('#lk-edit').onclick = () => productForm(p);
    $('#lk-sell').onclick = () => { if (addToCart(p)) location.hash = '#pos'; };
  }
  $('#lk-history').innerHTML = lookup.history.map((h, i) => `
    <div class="list-row lk-row" data-i="${i}"><span class="muted num">${h.at.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>
      <span class="grow">${h.p ? esc(h.p.name) : '<span style="color:var(--danger)">ไม่พบสินค้า</span>'}</span>
      <span class="muted" style="font-size:12px">${esc(h.code.length > 24 ? h.code.slice(0, 24) + '…' : h.code)}</span></div>`).join('')
    || '<div class="empty">ยังไม่มีการสแกน</div>';
  $$('.lk-row').forEach((r) => r.onclick = () => { lookup.last = lookup.history[r.dataset.i]; drawLookup(); });
}

// ===== Orders =====
const orderFilter = { channel: '', status: '', q: '' };
views.orders = {
  async render(el) {
    el.innerHTML = `
      <div class="view-head"><h1>คำสั่งซื้อทุกช่องทาง</h1><div class="spacer"></div>
        <button class="btn" id="tt-sync">ดึงออเดอร์ TikTok</button></div>
      <div class="view-head">
        <div class="tabs" id="o-ch">${[['', 'ทุกช่องทาง'], ...Object.entries(CHANNELS)].map(([k, l]) => `<button data-v="${k}" class="${orderFilter.channel === k ? 'active' : ''}">${l}</button>`).join('')}</div>
        <select class="input" id="o-st" style="width:auto">${[['', 'ทุกสถานะ'], ...Object.entries(STATUSES)].map(([k, l]) => `<option value="${k}" ${orderFilter.status === k ? 'selected' : ''}>${l}</option>`).join('')}</select>
        <input class="input" id="o-q" placeholder="เลขออเดอร์ / ชื่อ / เบอร์" value="${esc(orderFilter.q)}" style="width:240px">
      </div>
      <div class="card table-wrap"><table class="table">
        <thead><tr><th>เลขที่</th><th>ช่องทาง</th><th>ลูกค้า</th><th>วันที่</th><th>ชำระโดย</th><th class="r">ยอด</th><th>สถานะ</th></tr></thead>
        <tbody id="o-rows"><tr><td colspan="7" class="empty">กำลังโหลด...</td></tr></tbody></table></div>`;
    $$('#o-ch button').forEach((b) => b.onclick = () => { orderFilter.channel = b.dataset.v; route(); });
    $('#o-st').onchange = (e) => { orderFilter.status = e.target.value; loadOrders(); };
    let timer;
    $('#o-q').oninput = (e) => { clearTimeout(timer); timer = setTimeout(() => { orderFilter.q = e.target.value; loadOrders(); }, 300); };
    $('#tt-sync').onclick = syncTikTok;
    loadOrders();
  },
};

async function loadOrders() {
  const qs = new URLSearchParams(Object.entries(orderFilter).filter(([, v]) => v));
  const list = await api(`/orders?${qs}`);
  const tbody = $('#o-rows');
  if (!tbody) return;
  tbody.innerHTML = list.map((o) => `
    <tr class="click" data-id="${o.id}">
      <td><b>${esc(o.order_no)}</b></td><td><span class="ch ${o.channel}">${CHANNELS[o.channel] || o.channel}</span></td>
      <td>${esc(o.customer_name || '-')}<div class="muted" style="font-size:12px">${esc(o.customer_phone)}</div></td>
      <td class="muted">${fmtDate(o.created_at)}</td><td>${esc(PAYMENTS[o.payment_method] || o.payment_method)}</td>
      <td class="r num">${money(o.total)}</td><td><span class="pill ${o.status}">${STATUSES[o.status]}</span></td>
    </tr>`).join('') || '<tr><td colspan="7" class="empty">ไม่มีคำสั่งซื้อ</td></tr>';
  $$('tr[data-id]', tbody).forEach((tr) => tr.onclick = () => orderDetail(tr.dataset.id));
}

async function orderDetail(id) {
  const o = await api(`/orders/${id}`);
  const m = modal({
    title: `${esc(o.order_no)} <span class="ch ${o.channel}" style="margin-left:8px">${CHANNELS[o.channel]}</span>`,
    wide: true,
    body: `
      <div class="form-grid" style="margin-bottom:16px">
        <div><div class="muted">ลูกค้า</div>${esc(o.customer_name || '-')}<br>${esc(o.customer_phone)}</div>
        <div><div class="muted">ที่อยู่จัดส่ง</div>${esc(o.customer_address || '-')}</div>
        <div><div class="muted">วันที่</div>${fmtDate(o.created_at)}</div>
        <div><div class="muted">ชำระโดย</div>${esc(PAYMENTS[o.payment_method] || o.payment_method)}</div>
        ${o.note ? `<div class="full"><div class="muted">หมายเหตุ</div>${esc(o.note)}</div>` : ''}
      </div>
      <table class="table"><thead><tr><th>สินค้า</th><th class="r">ราคา</th><th class="r">จำนวน</th><th class="r">รวม</th></tr></thead><tbody>
        ${o.items.map((it) => `<tr><td>${esc(it.name)}${it.product_id ? '' : ' <span class="pill pending" title="ไม่พบ SKU นี้ในระบบ สต็อกจึงไม่ถูกตัด">ไม่ตรง SKU</span>'}<div class="muted" style="font-size:12px">${esc(it.sku)}</div></td><td class="r">${money(it.price)}</td><td class="r">${it.qty}</td><td class="r">${money(it.price * it.qty)}</td></tr>`).join('')}
      </tbody></table>
      <div style="max-width:260px;margin:12px 0 0 auto;display:flex;flex-direction:column;gap:4px">
        <div class="sum-row"><span>รวม</span><span>${money(o.subtotal)}</span></div>
        ${o.discount ? `<div class="sum-row"><span>ส่วนลด</span><span>-${money(o.discount)}</span></div>` : ''}
        ${o.shipping ? `<div class="sum-row"><span>ค่าส่ง</span><span>${money(o.shipping)}</span></div>` : ''}
        <div class="sum-row total"><span>สุทธิ</span><span>${money(o.total)}</span></div>
      </div>
      <label class="field" style="margin-top:16px">สถานะ
        <select class="input" id="od-status">${Object.entries(STATUSES).map(([k, l]) => `<option value="${k}" ${o.status === k ? 'selected' : ''}>${l}</option>`).join('')}</select>
      </label>
      ${o.channel === 'tiktok' ? '<p class="muted" style="font-size:13px">สถานะของออเดอร์ TikTok จะถูกอัปเดตอัตโนมัติจาก TikTok Shop เมื่อมีการซิงก์</p>' : ''}`,
    foot: '<button class="btn" id="od-print" style="margin-right:auto">พิมพ์ใบเสร็จ</button><button class="btn" data-close>ปิด</button><button class="btn primary" id="od-save">บันทึกสถานะ</button>',
  });
  $('#od-print', m).onclick = () => printReceipt(o);
  $('#od-save', m).onclick = async () => {
    const status = $('#od-status', m).value;
    if (status === 'cancelled' && o.status !== 'cancelled' && !confirm('ยกเลิกออเดอร์นี้? สต็อกจะถูกคืน')) return;
    if (await attempt(() => api(`/orders/${o.id}`, { method: 'PATCH', body: { status } }))) { closeModal(); toast('อัปเดตสถานะแล้ว'); loadOrders(); }
  };
}

async function syncTikTok() {
  const r = await attempt(() => api('/tiktok/sync', { method: 'POST' }));
  if (!r) return;
  toast(`${r.demo ? '[โหมดทดลอง] ' : ''}TikTok: ออเดอร์ใหม่ ${r.created} · อัปเดต ${r.updated}`);
  if (current === 'orders') loadOrders();
}

// ===== Unified chat =====
const chat = { platform: '', activeId: null, convs: [] };
const QUICK_REPLIES = [
  'สวัสดีค่ะ ยินดีให้บริการค่ะ 😊',
  'สินค้ามีพร้อมส่งค่ะ',
  'รบกวนแจ้งชื่อ ที่อยู่ และเบอร์โทรสำหรับจัดส่งค่ะ',
  'ได้รับยอดโอนแล้วค่ะ จะจัดส่งภายใน 1-2 วันทำการนะคะ',
  'ขอบคุณที่อุดหนุนค่ะ 🙏',
];

views.chat = {
  async render(el) {
    el.innerHTML = `
      <div class="view-head"><h1>แชทรวม LINE · Instagram · Facebook</h1><div class="spacer"></div>
        <button class="btn" id="sim">จำลองข้อความเข้า</button></div>
      <div class="card chat">
        <div class="conv-list">
          <div class="tabs" id="c-pl">${[['', 'ทั้งหมด'], ...Object.entries(PLATFORMS)].map(([k, l]) => `<button data-v="${k}" class="${chat.platform === k ? 'active' : ''}">${l}</button>`).join('')}</div>
          <div class="convs" id="convs"></div>
        </div>
        <div class="thread" id="thread"><div class="empty" style="margin:auto">เลือกห้องแชททางซ้าย</div></div>
      </div>`;
    $$('#c-pl button').forEach((b) => b.onclick = () => { chat.platform = b.dataset.v; $$('#c-pl button').forEach((x) => x.classList.toggle('active', x === b)); loadConvs(); });
    $('#sim').onclick = simulateForm;
    await loadConvs();
    if (chat.activeId) openThread(chat.activeId);
  },
};

function avatar(c) {
  const inner = c.avatar_url ? `<img src="${esc(c.avatar_url)}" alt="">` : esc(initialOf(c.display_name));
  return `<div class="avatar" style="${c.avatar_url ? '' : tint(c.display_name)}">${inner}<span class="plat ${c.platform}"></span></div>`;
}

async function loadConvs() {
  chat.convs = await api(`/conversations${chat.platform ? `?platform=${chat.platform}` : ''}`);
  const box = $('#convs');
  if (!box) return;
  box.innerHTML = chat.convs.map((c) => `
    <div class="conv ${c.id === chat.activeId ? 'active' : ''} ${c.unread ? 'unread' : ''}" data-id="${c.id}">
      ${avatar(c)}
      <div class="info"><div class="top"><span class="nm">${esc(c.display_name)}</span><span class="time">${fmtTime(c.last_message_at)}</span></div>
        <div class="top"><span class="last">${esc(c.last_message)}</span>${c.unread ? `<span class="badge">${c.unread}</span>` : ''}</div></div>
    </div>`).join('') || '<div class="empty">ยังไม่มีข้อความ<br><small>เชื่อมต่อบัญชีที่หน้า ตั้งค่า หรือกด "จำลองข้อความเข้า"</small></div>';
  $$('.conv', box).forEach((d) => d.onclick = () => openThread(Number(d.dataset.id)));
}

async function openThread(id) {
  chat.activeId = id;
  const conv = chat.convs.find((c) => c.id === id);
  if (!conv) return;
  $$('.conv').forEach((d) => d.classList.toggle('active', Number(d.dataset.id) === id));
  const msgs = await api(`/conversations/${id}/messages`);
  const thread = $('#thread');
  if (!thread || chat.activeId !== id) return;
  conv.unread = 0;
  const row = $(`.conv[data-id="${id}"]`);
  row?.classList.remove('unread');
  $('.badge', row || document.createElement('div'))?.remove();
  const draft = $('#reply')?.value || '';
  thread.innerHTML = `
    <div class="thread-head">${avatar(conv)}<div><b>${esc(conv.display_name)}</b><div class="muted" style="font-size:12px"><span class="ch ${conv.platform}">${PLATFORMS[conv.platform]}</span></div></div></div>
    <div class="msgs" id="msgs">${msgs.map((m) => `
      <div class="msg ${m.direction} ${m.status === 'failed' ? 'failed' : ''}">${esc(m.text)}
        <div class="meta">${fmtTime(m.created_at)}${m.status === 'demo' ? ' · โหมดทดลอง (ยังไม่ได้เชื่อมต่อ)' : ''}${m.status === 'failed' ? ` · ส่งไม่สำเร็จ: ${esc(m.error)}` : ''}</div></div>`).join('')}</div>
    <div class="composer">
      <div class="quick-replies">${QUICK_REPLIES.map((q) => `<button data-q="${esc(q)}">${esc(q.length > 24 ? q.slice(0, 24) + '…' : q)}</button>`).join('')}</div>
      <form class="row" id="reply-form"><textarea class="input" id="reply" placeholder="พิมพ์ข้อความ… (Enter ส่ง · Shift+Enter ขึ้นบรรทัด)"></textarea><button class="btn primary">ส่ง</button></form>
    </div>`;
  const box = $('#msgs');
  box.scrollTop = box.scrollHeight;
  const input = $('#reply');
  input.value = draft;
  input.focus();
  $$('[data-q]').forEach((b) => b.onclick = () => { input.value = b.dataset.q; input.focus(); });
  input.onkeydown = (e) => { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); $('#reply-form').requestSubmit(); } };
  $('#reply-form').onsubmit = async (e) => {
    e.preventDefault();
    const text = input.value.trim();
    if (!text) return;
    input.value = '';
    if (!(await attempt(() => api(`/conversations/${id}/messages`, { method: 'POST', body: { text } })))) input.value = text;
  };
  refreshBadges();
}

function simulateForm() {
  const m = modal({
    title: 'จำลองข้อความจากลูกค้า',
    body: `<div class="form-grid">
      <label class="field">ช่องทาง<select class="input" id="s-pl">${Object.entries(PLATFORMS).map(([k, l]) => `<option value="${k}">${l}</option>`).join('')}</select></label>
      <label class="field">ชื่อลูกค้า<input class="input" id="s-name" value="ลูกค้าทดสอบ"></label>
      <label class="field full">ข้อความ<input class="input" id="s-text" value="สวัสดีค่ะ เสื้อสีขาวไซซ์ M ยังมีไหมคะ"></label></div>`,
    foot: '<button class="btn" data-close>ยกเลิก</button><button class="btn primary" id="s-ok">ส่ง</button>',
  });
  $('#s-ok', m).onclick = async () => {
    await attempt(() => api('/conversations/simulate', { method: 'POST', body: { platform: $('#s-pl', m).value, name: $('#s-name', m).value, text: $('#s-text', m).value } }));
    closeModal();
  };
}

// ===== Settings =====
views.settings = {
  async render(el) {
    const [s, integ] = await Promise.all([api('/settings'), api('/integrations')]);
    if (current !== 'settings') return;
    const origin = location.origin;
    const st = (on, onText = 'เชื่อมต่อแล้ว', offText = 'โหมดทดลอง') => `<span class="status ${on ? 'on' : 'off'}">${on ? onText : offText}</span>`;
    el.innerHTML = `
      <div class="view-head"><h1>ตั้งค่า / เชื่อมต่อ</h1></div>
      <div class="settings-grid">
        <form class="card card-pad" id="sf" style="display:flex;flex-direction:column;gap:12px">
          <h2>ข้อมูลร้าน</h2>
          <label class="field">ชื่อร้าน<input class="input" name="shop_name" value="${esc(s.shop_name)}"></label>
          <label class="field">เบอร์โทร<input class="input" name="shop_phone" value="${esc(s.shop_phone)}"></label>
          <label class="field">ที่อยู่ (แสดงบนใบเสร็จ)<textarea class="input" name="shop_address" rows="2">${esc(s.shop_address)}</textarea></label>
          <label class="field">หมายเลขพร้อมเพย์ (เบอร์มือถือ / เลขบัตรประชาชน / เลขผู้เสียภาษี)<input class="input" name="promptpay_id" value="${esc(s.promptpay_id)}" placeholder="0812345678"></label>
          <label class="field">ข้อความท้ายใบเสร็จ<input class="input" name="receipt_footer" value="${esc(s.receipt_footer)}"></label>
          <div><button class="btn primary">บันทึก</button></div>
        </form>
        <div class="card card-pad">
          <h2>การเชื่อมต่อช่องทาง</h2>
          <div class="integ">
            <div class="head"><span class="ch line"><b>LINE Official Account</b></span>${st(integ.line.configured)}</div>
            <div class="muted" style="font-size:13px">ตั้ง LINE_CHANNEL_SECRET และ LINE_CHANNEL_ACCESS_TOKEN ใน .env แล้วใส่ Webhook URL นี้ใน LINE Developers Console</div>
            <code>${origin}/webhooks/line</code>
          </div>
          <div class="integ">
            <div class="head"><span class="ch facebook"><b>Facebook Page</b></span> + <span class="ch instagram"><b>Instagram</b></span>${st(integ.meta.configured)}</div>
            <div class="muted" style="font-size:13px">ตั้ง META_APP_SECRET, META_VERIFY_TOKEN, META_PAGE_ACCESS_TOKEN ใน .env แล้วใส่ Callback URL นี้ใน Meta App (Webhooks → Page และ Instagram, subscribe ฟิลด์ messages)</div>
            <code>${origin}/webhooks/meta</code>
          </div>
          <div class="integ">
            <div class="head"><span class="ch tiktok"><b>TikTok Shop</b></span>${st(integ.tiktok.configured, integ.tiktok.shop_name ? `เชื่อมต่อแล้ว: ${esc(integ.tiktok.shop_name)}` : 'เชื่อมต่อแล้ว')}</div>
            <div class="muted" style="font-size:13px">ตั้ง TIKTOK_APP_KEY, TIKTOK_APP_SECRET (และ TIKTOK_SERVICE_ID) ใน .env · Redirect URL และ Webhook URL ใน TikTok Partner Center:</div>
            <code>${origin}/integrations/tiktok/callback</code>
            <code>${origin}/webhooks/tiktok</code>
            <div class="muted" style="font-size:13px">ซิงก์ล่าสุด: ${integ.tiktok.last_sync ? new Date(integ.tiktok.last_sync * 1000).toLocaleString('th-TH') : '—'} · ระบบดึงอัตโนมัติทุก 5 นาทีเมื่อเชื่อมต่อแล้ว · สินค้าจับคู่ด้วย Seller SKU</div>
            <div style="display:flex;gap:8px">
              ${integ.tiktok.authorize_url ? `<a class="btn" href="${esc(integ.tiktok.authorize_url)}">อนุญาตร้านค้า TikTok</a>` : ''}
              <button class="btn" type="button" id="tt-sync2">ดึงออเดอร์ตอนนี้</button>
            </div>
          </div>
        </div>
      </div>`;
    $('#sf').onsubmit = async (e) => {
      e.preventDefault();
      const saved = await attempt(() => api('/settings', { method: 'PUT', body: Object.fromEntries(new FormData(e.target)) }));
      if (saved) { settings = saved; setBrand(); toast('บันทึกแล้ว'); }
    };
    $('#tt-sync2').onclick = async () => { await syncTikTok(); route(); };
    if (location.hash.includes('tiktok=ok')) toast('เชื่อมต่อ TikTok Shop สำเร็จ');
  },
};

// ===== Realtime + badges =====
async function refreshBadges() {
  const [convs, orders] = await Promise.all([api('/conversations'), api('/orders?status=paid')]);
  const unread = convs.reduce((s, c) => s + c.unread, 0);
  const pending = orders.filter((o) => o.channel !== 'pos').length;
  const set = (id, n) => { const b = $(id); b.textContent = n; b.classList.toggle('hidden', !n); };
  set('#badge-chat', unread);
  set('#badge-orders', pending);
  document.title = unread ? `(${unread}) หลังร้าน POS` : 'หลังร้าน POS';
}

function connectEvents() {
  const es = new EventSource('/api/admin/events');
  es.addEventListener('message', async (e) => {
    const d = JSON.parse(e.data);
    if (current === 'chat') {
      await loadConvs();
      if (d.conversation_id === chat.activeId) openThread(chat.activeId);
    }
    if (d.direction === 'in' && !(current === 'chat' && d.conversation_id === chat.activeId)) toast(`ข้อความใหม่จาก ${PLATFORMS[d.platform]}`);
    refreshBadges();
  });
  es.addEventListener('order', (e) => {
    const d = JSON.parse(e.data);
    if (d.channel !== 'pos' && !d.status) toast(`ออเดอร์ใหม่ ${d.order_no} (${CHANNELS[d.channel]}) ${money(d.total)}`);
    if (current === 'orders') loadOrders();
    if (current === 'dashboard') views.dashboard.render($('#view'));
    refreshBadges();
  });
  es.addEventListener('stock', () => {
    if (current === 'pos' && !pos.cart.length) views.pos.render($('#view'));
  });
}

$('#logout').onclick = async (e) => {
  e.preventDefault();
  await fetch('/api/admin/logout', { method: 'POST' });
  location.href = '/admin/login.html';
};

// ===== Barcode / QR scanner =====
const TEXT_FIELD = 'textarea, input:not([type]), input[type=text], input[type=search]';

Scanner.onScan(async (code, { target, before }) => {
  const openModal = $('#modal-root .modal');
  const inTextField = target?.matches?.(TEXT_FIELD) && !target.hasAttribute('data-scan');

  // Cursor is in a text field (e.g. the barcode field of the product form): type the code there.
  if (inTextField) {
    target.value = (before || '') + code;
    target.dispatchEvent(new Event('input', { bubbles: true }));
    Scanner.beep(true);
    return;
  }

  if (current === 'pos') {
    if (openModal && openModal.dataset.kind !== 'receipt') {
      Scanner.beep(false);
      return toast('ปิดหน้าต่างนี้ก่อนสแกนสินค้า', 'error');
    }
    if (openModal) closeModal(); // next customer: scanning dismisses the last receipt
    const product = Scanner.match(code, pos.products);
    const search = $('#pos-search');
    if (search) { search.value = ''; pos.search = ''; drawGrid(); }
    if (!product) {
      Scanner.beep(false);
      return toast(`ไม่พบสินค้ารหัส ${code}`, 'error');
    }
    const added = addToCart(product);
    Scanner.beep(added);
    // On a phone/PDA the cart is below the fold, so confirm what went in
    if (added && window.innerWidth < 820) {
      const qty = pos.cart.find((l) => l.product.id === product.id).qty;
      const total = pos.cart.reduce((sum, l) => sum + l.product.price * l.qty, 0);
      toast(`+ ${product.name} (×${qty}) · รวม ${money(total)}`);
    }
    return;
  }

  if (current === 'lookup' && !openModal) {
    Scanner.beep(await lookupCode(code));
    return;
  }

  if (current === 'products' && !openModal) {
    const product = Scanner.match(code, await api('/products'));
    Scanner.beep(true);
    if (product) productForm(product);
    else {
      toast('ยังไม่มีสินค้านี้ — กรอกข้อมูลเพื่อเพิ่มสินค้าใหม่');
      productForm(null, { barcode: code });
    }
  }
});

function setBrand() {
  $('#brand').textContent = settings.shop_name || 'หลังร้าน';
  $('#brand-logo').textContent = initialOf(settings.shop_name || 'ร้าน');
}

(async function init() {
  settings = await api('/settings');
  setBrand();
  route();
  refreshBadges();
  connectEvents();
})();
