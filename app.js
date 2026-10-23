import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// Replace these two values with the Project URL and publishable key from Supabase.
// A publishable/anon key is intended for browser use; never put a service_role key here.
const SUPABASE_URL = 'https://dwombowlnypkecsvjgdn.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_RnovRTby-C0blU1qeySNzQ_pX-Ap07N';

const authPanel = document.querySelector('#auth-panel');
const appPanel = document.querySelector('#app-panel');
const sessionArea = document.querySelector('#session-area');
const authForm = document.querySelector('#auth-form');
const authMessage = document.querySelector('#auth-message');
const saleForm = document.querySelector('#sale-form');
const saleMessage = document.querySelector('#sale-message');
const saleDialog = document.querySelector('#sale-dialog');
const pendingSaleForm = document.querySelector('#pending-sale-form');
const pendingSalesBody = document.querySelector('#pending-sales-body');
const pendingSalePreview = document.querySelector('#pending-preview');
const pendingDialog = document.querySelector('#pending-dialog');
const tableMessage = document.querySelector('#table-message');
const salesBody = document.querySelector('#sales-body');
const salesChart = document.querySelector('#sales-chart');
const salePreview = document.querySelector('#sale-preview');
const monthSelect = document.querySelector('#month-select');
const previousMonthButton = document.querySelector('#previous-month');
const nextMonthButton = document.querySelector('#next-month');
const editDialog = document.querySelector('#edit-dialog');
const editForm = document.querySelector('#edit-form');
const editMessage = document.querySelector('#edit-message');
const investmentForm = document.querySelector('#investment-form');
const investmentBody = document.querySelector('#investment-body');
const walletForm = document.querySelector('#wallet-form');
const walletBody = document.querySelector('#wallet-body');
const activityBody = document.querySelector('#activity-body');
const productSelect = document.querySelector('#product');
const pendingProductSelect = document.querySelector('#pending-product');
const productsDialog = document.querySelector('#products-dialog');
const productForm = document.querySelector('#product-form');
const productsBody = document.querySelector('#products-body');
const themeToggle = document.querySelector('#theme-toggle');

function setTheme(theme, persist = false) {
  const isDark = theme === 'dark';
  document.documentElement.dataset.theme = isDark ? 'dark' : 'light';
  themeToggle.setAttribute('aria-pressed', String(isDark));
  themeToggle.setAttribute('aria-label', isDark ? 'Activar modo claro' : 'Activar modo oscuro');
  document.querySelector('#theme-icon').textContent = isDark ? '☀' : '☾';
  document.querySelector('#theme-label').textContent = isDark ? 'Modo claro' : 'Modo oscuro';
  if (persist) {
    try { localStorage.setItem('glaciar-gourmet-theme', isDark ? 'dark' : 'light'); } catch { /* Storage may be disabled by the browser. */ }
  }
}

let savedTheme = 'light';
try { savedTheme = localStorage.getItem('glaciar-gourmet-theme') || 'light'; } catch { /* Use the light theme when storage is unavailable. */ }
setTheme(savedTheme);
themeToggle.addEventListener('click', () => {
  setTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark', true);
});

let supabase;
let currentUser;
let businessOwnerId = null;
let monthKeys = [];
let currentMonthSales = [];
let visibleSales = [];
let editingSaleId = null;
let pendingSales = [];
let pendingSalesLoaded = false;
let investmentItems = [];
let investmentsLoaded = false;
let cumulativeSalesAmount = 0;
let allTimeSalesTotal = 0;
let allTimeSalesLoaded = false;
let walletTransactions = [];
let walletLoaded = false;
let products = [];
let productsLoaded = false;
let activityEntries = [];
let activityOffset = 0;
let activityHasMore = false;

const ACTIVITY_PAGE_SIZE = 100;
const ACTIVITY_TABLE_LABELS = {
  sales: 'Ventas',
  pending_sales: 'Pendientes',
  investments: 'Inversiones',
  wallet_transactions: 'Billetera',
  products: 'Catálogo',
};
const ACTIVITY_FIELD_LABELS = {
  sale_date: 'Fecha', product: 'Producto', unit_price: 'Precio', quantity: 'Cantidad', total: 'Total',
  customer_reference: 'Cliente/referencia', transaction_date: 'Fecha', transaction_type: 'Tipo',
  description: 'Concepto', amount: 'Importe', purchase_usd: 'Compra USD', weight_lb: 'Peso lb',
  price_per_lb: 'Precio/lb USD', exchange_rate: 'Cambio CUP/USD', default_price: 'Precio base CUP',
  status: 'Estado',
};

async function loadUserAccess(user) {
  businessOwnerId = user.id;
  const { data, error } = await supabase.from('business_members')
    .select('owner_user_id, role').eq('member_user_id', user.id).maybeSingle();
  if (!error && data) {
    businessOwnerId = data.owner_user_id;
  }
}

function renderProductOptions(preferredName = 'Hielo Gourmet') {
  productSelect.replaceChildren();
  for (const item of products) {
    const option = document.createElement('option');
    option.value = item.id;
    option.textContent = item.product;
    productSelect.append(option);
  }
  const preferred = products.find((item) => item.product === preferredName) || products[0];
  if (preferred) {
    productSelect.value = preferred.id;
    document.querySelector('#price').value = Number(preferred.default_price).toFixed(2);
  }
  pendingProductSelect.replaceChildren();
  for (const item of products) {
    const option = document.createElement('option');
    option.value = item.id;
    option.textContent = item.product;
    pendingProductSelect.append(option);
  }
  const pendingPreferred = products.find((item) => item.product === preferredName) || products[0];
  if (pendingPreferred) {
    pendingProductSelect.value = pendingPreferred.id;
    document.querySelector('#pending-price').value = Number(pendingPreferred.default_price).toFixed(2);
  }
  updateSalePreview();
  updatePendingSalePreview();
}

function renderProductsTable() {
  productsBody.replaceChildren();
  if (!products.length) {
    const row = document.createElement('tr');
    const cell = document.createElement('td');
    cell.colSpan = 3;
    cell.className = 'loading';
    cell.textContent = 'No hay productos en el catálogo.';
    row.append(cell);
    productsBody.append(row);
    return;
  }
  for (const item of products) {
    const row = document.createElement('tr');
    addCell(row, item.product);
    addCell(row, formatCup(item.default_price));
    const actions = document.createElement('td');
    actions.className = 'row-actions';
    for (const [action, label, className] of [['edit', 'Editar', 'row-action'], ['delete', 'Eliminar', 'row-action row-action-delete']]) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = className;
      button.dataset.productAction = action;
      button.dataset.productId = item.id;
      button.textContent = label;
      actions.append(button);
    }
    row.append(actions);
    productsBody.append(row);
  }
}

function resetProductForm() {
  productForm.reset();
  document.querySelector('#catalog-product-id').value = '';
  document.querySelector('#catalog-save').textContent = 'Agregar producto';
  document.querySelector('#catalog-cancel').hidden = true;
}

function editProduct(item) {
  document.querySelector('#catalog-product-id').value = item.id;
  document.querySelector('#catalog-product-name').value = item.product;
  document.querySelector('#catalog-product-price').value = Number(item.default_price).toFixed(2);
  document.querySelector('#catalog-save').textContent = 'Guardar cambios';
  document.querySelector('#catalog-cancel').hidden = false;
  setMessage(document.querySelector('#catalog-message'));
}

function getInvestmentAmounts(item) {
  const importUsd = Number(item.weight_lb) * Number(item.price_per_lb);
  const quantity = Number(item.quantity);
  return { importUsd, investmentCup: Number(((Number(item.purchase_usd) + importUsd) * Number(item.exchange_rate)).toFixed(2)) * quantity };
}

function totalInvestmentCup() {
  return investmentItems.reduce((total, item) => total + getInvestmentAmounts(item).investmentCup, 0);
}

function getInvestmentImage(item) {
  const name = String(item.product || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  if (/vevor|hielera/.test(name)) return { src: 'assets/investments/vevor-ice-maker.png', alt: 'Hielera VEVOR de acero inoxidable' };
  if (/haitech|6\.?5|seis\s* pies/.test(name)) return { src: 'assets/investments/haitech-freezer.png', alt: 'Nevera Haitech blanca' };
  if (/tritur|crusher/.test(name)) return { src: 'assets/investments/ice-crusher.png', alt: 'Trituradora de hielo con mango rojo' };
  if (/royal|10\s*(ft|pies)|diez\s* pies/.test(name)) return { src: 'assets/investments/royal-freezer.png', alt: 'Nevera Royal de 10 pies cúbicos' };
  return null;
}

function renderAssetRecovery(cumulativeSales) {
  const grid = document.querySelector('#asset-recovery-grid');
  if (!grid) return;
  grid.replaceChildren();
  if (!investmentItems.length) {
    const empty = document.createElement('p');
    empty.className = 'asset-recovery-empty';
    empty.textContent = 'Al registrar equipos aparecerán aquí, en el orden de compra.';
    grid.append(empty);
    return;
  }

  let remainingRecovery = Math.max(0, Number(cumulativeSales) || 0);
  let sequence = 0;
  for (const item of investmentItems) {
    const { investmentCup } = getInvestmentAmounts(item);
    const quantity = Math.max(1, Math.floor(Number(item.quantity) || 1));
    const image = getInvestmentImage(item);
    sequence += 1;
    const recovered = Math.min(investmentCup, remainingRecovery);
    remainingRecovery = Math.max(0, remainingRecovery - investmentCup);
    const progress = investmentCup > 0 ? Math.min(100, (recovered / investmentCup) * 100) : 0;
    const card = document.createElement('article');
    card.className = 'asset-recovery-card';
    card.style.setProperty('--asset-progress', `${progress}%`);
    const media = document.createElement('div');
    media.className = 'asset-recovery-media';
    if (image) {
      const img = document.createElement('img');
      img.src = image.src;
      img.alt = image.alt;
      img.loading = 'lazy';
      img.decoding = 'async';
      media.append(img);
    } else {
      const fallback = document.createElement('span');
      fallback.className = 'asset-recovery-fallback';
      fallback.setAttribute('aria-hidden', 'true');
      fallback.textContent = '✧';
      media.append(fallback);
    }
    const content = document.createElement('div');
    content.className = 'asset-recovery-content';
    const order = document.createElement('span');
    order.className = 'asset-recovery-order';
    order.textContent = `EQUIPO ${String(sequence).padStart(2, '0')} · ${quantity} ${quantity === 1 ? 'UNIDAD' : 'UNIDADES'}`;
    const title = document.createElement('h3');
    title.textContent = item.product;
    const values = document.createElement('div');
    values.className = 'asset-recovery-values';
    const recoveredLabel = document.createElement('span');
    recoveredLabel.textContent = 'Recuperado';
    const recoveredValue = document.createElement('strong');
    recoveredValue.textContent = formatCup(recovered);
    const costLabel = document.createElement('span');
    costLabel.textContent = `Inversión total · ${quantity} ${quantity === 1 ? 'unidad' : 'unidades'}`;
    const costValue = document.createElement('strong');
    costValue.textContent = formatCup(investmentCup);
    values.append(recoveredLabel, recoveredValue, costLabel, costValue);
    const track = document.createElement('div');
    track.className = 'asset-recovery-track';
    track.setAttribute('role', 'progressbar');
    track.setAttribute('aria-label', `Recuperación de ${item.product}, ${quantity} ${quantity === 1 ? 'unidad' : 'unidades'}`);
    track.setAttribute('aria-valuemin', '0');
    track.setAttribute('aria-valuemax', '100');
    track.setAttribute('aria-valuenow', progress.toFixed(1));
    const fill = document.createElement('span');
    fill.className = 'asset-recovery-fill';
    fill.style.width = `${progress}%`;
    track.append(fill);
    const status = document.createElement('p');
    status.className = 'asset-recovery-status';
    status.textContent = progress >= 100 ? 'Inversión recuperada por completo' : progress > 0 ? `En recuperación · ${progress.toFixed(1)}%` : 'En espera de la inversión anterior';
    content.append(order, title, values, track, status);
    card.append(media, content);
    grid.append(card);
  }
}

function renderInvestmentTable() {
  investmentBody.replaceChildren();
  document.querySelector('#investment-count').textContent = `${investmentItems.length} ${investmentItems.length === 1 ? 'registro' : 'registros'}`;
  if (!investmentItems.length) {
    const row = document.createElement('tr');
    const cell = document.createElement('td');
    cell.colSpan = 9;
    cell.className = 'loading';
    cell.textContent = 'Aún no hay inversiones registradas. Agrega la primera con el formulario.';
    row.append(cell);
    investmentBody.append(row);
    return;
  }
  for (const item of investmentItems) {
    const row = document.createElement('tr');
    const { importUsd, investmentCup } = getInvestmentAmounts(item);
    const values = [item.product, String(item.quantity), `$${Number(item.purchase_usd).toFixed(2)}`, `${Number(item.weight_lb).toFixed(2)} lb`, `$${Number(item.price_per_lb).toFixed(2)}`, `$${(importUsd * Number(item.quantity)).toFixed(2)}`, `${Number(item.exchange_rate).toFixed(2)} CUP/USD`, formatCup(investmentCup)];
    for (const value of values) {
      const cell = document.createElement('td');
      cell.textContent = value;
      row.append(cell);
    }
    const actions = document.createElement('td');
    actions.className = 'row-actions';
    for (const [action, label, className] of [['edit', 'Editar', 'row-action'], ['delete', 'Eliminar', 'row-action row-action-delete']]) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = className;
      button.dataset.investmentAction = action;
      button.dataset.investmentId = item.id;
      button.textContent = label;
      button.setAttribute('aria-label', `${label} inversión: ${item.product}`);
      actions.append(button);
    }
    row.append(actions);
    investmentBody.append(row);
  }
}

function updatePendingTabBadge(count = 0, unavailable = false) {
  const badge = document.querySelector('#pending-tab-badge');
  const tab = document.querySelector('#sales-tab');
  if (!badge || !tab) return;
  if (unavailable) {
    badge.hidden = false;
    badge.textContent = '!';
    badge.title = 'No se pudieron cargar los cobros pendientes';
    tab.classList.remove('has-pending');
    tab.setAttribute('aria-label', 'Ventas; no se pudieron cargar los cobros pendientes');
    return;
  }
  badge.hidden = count < 1;
  badge.textContent = count > 99 ? '99+' : String(count);
  badge.title = `${count} ${count === 1 ? 'cobro pendiente' : 'cobros pendientes'}`;
  tab.classList.toggle('has-pending', count > 0);
  tab.setAttribute('aria-label', count ? `Ventas, ${count} ${count === 1 ? 'cobro pendiente' : 'cobros pendientes'}` : 'Ventas');
}

function updateTodayPendingMetric() {
  const metric = document.querySelector('#summary-day-pending');
  if (!metric) return;
  if (!pendingSalesLoaded) {
    metric.textContent = document.querySelector('#pending-count').textContent === 'No disponible' ? '!' : '—';
    return;
  }
  const today = currentDateKey();
  const count = pendingSales.filter((sale) => sale.sale_date === today).length;
  metric.textContent = String(count);
  metric.title = `${count} ${count === 1 ? 'cobro pendiente' : 'cobros pendientes'} para hoy`;
}

function renderPendingSales() {
  pendingSalesBody.replaceChildren();
  const pendingTotal = pendingSales.reduce((sum, sale) => sum + Number(sale.total), 0);
  document.querySelector('#pending-count').textContent = `${pendingSales.length} ${pendingSales.length === 1 ? 'pendiente' : 'pendientes'}`;
  document.querySelector('#pending-total').textContent = formatCup(pendingTotal);
  updatePendingTabBadge(pendingSalesLoaded ? pendingSales.length : 0);
  updateTodayPendingMetric();
  if (!pendingSales.length) {
    const row = document.createElement('tr');
    const cell = document.createElement('td');
    cell.colSpan = 8;
    cell.className = 'loading';
    cell.textContent = 'No hay cobros pendientes.';
    row.append(cell);
    pendingSalesBody.append(row);
    return;
  }

  for (const sale of pendingSales) {
    const row = document.createElement('tr');
    row.className = 'pending-sale-row';
    addCell(row, `P-${sale.id.slice(0, 8).toUpperCase()}`);
    addCell(row, formatDate(sale.sale_date));
    addCell(row, sale.customer_reference);
    addCell(row, sale.product);
    addCell(row, formatCup(sale.unit_price));
    addCell(row, String(sale.quantity));
    addCell(row, formatCup(sale.total), 'pending-amount');
    const actions = document.createElement('td');
    actions.className = 'row-actions pending-actions';
    for (const [action, label, className] of [
      ['confirm', 'Confirmar cobro', 'row-action pending-confirm'],
      ['edit', 'Editar', 'row-action'],
      ['delete', 'Eliminar', 'row-action row-action-delete'],
    ]) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = className;
      button.dataset.pendingAction = action;
      button.dataset.pendingSaleId = sale.id;
      button.textContent = label;
      button.setAttribute('aria-label', `${label}: ${sale.customer_reference}, ${sale.product}`);
      actions.append(button);
    }
    row.append(actions);
    pendingSalesBody.append(row);
  }
}

async function loadPendingSales() {
  if (!currentUser) return false;
  pendingSalesLoaded = false;
  pendingSales = [];
  renderPendingSales();
  const rows = [];
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await supabase.from('pending_sales')
      .select('id, sale_date, customer_reference, product, unit_price, quantity, total, created_at')
      .eq('user_id', businessOwnerId).eq('status', 'pending')
      .order('sale_date', { ascending: false }).order('created_at', { ascending: false })
      .range(offset, offset + 999);
    if (error) {
      pendingSalesLoaded = false;
      document.querySelector('#pending-count').textContent = 'No disponible';
      updatePendingTabBadge(0, true);
      updateTodayPendingMetric();
      const row = document.createElement('tr');
      const cell = document.createElement('td');
      cell.colSpan = 8;
      cell.className = 'loading';
      cell.textContent = 'No se pudo consultar la lista de pendientes.';
      row.append(cell);
      pendingSalesBody.replaceChildren(row);
      setMessage(document.querySelector('#pending-table-message'), `No se pudieron cargar los pendientes. Ejecuta supabase/pending-sales.sql en Supabase > SQL Editor. Error: ${error.message}`, 'error');
      return false;
    }
    rows.push(...(data || []));
    if (!data || data.length < 1000) break;
  }
  pendingSales = rows;
  pendingSalesLoaded = true;
  renderPendingSales();
  setMessage(document.querySelector('#pending-table-message'));
  return true;
}

function resetPendingSaleForm() {
  pendingSaleForm.reset();
  document.querySelector('#pending-sale-id').value = '';
  document.querySelector('#pending-date').value = currentDateKey();
  document.querySelector('#pending-form-title').textContent = 'Registrar venta pendiente';
  document.querySelector('#pending-save').textContent = 'Guardar pendiente';
  document.querySelector('#pending-cancel').hidden = true;
  const selected = products.find((product) => product.id === pendingProductSelect.value) || products[0];
  if (selected) {
    pendingProductSelect.value = selected.id;
    document.querySelector('#pending-price').value = Number(selected.default_price).toFixed(2);
  }
  updatePendingSalePreview();
  setMessage(document.querySelector('#pending-form-message'));
}

function editPendingSale(sale) {
  document.querySelector('#pending-sale-id').value = sale.id;
  document.querySelector('#pending-date').value = sale.sale_date;
  document.querySelector('#pending-reference').value = sale.customer_reference;
  const product = products.find((item) => item.product === sale.product);
  if (product) pendingProductSelect.value = product.id;
  else {
    const option = document.createElement('option');
    option.value = `existing-${sale.id}`;
    option.textContent = `${sale.product} (fuera del catalogo)`;
    pendingProductSelect.append(option);
    pendingProductSelect.value = option.value;
  }
  document.querySelector('#pending-price').value = Number(sale.unit_price).toFixed(2);
  document.querySelector('#pending-quantity').value = sale.quantity;
  document.querySelector('#pending-form-title').textContent = 'Editar venta pendiente';
  document.querySelector('#pending-save').textContent = 'Guardar cambios';
  document.querySelector('#pending-cancel').hidden = false;
  updatePendingSalePreview();
  setMessage(document.querySelector('#pending-form-message'));
  pendingDialog.showModal();
  document.querySelector('#pending-date').focus();
}

function renderWallet() {
  let movementBalance = 0;
  let incomeTotal = 0;
  let expenseTotal = 0;
  const balancesById = new Map();
  for (const item of walletTransactions) {
    const amount = Number(item.amount);
    if (item.transaction_type === 'income') {
      incomeTotal += amount;
      movementBalance += amount;
    } else {
      expenseTotal += amount;
      movementBalance -= amount;
    }
    balancesById.set(item.id, allTimeSalesLoaded ? allTimeSalesTotal + movementBalance : null);
  }
  if (allTimeSalesLoaded) {
    animateSummaryValue(document.querySelector('#wallet-balance'), allTimeSalesTotal + movementBalance, formatCup);
  } else document.querySelector('#wallet-balance').textContent = '—';
  animateSummaryValue(document.querySelector('#wallet-income-total'), incomeTotal, formatCup);
  animateSummaryValue(document.querySelector('#wallet-expense-total'), expenseTotal, formatCup);
  document.querySelector('#wallet-count').textContent = `${walletTransactions.length} ${walletTransactions.length === 1 ? 'movimiento' : 'movimientos'}`;
  walletBody.replaceChildren();

  if (!walletTransactions.length) {
    const row = document.createElement('tr');
    const cell = document.createElement('td');
    cell.colSpan = 6;
    cell.className = 'loading';
    cell.textContent = 'Aún no hay movimientos. Registra tu primer ingreso o gasto.';
    row.append(cell);
    walletBody.append(row);
    return;
  }

  for (const item of [...walletTransactions].reverse()) {
    const amount = Number(item.amount);
    const row = document.createElement('tr');
    row.className = item.transaction_type === 'income' ? 'wallet-row-income' : 'wallet-row-expense';
    const dateCell = document.createElement('td');
    dateCell.textContent = formatDate(item.transaction_date);
    row.append(dateCell);
    const typeCell = document.createElement('td');
    const badge = document.createElement('span');
    badge.className = `wallet-type-badge ${item.transaction_type}`;
    badge.textContent = item.transaction_type === 'income' ? 'Ingreso' : 'Gasto';
    typeCell.append(badge);
    row.append(typeCell);
    const descriptionCell = document.createElement('td');
    descriptionCell.textContent = item.description;
    row.append(descriptionCell);
    const amountCell = document.createElement('td');
    amountCell.className = item.transaction_type === 'income' ? 'wallet-amount-income' : 'wallet-amount-expense';
    amountCell.textContent = `${item.transaction_type === 'income' ? '+' : '−'}${formatCup(amount)}`;
    row.append(amountCell);
    const balanceCell = document.createElement('td');
    balanceCell.className = 'wallet-running-balance';
    balanceCell.textContent = balancesById.get(item.id) == null ? '—' : formatCup(balancesById.get(item.id));
    row.append(balanceCell);
    const actions = document.createElement('td');
    actions.className = 'row-actions';
    for (const [action, label, className] of [['edit', 'Editar', 'row-action'], ['delete', 'Eliminar', 'row-action row-action-delete']]) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = className;
      button.dataset.walletAction = action;
      button.dataset.walletId = item.id;
      button.textContent = label;
      button.setAttribute('aria-label', `${label} movimiento de billetera: ${item.description}`);
      actions.append(button);
    }
    row.append(actions);
    walletBody.append(row);
  }
}

async function loadWallet() {
  if (!currentUser) return false;
  const transactions = [];
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await supabase.from('wallet_transactions')
      .select('id, transaction_date, transaction_type, description, amount, created_at')
      .eq('user_id', businessOwnerId)
      .order('transaction_date', { ascending: true }).order('created_at', { ascending: true }).order('id', { ascending: true })
      .range(offset, offset + 999);
    if (error) {
      walletLoaded = false;
      setMessage(document.querySelector('#wallet-table-message'), `No se pudo cargar la billetera. Ejecuta supabase/wallet.sql en Supabase > SQL Editor. Error: ${error.message}`, 'error');
      return false;
    }
    transactions.push(...(data || []));
    if (!data || data.length < 1000) break;
  }
  walletTransactions = transactions;
  walletLoaded = true;
  renderWallet();
  setMessage(document.querySelector('#wallet-table-message'));
  return true;
}

function describeActivity(entry) {
  const before = entry.old_record || {};
  const after = entry.new_record || {};
  const fields = ['product', 'sale_date', 'transaction_date', 'customer_reference', 'transaction_type', 'quantity', 'unit_price', 'total', 'description', 'amount', 'purchase_usd', 'weight_lb', 'price_per_lb', 'exchange_rate', 'default_price', 'status'];
  const details = [];
  for (const field of fields) {
    const oldValue = before[field];
    const newValue = after[field];
    if (entry.action === 'UPDATE' && JSON.stringify(oldValue) === JSON.stringify(newValue)) continue;
    const value = entry.action === 'DELETE' ? oldValue : newValue;
    if (value === undefined || value === null || value === '') continue;
    const label = ACTIVITY_FIELD_LABELS[field] || field;
    const shownValue = field === 'transaction_type'
      ? (value === 'income' ? 'Ingreso' : 'Gasto')
      : field === 'status'
        ? (value === 'pending' ? 'Pendiente' : 'Confirmada')
        : String(value);
    if (entry.action === 'UPDATE' && oldValue !== undefined && newValue !== undefined && oldValue !== newValue) {
      details.push(`${label}: ${oldValue} → ${shownValue}`);
    } else {
      details.push(`${label}: ${shownValue}`);
    }
  }
  return details.length ? details.join(' · ').slice(0, 240) : `Registro ${String(entry.record_id || '').slice(0, 8)}`;
}

function renderActivityLogs() {
  if (!activityBody) return;
  activityBody.replaceChildren();
  document.querySelector('#activity-count').textContent = `${activityEntries.length} ${activityEntries.length === 1 ? 'registro' : 'registros'}${activityHasMore ? ' cargados' : ''}`;
  document.querySelector('#activity-more').hidden = !activityHasMore;
  if (!activityEntries.length) {
    const row = document.createElement('tr');
    const cell = document.createElement('td');
    cell.colSpan = 5;
    cell.className = 'loading';
    cell.textContent = 'No hay movimientos que coincidan con estos filtros.';
    row.append(cell);
    activityBody.append(row);
    return;
  }
  const actionLabels = { INSERT: 'Creó', UPDATE: 'Editó', DELETE: 'Eliminó' };
  for (const entry of activityEntries) {
    const row = document.createElement('tr');
    const date = new Date(entry.created_at);
    const formattedDate = Number.isNaN(date.getTime()) ? entry.created_at : date.toLocaleString('es', { dateStyle: 'short', timeStyle: 'short' });
    const actorRole = entry.actor_user_id === businessOwnerId ? 'Propietario' : 'Operador';
    const values = [formattedDate, `${actorRole}${entry.actor_email ? ` · ${entry.actor_email}` : ''}`, actionLabels[entry.action] || entry.action, ACTIVITY_TABLE_LABELS[entry.entity_table] || entry.entity_table, describeActivity(entry)];
    for (let index = 0; index < values.length; index += 1) {
      const cell = document.createElement('td');
      cell.textContent = values[index] || '—';
      if (index === 4) cell.className = 'activity-detail-cell';
      row.append(cell);
    }
    activityBody.append(row);
  }
}

async function loadActivityLogs(reset = true) {
  if (!currentUser || currentUser.id !== businessOwnerId) return false;
  if (reset) {
    activityOffset = 0;
    activityEntries = [];
    activityBody.replaceChildren();
    const loadingRow = document.createElement('tr');
    const loadingCell = document.createElement('td');
    loadingCell.colSpan = 5;
    loadingCell.className = 'loading';
    loadingCell.textContent = 'Cargando actividad…';
    loadingRow.append(loadingCell);
    activityBody.append(loadingRow);
    setMessage(document.querySelector('#activity-message'));
  }
  const actorFilter = document.querySelector('#activity-actor').value;
  const entityFilter = document.querySelector('#activity-entity').value;
  const actionFilter = document.querySelector('#activity-action').value;
  const fromFilter = document.querySelector('#activity-from').value;
  const toFilter = document.querySelector('#activity-to').value;
  let query = supabase.from('activity_log')
    .select('id, business_owner_id, actor_user_id, actor_email, action, entity_table, record_id, old_record, new_record, created_at')
    .eq('business_owner_id', businessOwnerId)
    .order('created_at', { ascending: false }).order('id', { ascending: false });
  if (actorFilter === 'owner') query = query.eq('actor_user_id', businessOwnerId);
  if (actorFilter === 'operator') query = query.neq('actor_user_id', businessOwnerId);
  if (entityFilter !== 'all') query = query.eq('entity_table', entityFilter);
  if (actionFilter !== 'all') query = query.eq('action', actionFilter);
  if (fromFilter) query = query.gte('created_at', new Date(`${fromFilter}T00:00:00`).toISOString());
  if (toFilter) {
    const endDate = new Date(`${toFilter}T00:00:00`);
    endDate.setDate(endDate.getDate() + 1);
    query = query.lt('created_at', endDate.toISOString());
  }
  const { data, error } = await query.range(activityOffset, activityOffset + ACTIVITY_PAGE_SIZE - 1);
  if (error) {
    activityHasMore = false;
    if (reset) {
      activityBody.replaceChildren();
      setMessage(document.querySelector('#activity-message'), `Para activar la bitácora ejecuta supabase/activity-log.sql en Supabase > SQL Editor. Error: ${error.message}`, 'error');
    } else {
      setMessage(document.querySelector('#activity-message'), `No se pudieron cargar más registros: ${error.message}`, 'error');
    }
    document.querySelector('#activity-more').hidden = true;
    return false;
  }
  activityEntries.push(...(data || []));
  activityOffset += (data || []).length;
  activityHasMore = data?.length === ACTIVITY_PAGE_SIZE;
  setMessage(document.querySelector('#activity-message'));
  renderActivityLogs();
  return true;
}

function resetWalletForm() {
  walletForm.reset();
  document.querySelector('#wallet-transaction-id').value = '';
  document.querySelector('#wallet-date').value = currentDateKey();
  document.querySelector('#wallet-form-title').textContent = 'Agregar ingreso o gasto';
  document.querySelector('#wallet-save').textContent = 'Guardar movimiento';
  document.querySelector('#wallet-cancel').hidden = true;
  setMessage(document.querySelector('#wallet-message'));
}

function editWalletTransaction(item) {
  document.querySelector('#wallet-transaction-id').value = item.id;
  document.querySelector('#wallet-date').value = item.transaction_date;
  document.querySelector('#wallet-type').value = item.transaction_type;
  document.querySelector('#wallet-description').value = item.description;
  document.querySelector('#wallet-amount').value = Number(item.amount).toFixed(2);
  document.querySelector('#wallet-form-title').textContent = 'Editar movimiento';
  document.querySelector('#wallet-save').textContent = 'Guardar cambios';
  document.querySelector('#wallet-cancel').hidden = false;
  setMessage(document.querySelector('#wallet-message'));
  walletForm.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function renderInvestmentProgress(cumulativeSales) {
  const initialInvestmentCup = totalInvestmentCup();
  const recovered = Number(cumulativeSales);
  const difference = initialInvestmentCup - recovered;
  const percentage = initialInvestmentCup > 0 ? (recovered / initialInvestmentCup) * 100 : 0;
  const progress = Math.min(100, Math.max(0, percentage));
  document.querySelector('#investment-total').textContent = formatCup(initialInvestmentCup);
  document.querySelector('#capital-recovered').textContent = formatCup(recovered);
  document.querySelector('#recovery-percent').textContent = `${percentage.toFixed(1)}%`;
  document.querySelector('#recovery-balance-label').textContent = difference >= 0
    ? 'Pendiente por recuperar'
    : 'Excedente sobre la inversión';
  document.querySelector('#recovery-balance').textContent = formatCup(Math.abs(difference));
  document.querySelector('#recovery-progress').style.width = `${progress}%`;
  document.querySelector('.progress-track').setAttribute('aria-valuenow', String(progress.toFixed(1)));
  document.querySelector('#recovery-message').textContent = difference >= 0
    ? `Has recuperado ${percentage.toFixed(1)}% del capital inicial. El cálculo suma las ventas desde el inicio hasta ${monthLabel(monthSelect.value)}; no descuenta gastos de operación.`
    : `Las ventas acumuladas superan la inversión inicial por ${formatCup(Math.abs(difference))}. Este excedente es ingreso bruto; no descuenta gastos de operación.`;
  renderAssetRecovery(recovered);
}

function replayInvestmentProgress() {
  const bar = document.querySelector('#recovery-progress');
  bar.classList.remove('progress-replay');
  void bar.offsetWidth;
  bar.classList.add('progress-replay');
}

async function fetchSalesTotal(startDate, endDate) {
  let total = 0;
  for (let offset = 0; ; offset += 1000) {
    let query = supabase.from('sales').select('total')
      .eq('user_id', businessOwnerId)
      .order('sale_date', { ascending: true }).order('created_at', { ascending: true }).order('id', { ascending: true })
      .range(offset, offset + 999);
    if (startDate) query = query.gte('sale_date', startDate);
    if (endDate) query = query.lt('sale_date', endDate);
    const { data, error } = await query;
    if (error) return { total: 0, error };
    total += (data || []).reduce((sum, sale) => sum + Number(sale.total), 0);
    if (!data || data.length < 1000) return { total, error: null };
  }
}

async function fetchSalesForDate(date) {
  const rows = [];
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await supabase.from('sales').select('id, quantity, total')
      .eq('user_id', businessOwnerId).eq('sale_date', date).order('created_at', { ascending: true }).range(offset, offset + 999);
    if (error) return { rows: [], total: 0, error };
    rows.push(...(data || []));
    if (!data || data.length < 1000) {
      return { rows, total: rows.reduce((sum, sale) => sum + Number(sale.total), 0), error: null };
    }
  }
}

function setMessage(element, text = '', kind = '') {
  element.textContent = text;
  element.className = `message${kind ? ` ${kind}` : ''}`;
}

function formatCup(value) {
  return `${Number(value).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} CUP`;
}

const summaryAnimations = new WeakMap();

function animateSummaryValue(element, target, formatter) {
  const finalValue = Number(target);
  const previousFrame = summaryAnimations.get(element);
  if (previousFrame) cancelAnimationFrame(previousFrame);
  if (!Number.isFinite(finalValue) || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    element.textContent = formatter(finalValue);
    return;
  }

  const duration = 850;
  const startedAt = performance.now();
  element.textContent = formatter(0);
  const tick = (now) => {
    const progress = Math.min((now - startedAt) / duration, 1);
    const easedProgress = 1 - ((1 - progress) ** 3);
    element.textContent = formatter(finalValue * easedProgress);
    if (progress < 1) summaryAnimations.set(element, requestAnimationFrame(tick));
    else summaryAnimations.delete(element);
  };
  summaryAnimations.set(element, requestAnimationFrame(tick));
}

function formatDate(value) {
  const [year, month, day] = value.split('-');
  return `${day}/${month}/${year}`;
}

function renderSalesChart(sales, monthKey) {
  salesChart.replaceChildren();
  const dailyTotals = new Map();
  for (const sale of sales) {
    dailyTotals.set(sale.sale_date, (dailyTotals.get(sale.sale_date) || 0) + Number(sale.total));
  }
  const days = Array.from({ length: 31 }, (_, index) => {
    const day = index + 1;
    const date = `${monthKey}-${String(day).padStart(2, '0')}`;
    return { day, date, total: dailyTotals.get(date) || 0 };
  });
  const firstSalesDay = days.find(({ total }) => total > 0)?.day;
  const lastSalesDay = [...days].reverse().find(({ total }) => total > 0)?.day;

  const maximum = Math.max(...days.map(({ total }) => total));
  const scaleMaximum = maximum || 1000;
  const rawStep = scaleMaximum / 6;
  const magnitude = 10 ** Math.floor(Math.log10(rawStep || 1));
  const normalizedStep = rawStep / magnitude;
  const niceUnit = normalizedStep <= 1 ? 1 : normalizedStep <= 2 ? 2 : normalizedStep <= 2.5 ? 2.5 : normalizedStep <= 5 ? 5 : 10;
  const step = niceUnit * magnitude;
  const tickCount = Math.max(1, Math.floor(scaleMaximum / step) + 1);
  const chartMaximum = step * tickCount;
  const scroll = document.createElement('div');
  scroll.className = 'chart-scroll';
  const layout = document.createElement('div');
  layout.className = 'chart-layout';
  const axis = document.createElement('div');
  axis.className = 'chart-y-axis';
  axis.setAttribute('aria-hidden', 'true');
  for (let index = 0; index <= tickCount; index += 1) {
    const tick = document.createElement('span');
    tick.textContent = `CUP ${Number(step * index).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    tick.style.bottom = `${(index / tickCount) * 100}%`;
    if (index === 0) tick.classList.add('axis-min');
    if (index === tickCount) tick.classList.add('axis-max');
    axis.append(tick);
  }

  const main = document.createElement('div');
  main.className = 'chart-main';
  const plot = document.createElement('div');
  plot.className = 'chart-plot-area';
  plot.setAttribute('role', 'list');
  plot.setAttribute('aria-label', 'Ventas por día en CUP');
  const grid = document.createElement('div');
  grid.className = 'chart-grid';
  for (let index = 0; index <= tickCount; index += 1) {
    const line = document.createElement('span');
    line.className = 'chart-gridline';
    line.style.bottom = `${(index / tickCount) * 100}%`;
    grid.append(line);
  }
  const columns = document.createElement('div');
  columns.className = 'chart-columns';
  columns.style.gridTemplateColumns = `repeat(${days.length}, minmax(0, 1fr))`;
  for (const { day, date, total } of days) {
    const column = document.createElement('div');
    column.className = 'chart-column';
    column.setAttribute('role', 'listitem');
    if (total > 0) {
      column.classList.add('has-sales');
      if (day === firstSalesDay) column.classList.add('first-sales-day');
      if (day === lastSalesDay) column.classList.add('last-sales-day');
      column.setAttribute('aria-label', `Día ${day}: ${formatCup(total)}`);
      column.tabIndex = 0;
      column.dataset.tooltip = `Día ${day} · ${formatCup(total)}`;
    } else {
      column.setAttribute('aria-hidden', 'true');
    }
    const bar = document.createElement('div');
    bar.className = 'chart-bar';
    const barHeight = total ? (total / chartMaximum) * 100 : 0;
    bar.style.height = `${barHeight}%`;
    column.style.setProperty('--bar-height', `${barHeight}%`);
    if (total && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      const delay = Math.min((day - 1) * 12, 360);
      bar.classList.add('chart-bar-animated');
      bar.style.animationDelay = `${delay}ms, ${delay + 560}ms`;
    }
    column.append(bar);
    columns.append(column);
  }
  plot.append(grid, columns);
  const dates = document.createElement('div');
  dates.className = 'chart-x-axis';
  dates.style.gridTemplateColumns = `repeat(${days.length}, minmax(0, 1fr))`;
  for (const { day } of days) {
    const label = document.createElement('span');
    label.className = 'chart-x-label';
    label.textContent = String(day);
    dates.append(label);
  }
  main.append(plot, dates);
  layout.append(axis, main);
  scroll.append(layout);
  salesChart.append(scroll);
}

function previousMonthKey(key) {
  const [year, month] = key.split('-').map(Number);
  const previous = new Date(Date.UTC(year, month - 2, 1));
  return `${previous.getUTCFullYear()}-${String(previous.getUTCMonth() + 1).padStart(2, '0')}`;
}

function renderPrintReport(sales, monthKey, quantityTotal, amountTotal, comparisonText) {
  document.querySelector('#print-month').textContent = monthLabel(monthKey);
  const printSummary = document.querySelector('#print-summary');
  printSummary.replaceChildren();
  for (const [label, value] of [
    ['Ventas registradas', String(sales.length)],
    ['Unidades vendidas', quantityTotal.toLocaleString('en-US')],
    ['Ingresos del mes', formatCup(amountTotal)],
    ['Variación mensual', comparisonText],
  ]) {
    const item = document.createElement('div');
    item.className = 'print-metric';
    const name = document.createElement('span');
    name.textContent = label;
    const metric = document.createElement('strong');
    metric.textContent = value;
    item.append(name, metric);
    printSummary.append(item);
  }
  const body = document.querySelector('#print-sales-body');
  body.replaceChildren();
  for (const sale of sales) {
    const row = document.createElement('tr');
    for (const value of [formatDate(sale.sale_date), sale.product, formatCup(sale.unit_price), String(sale.quantity), formatCup(sale.total)]) {
      const cell = document.createElement('td');
      cell.textContent = value;
      row.append(cell);
    }
    body.append(row);
  }
}

function renderSalesTable() {
  const query = document.querySelector('#sales-search').value.trim().toLocaleLowerCase('es');
  const from = document.querySelector('#date-from').value;
  const through = document.querySelector('#date-to').value;
  const sort = document.querySelector('#sales-sort').value;
  visibleSales = currentMonthSales.filter((sale) => {
    const matchesText = !query || sale.product.toLocaleLowerCase('es').includes(query)
      || sale.sale_date.includes(query) || formatDate(sale.sale_date).includes(query);
    return matchesText && (!from || sale.sale_date >= from) && (!through || sale.sale_date <= through);
  });
  visibleSales.sort((a, b) => {
    if (sort === 'date-desc') return b.sale_date.localeCompare(a.sale_date) || b.created_at.localeCompare(a.created_at);
    if (sort === 'total-desc') return Number(b.total) - Number(a.total);
    if (sort === 'total-asc') return Number(a.total) - Number(b.total);
    if (sort === 'product-asc') return a.product.localeCompare(b.product, 'es');
    return a.sale_date.localeCompare(b.sale_date) || a.created_at.localeCompare(b.created_at);
  });

  salesBody.replaceChildren();
  document.querySelector('#sales-count').textContent = visibleSales.length === currentMonthSales.length
    ? `${currentMonthSales.length} ${currentMonthSales.length === 1 ? 'registro' : 'registros'}`
    : `${visibleSales.length} de ${currentMonthSales.length} registros`;
  if (!visibleSales.length) {
    const row = document.createElement('tr');
    const cell = document.createElement('td');
    cell.colSpan = 6;
    cell.className = 'loading';
    cell.textContent = currentMonthSales.length ? 'No hay ventas que coincidan con los filtros.' : 'Todavía no hay ventas guardadas en este mes.';
    row.append(cell);
    salesBody.append(row);
    return;
  }

  for (const sale of visibleSales) {
    const row = document.createElement('tr');
    row.dataset.saleId = sale.id;
    addCell(row, formatDate(sale.sale_date));
    addCell(row, sale.product);
    addCell(row, formatCup(sale.unit_price));
    addCell(row, String(sale.quantity));
    addCell(row, formatCup(sale.total), 'total');
    const actions = document.createElement('td');
    actions.className = 'row-actions';
    const edit = document.createElement('button');
    edit.type = 'button';
    edit.className = 'row-action';
    edit.dataset.action = 'edit';
    edit.dataset.saleId = sale.id;
    edit.textContent = 'Editar';
    edit.setAttribute('aria-label', `Editar venta del ${formatDate(sale.sale_date)}`);
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'row-action row-action-delete';
    remove.dataset.action = 'delete';
    remove.dataset.saleId = sale.id;
    remove.textContent = 'Eliminar';
    remove.setAttribute('aria-label', `Eliminar venta del ${formatDate(sale.sale_date)}`);
    actions.append(edit, remove);
    row.append(actions);
    salesBody.append(row);
  }
}

function renderProductUnitSummary(sales, totalQuantity, selectedMonth) {
  const container = document.querySelector('#summary-product-units');
  const productNames = new Map();
  const quantities = new Map();
  const productKey = (name) => name.trim().toLocaleLowerCase('es');

  for (const product of products) productNames.set(productKey(product.product), product.product);
  for (const sale of sales) {
    const key = productKey(sale.product);
    if (!productNames.has(key)) productNames.set(key, sale.product);
    quantities.set(key, (quantities.get(key) || 0) + Number(sale.quantity));
  }

  container.replaceChildren();
  const names = [...productNames.entries()].sort((a, b) => a[1].localeCompare(b[1], 'es'));
  if (!names.length) {
    const empty = document.createElement('span');
    empty.className = 'summary-unit-empty';
    empty.textContent = 'No hay productos en el catálogo.';
    container.append(empty);
  }
  for (const [key, name] of names) {
    const row = document.createElement('div');
    row.className = 'summary-product-row';
    const label = document.createElement('span');
    label.textContent = name;
    const quantity = document.createElement('strong');
    animateSummaryValue(quantity, quantities.get(key) || 0, (value) => Math.round(value).toLocaleString('en-US'));
    row.append(label, quantity);
    container.append(row);
  }
  animateSummaryValue(document.querySelector('#summary-quantity'), totalQuantity, (value) => Math.round(value).toLocaleString('en-US'));
  document.querySelector('#summary-month-units-label').textContent = monthLabel(selectedMonth);
}

function updateSalePreview() {
  const price = Number(document.querySelector('#price').value);
  const quantity = Number(document.querySelector('#quantity').value);
  salePreview.textContent = `Total estimado: ${formatCup(price > 0 && quantity > 0 ? price * quantity : 0)}`;
}

function updatePendingSalePreview() {
  const price = Number(document.querySelector('#pending-price').value);
  const quantity = Number(document.querySelector('#pending-quantity').value);
  pendingSalePreview.textContent = `Importe pendiente: ${formatCup(price > 0 && quantity > 0 ? price * quantity : 0)}`;
}

function updateInvestmentPreview() {
  const purchase = Number(document.querySelector('#investment-purchase').value);
  const quantity = Number(document.querySelector('#investment-quantity').value);
  const weight = Number(document.querySelector('#investment-weight').value);
  const pricePerLb = Number(document.querySelector('#investment-price-lb').value);
  const exchangeRate = Number(document.querySelector('#investment-rate').value);
  const investmentCup = (purchase + weight * pricePerLb) * exchangeRate * quantity;
  document.querySelector('#investment-preview').textContent = `Inversión calculada: ${formatCup(investmentCup > 0 ? investmentCup : 0)}`;
}

function resetInvestmentForm() {
  investmentForm.reset();
  document.querySelector('#investment-id').value = '';
  document.querySelector('#investment-weight').value = '0';
  document.querySelector('#investment-price-lb').value = '0.00';
  document.querySelector('#investment-purchase').value = '0.00';
  document.querySelector('#investment-quantity').value = '1';
  document.querySelector('#investment-form-title').textContent = 'Agregar inversión';
  document.querySelector('#investment-save').textContent = 'Guardar inversión';
  document.querySelector('#investment-cancel').hidden = true;
  updateInvestmentPreview();
}

function editInvestment(item) {
  document.querySelector('#investment-id').value = item.id;
  document.querySelector('#investment-product').value = item.product;
  document.querySelector('#investment-purchase').value = Number(item.purchase_usd).toFixed(2);
  document.querySelector('#investment-quantity').value = item.quantity;
  document.querySelector('#investment-weight').value = Number(item.weight_lb).toFixed(2);
  document.querySelector('#investment-price-lb').value = Number(item.price_per_lb).toFixed(2);
  document.querySelector('#investment-rate').value = Number(item.exchange_rate).toFixed(2);
  document.querySelector('#investment-form-title').textContent = 'Editar inversión';
  document.querySelector('#investment-save').textContent = 'Guardar cambios';
  document.querySelector('#investment-cancel').hidden = false;
  setMessage(document.querySelector('#investment-message'));
  updateInvestmentPreview();
  document.querySelector('#investment-product').focus();
  investmentForm.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function updateEditPreview() {
  const price = Number(document.querySelector('#edit-price').value);
  const quantity = Number(document.querySelector('#edit-quantity').value);
  document.querySelector('#edit-preview').textContent = `Total calculado: ${formatCup(price > 0 && quantity > 0 ? price * quantity : 0)}`;
}

function currentMonthKey() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function currentDateKey() {
  return new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

function nextDateKey(dateKey) {
  const next = new Date(`${dateKey}T00:00:00.000Z`);
  next.setUTCDate(next.getUTCDate() + 1);
  return next.toISOString().slice(0, 10);
}

function monthKeyFromDate(value) { return value.slice(0, 7); }
function monthStart(key) { return `${key}-01`; }

function nextMonthStart(key) {
  const [year, month] = key.split('-').map(Number);
  const next = new Date(Date.UTC(year, month, 1));
  return `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, '0')}-01`;
}

function monthLabel(key) {
  const [year, month] = key.split('-').map(Number);
  return new Intl.DateTimeFormat('es', { month: 'long', year: 'numeric', timeZone: 'UTC' })
    .format(new Date(Date.UTC(year, month - 1, 1)));
}

function updateMonthNavigation() {
  const selectedIndex = monthKeys.indexOf(monthSelect.value);
  previousMonthButton.disabled = selectedIndex < 0 || selectedIndex >= monthKeys.length - 1;
  nextMonthButton.disabled = selectedIndex <= 0;
}

async function loadMonthArchive(preferredMonth = monthSelect.value) {
  const [firstResult, lastResult] = await Promise.all([
    supabase.from('sales').select('sale_date').eq('user_id', businessOwnerId).order('sale_date', { ascending: true }).limit(1).maybeSingle(),
    supabase.from('sales').select('sale_date').eq('user_id', businessOwnerId).order('sale_date', { ascending: false }).limit(1).maybeSingle(),
  ]);
  const error = firstResult.error || lastResult.error;
  if (error) {
    setMessage(tableMessage, `No se pudo cargar el archivo mensual: ${error.message}`, 'error');
    return;
  }
  const current = currentMonthKey();
  const earliest = firstResult.data?.sale_date ? monthKeyFromDate(firstResult.data.sale_date) : current;
  const latest = lastResult.data?.sale_date ? monthKeyFromDate(lastResult.data.sale_date) : current;
  const [startYear, startMonth] = earliest.split('-').map(Number);
  const [endYear, endMonth] = (latest > current ? latest : current).split('-').map(Number);
  monthKeys = [];
  for (let year = endYear, month = endMonth; year > startYear || (year === startYear && month >= startMonth);) {
    monthKeys.push(`${year}-${String(month).padStart(2, '0')}`);
    month -= 1;
    if (month === 0) { year -= 1; month = 12; }
  }
  monthSelect.replaceChildren();
  for (const key of monthKeys) {
    const option = document.createElement('option');
    option.value = key;
    option.textContent = monthLabel(key);
    monthSelect.append(option);
  }
  monthSelect.value = monthKeys.includes(preferredMonth) ? preferredMonth : (monthKeys.includes(current) ? current : monthKeys[0]);
  updateMonthNavigation();
}

function addCell(row, value, className = '') {
  const cell = document.createElement('td');
  cell.textContent = value;
  if (className) cell.className = className;
  row.append(cell);
}

async function loadInvestments() {
  document.querySelector('#investment-count').textContent = 'Cargando inversiones…';
  const { data, error } = await supabase.from('investments')
    .select('id, product, quantity, purchase_usd, weight_lb, price_per_lb, exchange_rate, created_at')
    .order('created_at', { ascending: true });
  if (error) {
    investmentsLoaded = false;
    investmentItems = [];
    renderInvestmentTable();
    document.querySelector('#investment-count').textContent = 'No se pudieron cargar';
    setMessage(document.querySelector('#investment-message'), `Falta crear la tabla de inversiones en Supabase o hubo un error: ${error.message}. Ejecuta supabase/investments.sql en SQL Editor.`, 'error');
    renderInvestmentProgress(0);
    return false;
  }
  investmentItems = data || [];
  investmentsLoaded = true;
  renderInvestmentTable();
  setMessage(document.querySelector('#investment-message'));
  renderInvestmentProgress(cumulativeSalesAmount);
  return true;
}

async function loadProducts(preferredName = productSelect.selectedOptions[0]?.textContent || 'Hielo Gourmet') {
  const { data, error } = await supabase.from('products')
    .select('id, product, default_price, created_at')
    .eq('user_id', businessOwnerId)
    .order('product', { ascending: true });
  if (error) {
    productsLoaded = false;
    products = [
      { id: 'fallback-hielo-gourmet', product: 'Hielo Gourmet', default_price: 300 },
      { id: 'fallback-frappe', product: 'Frappe', default_price: 450 },
    ];
    renderProductOptions(preferredName);
    renderProductsTable();
    setMessage(document.querySelector('#catalog-message'), `Para guardar el catálogo ejecuta supabase/products.sql en Supabase > SQL Editor. Error: ${error.message}`, 'error');
    return false;
  }
  productsLoaded = true;
  products = data || [];
  renderProductOptions(preferredName);
  renderProductsTable();
  setMessage(document.querySelector('#catalog-message'));
  return true;
}

async function showSignedIn(user) {
  currentUser = user;
  await loadUserAccess(user);
  document.querySelector('#activity-tab').hidden = user.id !== businessOwnerId;
  authPanel.hidden = true;
  appPanel.hidden = false;
  sessionArea.hidden = false;
  document.querySelector('#user-email').textContent = user.email ?? '';
  await loadMonthArchive();
  await loadInvestments();
  await loadProducts();
  await loadPendingSales();
  await loadSales();
  await loadWallet();
}

function showSignedOut() {
  currentUser = null;
  businessOwnerId = null;
  authPanel.hidden = false;
  appPanel.hidden = true;
  sessionArea.hidden = true;
  investmentItems = [];
  investmentsLoaded = false;
  walletTransactions = [];
  walletLoaded = false;
  allTimeSalesTotal = 0;
  allTimeSalesLoaded = false;
  renderWallet();
  pendingSales = [];
  pendingSalesLoaded = false;
  renderPendingSales();
  products = [];
  productsLoaded = false;
}

async function loadSales() {
  if (!currentUser) return;
  salesBody.replaceChildren();
  salesChart.replaceChildren();
  const loadingRow = document.createElement('tr');
  const loadingCell = document.createElement('td');
  loadingCell.colSpan = 6;
  loadingCell.className = 'loading';
  loadingCell.textContent = 'Cargando ventas…';
  loadingRow.append(loadingCell);
  salesBody.append(loadingRow);
  setMessage(tableMessage);

  const selectedMonth = monthSelect.value || currentMonthKey();
  const priorMonth = previousMonthKey(selectedMonth);
  const today = currentDateKey();
  const [currentResult, previousTotalResult, cumulativeResult, generalTotalResult, todaySalesResult] = await Promise.all([
    supabase.from('sales').select('id, sale_date, product, unit_price, quantity, total, created_at')
      .eq('user_id', businessOwnerId)
      .gte('sale_date', monthStart(selectedMonth)).lt('sale_date', nextMonthStart(selectedMonth))
      .order('sale_date', { ascending: true }).order('created_at', { ascending: true }),
    fetchSalesTotal(monthStart(priorMonth), nextMonthStart(priorMonth)),
    fetchSalesTotal(null, nextMonthStart(selectedMonth)),
    fetchSalesTotal(null, null),
    fetchSalesForDate(today),
  ]);
  const { data, error } = currentResult;

  allTimeSalesLoaded = !generalTotalResult.error;
  if (allTimeSalesLoaded) allTimeSalesTotal = generalTotalResult.total;
  renderWallet();

  if (error) {
    setMessage(tableMessage, `No se pudieron cargar las ventas: ${error.message}`, 'error');
    return;
  }

  currentMonthSales = data;
  renderSalesChart(data, selectedMonth);

  let quantitySum = 0;
  let totalSum = 0;
  for (const sale of data) {
    quantitySum += Number(sale.quantity);
    totalSum += Number(sale.total);
  }

  animateSummaryValue(document.querySelector('#summary-total'), totalSum, formatCup);
  document.querySelector('#summary-month-label').textContent = monthLabel(selectedMonth);
  if (generalTotalResult.error) document.querySelector('#summary-general-total').textContent = '—';
  else animateSummaryValue(document.querySelector('#summary-general-total'), allTimeSalesTotal, formatCup);
  renderProductUnitSummary(data, quantitySum, selectedMonth);
  if (todaySalesResult.error) {
    document.querySelector('#summary-day-total').textContent = '—';
    document.querySelector('#summary-day-units').textContent = '—';
    document.querySelector('#summary-day-operations').textContent = '—';
  } else {
    const todayUnits = todaySalesResult.rows.reduce((sum, sale) => sum + Number(sale.quantity), 0);
    animateSummaryValue(document.querySelector('#summary-day-total'), todaySalesResult.total, formatCup);
    document.querySelector('#summary-day-units').textContent = todayUnits.toLocaleString('en-US');
    document.querySelector('#summary-day-operations').textContent = todaySalesResult.rows.length.toLocaleString('en-US');
  }
  updateTodayPendingMetric();
  document.querySelector('#summary-day-caption').textContent = todaySalesResult.error
    ? 'No se pudo consultar el total de hoy'
    : `Todos los productos · ${formatDate(today)}`;
  document.querySelector('#sales-count').textContent = `${data.length.toLocaleString('en-US')} ${data.length === 1 ? 'registro' : 'registros'}`;
  const previousTotal = previousTotalResult.total;
  const comparisonValue = previousTotalResult.error ? '—' : previousTotal > 0
    ? `${totalSum >= previousTotal ? '+' : ''}${(((totalSum - previousTotal) / previousTotal) * 100).toFixed(1)}%`
    : totalSum > 0 ? 'Nuevo' : '0.0%';
  const monthChange = document.querySelector('#summary-month-change');
  monthChange.textContent = comparisonValue;
  monthChange.classList.toggle('is-up', comparisonValue.startsWith('+') || comparisonValue === 'Nuevo');
  monthChange.classList.toggle('is-down', comparisonValue.startsWith('-'));
  monthChange.classList.toggle('is-flat', !comparisonValue.startsWith('+') && !comparisonValue.startsWith('-') && comparisonValue !== 'Nuevo');
  monthChange.title = `Ventas de ${monthLabel(selectedMonth)} comparadas con ${monthLabel(priorMonth)}`;
  if (!cumulativeResult.error) {
    cumulativeSalesAmount = cumulativeResult.total;
    renderInvestmentProgress(cumulativeSalesAmount);
  } else document.querySelector('#recovery-message').textContent = `No se pudo actualizar el avance de recuperación: ${cumulativeResult.error.message}`;
  renderPrintReport(data, selectedMonth, quantitySum, totalSum, comparisonValue);

  if (data.length === 0) {
    const row = document.createElement('tr');
    const cell = document.createElement('td');
    cell.colSpan = 5;
    cell.className = 'loading';
    cell.textContent = 'Todavía no hay ventas guardadas.';
    row.append(cell);
    salesBody.append(row);
  }
  renderSalesTable();
  updateMonthNavigation();
}

function showConfigurationError() {
  authPanel.hidden = false;
  document.querySelector('#auth-title').textContent = 'Falta configurar Supabase';
  authForm.hidden = true;
  setMessage(authMessage, 'Agrega la URL del proyecto y la clave publishable en app.js después de crear el proyecto Supabase.', 'error');
}

function openSaleDialog() {
  saleForm.reset();
  document.querySelector('#sale-date').value = currentDateKey();
  const preferred = products.find((product) => product.product === 'Hielo Gourmet') || products[0];
  if (preferred) {
    productSelect.value = preferred.id;
    document.querySelector('#price').value = Number(preferred.default_price).toFixed(2);
  }
  setMessage(saleMessage);
  updateSalePreview();
  saleDialog.showModal();
  document.querySelector('#sale-date').focus();
}

document.querySelector('#open-sale-dialog').addEventListener('click', openSaleDialog);
document.querySelector('#close-sale-dialog').addEventListener('click', () => saleDialog.close());
document.querySelector('#cancel-sale-dialog').addEventListener('click', () => saleDialog.close());
document.querySelector('#open-pending-dialog').addEventListener('click', () => {
  resetPendingSaleForm();
  pendingDialog.showModal();
  document.querySelector('#pending-date').focus();
});
for (const id of ['close-pending-dialog', 'cancel-pending-dialog']) {
  document.querySelector(`#${id}`).addEventListener('click', () => {
    resetPendingSaleForm();
    pendingDialog.close();
  });
}

document.querySelectorAll('.main-tab').forEach((tab) => {
  tab.addEventListener('click', () => {
    const targetView = tab.dataset.view;
    document.querySelector('#sales-view').hidden = targetView !== 'sales-view';
    document.querySelector('#investment-view').hidden = targetView !== 'investment-view';
    document.querySelector('#wallet-view').hidden = targetView !== 'wallet-view';
    document.querySelector('#activity-view').hidden = targetView !== 'activity-view';
    document.querySelectorAll('.main-tab').forEach((item) => {
      const active = item === tab;
      item.classList.toggle('is-active', active);
      item.setAttribute('aria-selected', String(active));
    });
    if (targetView === 'investment-view') window.requestAnimationFrame(replayInvestmentProgress);
    if (targetView === 'wallet-view') loadWallet();
    if (targetView === 'activity-view') loadActivityLogs();
  });
});

document.querySelector('#activity-refresh').addEventListener('click', () => loadActivityLogs());
document.querySelector('#activity-more').addEventListener('click', () => loadActivityLogs(false));
for (const filter of ['activity-actor', 'activity-entity', 'activity-action', 'activity-from', 'activity-to']) {
  document.querySelector(`#${filter}`).addEventListener('change', () => loadActivityLogs());
}

if (SUPABASE_URL.includes('YOUR_PROJECT_ID') || SUPABASE_PUBLISHABLE_KEY.includes('YOUR_SUPABASE')) {
  showConfigurationError();
} else {
  supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);

  authForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    setMessage(authMessage, 'Iniciando sesión…');
    const { data, error } = await supabase.auth.signInWithPassword({
      email: document.querySelector('#email').value.trim(),
      password: document.querySelector('#password').value,
    });
    if (error) return setMessage(authMessage, error.message, 'error');
    setMessage(authMessage);
    if (data.user) showSignedIn(data.user);
  });

  document.querySelector('#sign-out').addEventListener('click', async () => {
    const { error } = await supabase.auth.signOut();
    if (error) setMessage(authMessage, error.message, 'error');
    else showSignedOut();
  });

  document.querySelector('#refresh').addEventListener('click', async () => {
    await loadMonthArchive(monthSelect.value);
    await loadInvestments();
    await loadSales();
    await loadPendingSales();
  });

  document.querySelector('#investment-refresh').addEventListener('click', async () => {
    if (await loadInvestments()) await loadSales();
  });

  document.querySelector('#manage-products').addEventListener('click', async () => {
    productsDialog.showModal();
    await loadProducts();
  });
  document.querySelector('#close-products').addEventListener('click', () => productsDialog.close());
  document.querySelector('#catalog-cancel').addEventListener('click', resetProductForm);
  productSelect.addEventListener('change', () => {
    const selected = products.find((item) => item.id === productSelect.value);
    if (selected) document.querySelector('#price').value = Number(selected.default_price).toFixed(2);
    updateSalePreview();
  });

  productForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!currentUser || !productsLoaded) {
      setMessage(document.querySelector('#catalog-message'), 'Ejecuta primero supabase/products.sql en Supabase > SQL Editor.', 'error');
      return;
    }
    const productId = document.querySelector('#catalog-product-id').value;
    const product = {
      product: document.querySelector('#catalog-product-name').value.trim(),
      default_price: Number(document.querySelector('#catalog-product-price').value),
    };
    let result;
    if (productId) {
      result = await supabase.from('products').update(product)
        .eq('id', productId).eq('user_id', businessOwnerId).select('id').maybeSingle();
      if (!result.error && !result.data) result.error = new Error('No se encontró el producto o no tienes permiso para editarlo.');
    } else {
      result = await supabase.from('products').insert({ ...product, user_id: businessOwnerId });
    }
    if (result.error) {
      setMessage(document.querySelector('#catalog-message'), `No se pudo guardar el producto: ${result.error.message}`, 'error');
      return;
    }
    resetProductForm();
    await loadProducts(product.product);
    setMessage(document.querySelector('#catalog-message'), productId ? 'Producto actualizado.' : 'Producto agregado al catálogo.', 'success');
  });

  productsBody.addEventListener('click', async (event) => {
    const button = event.target.closest('[data-product-action]');
    if (!button) return;
    const item = products.find((product) => product.id === button.dataset.productId);
    if (!item) return;
    if (button.dataset.productAction === 'edit') {
      editProduct(item);
      return;
    }
    if (products.length === 1) {
      setMessage(document.querySelector('#catalog-message'), 'Mantén al menos un producto en el catálogo.', 'error');
      return;
    }
    if (!window.confirm(`¿Eliminar “${item.product}” del catálogo? Las ventas anteriores conservarán sus datos.`)) return;
    const { data, error } = await supabase.from('products').delete()
      .eq('id', item.id).eq('user_id', businessOwnerId).select('id').maybeSingle();
    if (error || !data) {
      setMessage(document.querySelector('#catalog-message'), `No se pudo eliminar el producto: ${error?.message || 'no se encontró o no tienes permiso.'}`, 'error');
      return;
    }
    resetProductForm();
    await loadProducts();
    setMessage(document.querySelector('#catalog-message'), 'Producto eliminado del catálogo.', 'success');
  });

  investmentForm.addEventListener('input', updateInvestmentPreview);
  document.querySelector('#investment-cancel').addEventListener('click', resetInvestmentForm);
  investmentForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!currentUser || !investmentsLoaded) {
      setMessage(document.querySelector('#investment-message'), 'Ejecuta primero supabase/investments.sql en Supabase > SQL Editor.', 'error');
      return;
    }
    const investmentId = document.querySelector('#investment-id').value;
    const investment = {
      product: document.querySelector('#investment-product').value.trim(),
      quantity: Number(document.querySelector('#investment-quantity').value),
      purchase_usd: Number(document.querySelector('#investment-purchase').value),
      weight_lb: Number(document.querySelector('#investment-weight').value),
      price_per_lb: Number(document.querySelector('#investment-price-lb').value),
      exchange_rate: Number(document.querySelector('#investment-rate').value),
    };
    setMessage(document.querySelector('#investment-message'), investmentId ? 'Actualizando inversión…' : 'Guardando inversión…');
    let error;
    if (investmentId) {
      const result = await supabase.from('investments').update(investment)
        .eq('id', investmentId).eq('user_id', businessOwnerId).select('id').maybeSingle();
      error = result.error || (!result.data ? new Error('No se encontró la inversión o no tienes permiso para editarla.') : null);
    } else {
      const result = await supabase.from('investments').insert({ ...investment, user_id: businessOwnerId });
      error = result.error;
    }
    if (error) {
      setMessage(document.querySelector('#investment-message'), `No se pudo guardar: ${error.message}`, 'error');
      return;
    }
    resetInvestmentForm();
    await loadInvestments();
    await loadSales();
    setMessage(document.querySelector('#investment-message'), investmentId ? 'Inversión actualizada.' : 'Inversión guardada.', 'success');
  });

  investmentBody.addEventListener('click', async (event) => {
    const button = event.target.closest('[data-investment-action]');
    if (!button) return;
    const item = investmentItems.find((investment) => investment.id === button.dataset.investmentId);
    if (!item) return;
    if (button.dataset.investmentAction === 'edit') {
      editInvestment(item);
      return;
    }
    const { investmentCup } = getInvestmentAmounts(item);
    if (!window.confirm(`¿Eliminar la inversión “${item.product}” por ${formatCup(investmentCup)}? Esta acción no se puede deshacer.`)) return;
    const { data, error } = await supabase.from('investments').delete()
      .eq('id', item.id).eq('user_id', businessOwnerId).select('id').maybeSingle();
    if (error || !data) {
      setMessage(document.querySelector('#investment-message'), `No se pudo eliminar la inversión: ${error?.message || 'no se encontró el registro o no tienes permiso.'}`, 'error');
      return;
    }
    resetInvestmentForm();
    await loadInvestments();
    await loadSales();
    setMessage(document.querySelector('#investment-message'), 'Inversión eliminada.', 'success');
  });

  pendingProductSelect.addEventListener('change', () => {
    const selected = products.find((item) => item.id === pendingProductSelect.value);
    if (selected) document.querySelector('#pending-price').value = Number(selected.default_price).toFixed(2);
    updatePendingSalePreview();
  });
  for (const id of ['pending-price', 'pending-quantity']) {
    document.querySelector(`#${id}`).addEventListener('input', updatePendingSalePreview);
  }
  document.querySelector('#pending-cancel').addEventListener('click', resetPendingSaleForm);
  pendingSaleForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!currentUser || !pendingSalesLoaded || !productsLoaded) {
      setMessage(document.querySelector('#pending-form-message'), 'Verifica las tablas de Supabase y vuelve a cargar. La tabla de pendientes se configura con supabase/pending-sales.sql.', 'error');
      return;
    }
    const pendingId = document.querySelector('#pending-sale-id').value;
    const selectedProduct = products.find((item) => item.id === pendingProductSelect.value);
    const originalPending = pendingId ? pendingSales.find((item) => item.id === pendingId) : null;
    if (!selectedProduct && !(originalPending && pendingProductSelect.value === `existing-${pendingId}`)) {
      setMessage(document.querySelector('#pending-form-message'), 'Selecciona un producto del catalogo.', 'error');
      return;
    }
    const pendingSale = {
      sale_date: document.querySelector('#pending-date').value,
      customer_reference: document.querySelector('#pending-reference').value.trim(),
      product: selectedProduct?.product || originalPending.product,
      unit_price: Number(document.querySelector('#pending-price').value),
      quantity: Number(document.querySelector('#pending-quantity').value),
    };
    setMessage(document.querySelector('#pending-form-message'), pendingId ? 'Actualizando pendiente…' : 'Guardando pendiente…');
    let error;
    if (pendingId) {
      const result = await supabase.from('pending_sales').update(pendingSale)
        .eq('id', pendingId).eq('user_id', businessOwnerId).eq('status', 'pending').select('id').maybeSingle();
      error = result.error || (!result.data ? new Error('El pendiente ya no existe o ya fue confirmado.') : null);
    } else {
      const result = await supabase.from('pending_sales').insert({ ...pendingSale, user_id: businessOwnerId });
      error = result.error;
    }
    if (error) {
      setMessage(document.querySelector('#pending-form-message'), `No se pudo guardar el pendiente: ${error.message}`, 'error');
      return;
    }
    resetPendingSaleForm();
    await loadPendingSales();
    pendingDialog.close();
    setMessage(document.querySelector('#pending-table-message'), pendingId ? 'Pendiente actualizado.' : 'Venta agregada a pendientes de cobro.', 'success');
  });

  pendingSalesBody.addEventListener('click', async (event) => {
    const button = event.target.closest('[data-pending-action]');
    if (!button) return;
    const sale = pendingSales.find((item) => item.id === button.dataset.pendingSaleId);
    if (!sale) return;

    if (button.dataset.pendingAction === 'edit') {
      editPendingSale(sale);
      return;
    }

    if (button.dataset.pendingAction === 'delete') {
      if (!window.confirm(`¿Eliminar el pendiente ${sale.customer_reference} por ${formatCup(sale.total)}? Esta acción no se puede deshacer.`)) return;
      const { data, error } = await supabase.from('pending_sales').delete()
        .eq('id', sale.id).eq('user_id', businessOwnerId).eq('status', 'pending').select('id').maybeSingle();
      if (error || !data) {
        setMessage(document.querySelector('#pending-table-message'), `No se pudo eliminar el pendiente: ${error?.message || 'ya no existe o ya fue confirmado.'}`, 'error');
        return;
      }
      if (document.querySelector('#pending-sale-id').value === sale.id) resetPendingSaleForm();
      await loadPendingSales();
      setMessage(document.querySelector('#pending-table-message'), 'Pendiente eliminado; no se modificaron ventas ni billetera.', 'success');
      return;
    }

    if (!window.confirm(`¿Confirmar que recibiste ${formatCup(sale.total)} de ${sale.customer_reference}? Se sumará al historial diario y al efectivo disponible.`)) return;
    button.disabled = true;
    setMessage(document.querySelector('#pending-table-message'), 'Confirmando el cobro…');
    const { error } = await supabase.rpc('confirm_pending_sale', { p_pending_sale_id: sale.id });
    if (error) {
      button.disabled = false;
      const detail = error.message.includes('DAILY_PRODUCT_PRICE_MISMATCH')
        ? 'Ya existe ese producto en esa fecha con otro precio. Edita el pendiente o corrige el precio de la venta diaria antes de confirmar.'
        : error.message;
      setMessage(document.querySelector('#pending-table-message'), `No se pudo confirmar el cobro: ${detail}`, 'error');
      return;
    }
    if (document.querySelector('#pending-sale-id').value === sale.id) resetPendingSaleForm();
    await loadMonthArchive(monthKeyFromDate(sale.sale_date));
    await loadSales();
    await loadPendingSales();
    setMessage(document.querySelector('#pending-table-message'), `Cobro confirmado: ${sale.customer_reference}. Se agregó al historial de ventas.`, 'success');
  });

  document.querySelector('#wallet-cancel').addEventListener('click', resetWalletForm);
  document.querySelector('#wallet-refresh').addEventListener('click', loadWallet);
  walletForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!currentUser || !walletLoaded) {
      setMessage(document.querySelector('#wallet-message'), 'Ejecuta primero supabase/wallet.sql en Supabase > SQL Editor.', 'error');
      return;
    }
    const transactionId = document.querySelector('#wallet-transaction-id').value;
    const transaction = {
      transaction_date: document.querySelector('#wallet-date').value,
      transaction_type: document.querySelector('#wallet-type').value,
      description: document.querySelector('#wallet-description').value.trim(),
      amount: Number(document.querySelector('#wallet-amount').value),
    };
    setMessage(document.querySelector('#wallet-message'), transactionId ? 'Actualizando movimiento…' : 'Guardando movimiento…');
    let error;
    if (transactionId) {
      const result = await supabase.from('wallet_transactions').update(transaction)
        .eq('id', transactionId).eq('user_id', businessOwnerId).select('id').maybeSingle();
      error = result.error || (!result.data ? new Error('No se encontró el movimiento o no tienes permiso para editarlo.') : null);
    } else {
      const result = await supabase.from('wallet_transactions').insert({ ...transaction, user_id: businessOwnerId });
      error = result.error;
    }
    if (error) {
      setMessage(document.querySelector('#wallet-message'), `No se pudo guardar: ${error.message}`, 'error');
      return;
    }
    resetWalletForm();
    await loadWallet();
    setMessage(document.querySelector('#wallet-message'), transactionId ? 'Movimiento actualizado.' : 'Movimiento guardado.', 'success');
  });

  walletBody.addEventListener('click', async (event) => {
    const button = event.target.closest('[data-wallet-action]');
    if (!button) return;
    const item = walletTransactions.find((transaction) => transaction.id === button.dataset.walletId);
    if (!item) return;
    if (button.dataset.walletAction === 'edit') {
      editWalletTransaction(item);
      return;
    }
    if (!window.confirm(`¿Eliminar el movimiento “${item.description}” por ${formatCup(item.amount)}? Esta acción no se puede deshacer.`)) return;
    const { data, error } = await supabase.from('wallet_transactions').delete()
      .eq('id', item.id).eq('user_id', businessOwnerId).select('id').maybeSingle();
    if (error || !data) {
      setMessage(document.querySelector('#wallet-table-message'), `No se pudo eliminar el movimiento: ${error?.message || 'no se encontró o no tienes permiso.'}`, 'error');
      return;
    }
    if (document.querySelector('#wallet-transaction-id').value === item.id) resetWalletForm();
    await loadWallet();
    setMessage(document.querySelector('#wallet-table-message'), 'Movimiento eliminado de la billetera.', 'success');
  });

  monthSelect.addEventListener('change', () => {
    document.querySelector('#date-from').value = '';
    document.querySelector('#date-to').value = '';
    loadSales();
  });
  previousMonthButton.addEventListener('click', () => {
    const index = monthKeys.indexOf(monthSelect.value);
    if (index >= 0 && index < monthKeys.length - 1) {
      monthSelect.value = monthKeys[index + 1];
      updateMonthNavigation();
      document.querySelector('#date-from').value = '';
      document.querySelector('#date-to').value = '';
      loadSales();
    }
  });
  nextMonthButton.addEventListener('click', () => {
    const index = monthKeys.indexOf(monthSelect.value);
    if (index > 0) {
      monthSelect.value = monthKeys[index - 1];
      updateMonthNavigation();
      document.querySelector('#date-from').value = '';
      document.querySelector('#date-to').value = '';
      loadSales();
    }
  });

  for (const id of ['sales-search', 'date-from', 'date-to', 'sales-sort']) {
    document.querySelector(`#${id}`).addEventListener(id === 'sales-search' ? 'input' : 'change', renderSalesTable);
  }

  document.querySelector('#export-sales').addEventListener('click', () => {
    if (!visibleSales.length) {
      setMessage(tableMessage, 'No hay ventas visibles para exportar.', 'error');
      return;
    }
    const rows = [['Fecha', 'Producto', 'Precio de venta (CUP)', 'Cantidad', 'Total (CUP)'], ...visibleSales.map((sale) => [sale.sale_date, sale.product, Number(sale.unit_price).toFixed(2), sale.quantity, Number(sale.total).toFixed(2)])];
    const csv = `\uFEFF${rows.map((row) => row.map((value) => `"${String(value).replaceAll('"', '""')}"`).join(',')).join('\r\n')}`;
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `ventas-${monthSelect.value}.csv`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setMessage(tableMessage, `${visibleSales.length} ventas exportadas a CSV.`, 'success');
  });

  document.querySelector('#print-close').addEventListener('click', () => window.print());

  salesBody.addEventListener('click', async (event) => {
    const button = event.target.closest('[data-action]');
    if (!button) return;
    const sale = currentMonthSales.find((item) => item.id === button.dataset.saleId);
    if (!sale) return;
    if (button.dataset.action === 'edit') {
      editingSaleId = sale.id;
      document.querySelector('#edit-date').value = sale.sale_date;
      document.querySelector('#edit-product').value = sale.product;
      document.querySelector('#edit-price').value = Number(sale.unit_price).toFixed(2);
      document.querySelector('#edit-quantity').value = sale.quantity;
      setMessage(editMessage);
      updateEditPreview();
      editDialog.showModal();
      return;
    }
    if (!window.confirm(`¿Eliminar la venta del ${formatDate(sale.sale_date)} por ${formatCup(sale.total)}? Esta acción no se puede deshacer.`)) return;
      const { data, error } = await supabase.from('sales').delete().eq('id', sale.id).eq('user_id', businessOwnerId).select('id').maybeSingle();
    if (error) {
      setMessage(tableMessage, `No se pudo eliminar la venta: ${error.message}`, 'error');
      return;
    }
    if (!data) {
      setMessage(tableMessage, 'No se encontró la venta o no tienes permiso para eliminarla.', 'error');
      return;
    }
    await loadMonthArchive(monthSelect.value);
    await loadSales();
    setMessage(tableMessage, 'Venta eliminada.', 'success');
  });

  for (const id of ['edit-price', 'edit-quantity']) {
    document.querySelector(`#${id}`).addEventListener('input', updateEditPreview);
  }
  document.querySelector('#close-edit').addEventListener('click', () => editDialog.close());
  document.querySelector('#cancel-edit').addEventListener('click', () => editDialog.close());
  editForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!editingSaleId || !currentUser) return;
    const updatedSale = {
      sale_date: document.querySelector('#edit-date').value,
      product: document.querySelector('#edit-product').value.trim(),
      unit_price: Number(document.querySelector('#edit-price').value),
      quantity: Number(document.querySelector('#edit-quantity').value),
    };
    const { data: sameDaySales, error: duplicateCheckError } = await supabase.from('sales')
      .select('id, product').eq('user_id', businessOwnerId).eq('sale_date', updatedSale.sale_date);
    if (duplicateCheckError) {
      setMessage(editMessage, `No se pudo comprobar si ya existe el producto en esa fecha: ${duplicateCheckError.message}`, 'error');
      return;
    }
    const duplicate = sameDaySales.some((sale) => sale.id !== editingSaleId
      && sale.product.trim().toLocaleLowerCase('es') === updatedSale.product.trim().toLocaleLowerCase('es'));
    if (duplicate) {
      setMessage(editMessage, 'Ya existe una operación para ese producto en esa fecha. Edita la operación existente para evitar duplicados.', 'error');
      return;
    }
    const { data, error } = await supabase.from('sales').update(updatedSale)
      .eq('id', editingSaleId).eq('user_id', businessOwnerId).select('id').maybeSingle();
    if (error) {
      setMessage(editMessage, `No se pudieron guardar los cambios: ${error.message}`, 'error');
      return;
    }
    if (!data) {
      setMessage(editMessage, 'No se encontró la venta o no tienes permiso para modificarla.', 'error');
      return;
    }
    const editedMonth = monthKeyFromDate(updatedSale.sale_date);
    editingSaleId = null;
    editDialog.close();
    await loadMonthArchive(editedMonth);
    await loadSales();
    setMessage(tableMessage, 'Cambios guardados correctamente.', 'success');
  });

  for (const id of ['price', 'quantity']) {
    document.querySelector(`#${id}`).addEventListener('input', updateSalePreview);
  }

  saleForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!currentUser) return;
    setMessage(saleMessage, 'Guardando operación…');
    const selectedProduct = products.find((item) => item.id === productSelect.value);
    if (!selectedProduct) return setMessage(saleMessage, 'Selecciona un producto del catálogo.', 'error');
    const sale = {
      sale_date: document.querySelector('#sale-date').value,
      product: selectedProduct.product,
      unit_price: Number(document.querySelector('#price').value),
      quantity: Number(document.querySelector('#quantity').value),
    };
    const { error } = await supabase.rpc('record_daily_sale', {
      p_sale_date: sale.sale_date,
      p_product: sale.product,
      p_unit_price: sale.unit_price,
      p_quantity: sale.quantity,
    });
    if (error) {
      const message = error.message.includes('DAILY_PRODUCT_PRICE_MISMATCH')
        ? 'Ese producto ya tiene una operación en esa fecha con otro precio. Para conservar el historial correcto, edita la operación existente en lugar de agregar otra.'
        : `No se pudo guardar la operación: ${error.message}`;
      return setMessage(saleMessage, message, 'error');
    }
    document.querySelector('#quantity').value = '';
    updateSalePreview();
    setMessage(saleMessage, 'Operación guardada. Si ya existía el producto en esa fecha, la cantidad se acumuló en la misma fila.', 'success');
    await loadMonthArchive(monthKeyFromDate(sale.sale_date));
    await loadSales();
    saleDialog.close();
    setMessage(tableMessage, 'Venta guardada correctamente.', 'success');
  });

  document.querySelector('#sale-date').value = new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  updateSalePreview();
  updateInvestmentPreview();
  document.querySelector('#wallet-date').value = currentDateKey();
  document.querySelector('#pending-date').value = currentDateKey();
  updatePendingSalePreview();

  supabase.auth.getSession().then(({ data, error }) => {
    if (error) setMessage(authMessage, error.message, 'error');
    if (data.session?.user) showSignedIn(data.session.user);
    else showSignedOut();
  });
}
