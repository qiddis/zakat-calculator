// ========================================
// Zakat Calculator - Main Application
// ========================================

const STORAGE_KEY = 'zakat-calculator-data';
const ZAKAT_RATE = 0.025; // 2.5%
const NISAB_GOLD_GRAMS = 87.48;
const NISAB_SILVER_GRAMS = 612.36;

const CURRENCY_SYMBOLS = {
  INR: '₹', USD: '$', GBP: '£', EUR: '€', SAR: '﷼', AED: 'د.إ'
};

// ========================================
// State Management
// ========================================
let state = {
  settings: {
    currency: 'INR',
    nisabMethod: 'silver',
    goldKarat: '22'
  },
  metalPrices: {
    gold: { pricePerGram: 0, pricePerOunce: 0 },
    silver: { pricePerGram: 0, pricePerOunce: 0 }
  },
  members: [],
  activeMemberId: null,
  lastUpdated: null
};

function createDefaultMember(name = 'Myself') {
  return {
    id: generateId(),
    name: name,
    goldKarat: state.settings.goldKarat || '22',
    portfolio: {
      etfs: [],
      crypto: [],
      stocks: [],
      gold: [],
      silver: [],
      cash: [],
      liabilities: []
    }
  };
}

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
}

// ========================================
// Persistence
// ========================================
function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function loadState() {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved) {
    try {
      const parsed = JSON.parse(saved);
      state = { ...state, ...parsed };
      // Ensure all members have all portfolio keys & migrate legacy data
      state.members.forEach(m => {
        if (!m.portfolio.cash) m.portfolio.cash = [];
        if (!m.portfolio.liabilities) m.portfolio.liabilities = [];
        if (!m.portfolio.stocks) m.portfolio.stocks = [];
        if (!m.portfolio.crypto) m.portfolio.crypto = [];
        if (!m.goldKarat) m.goldKarat = state.settings.goldKarat || '22';
        // Migrate goldETFs + silverETFs → etfs
        if (!m.portfolio.etfs) m.portfolio.etfs = [];
        if (m.portfolio.goldETFs && m.portfolio.goldETFs.length) {
          m.portfolio.etfs = m.portfolio.etfs.concat(m.portfolio.goldETFs);
          delete m.portfolio.goldETFs;
        }
        if (m.portfolio.silverETFs && m.portfolio.silverETFs.length) {
          m.portfolio.etfs = m.portfolio.etfs.concat(m.portfolio.silverETFs);
          delete m.portfolio.silverETFs;
        }
      });
    } catch (e) {
      console.error('Failed to load saved data:', e);
    }
  }
  // Ensure at least one member exists
  if (state.members.length === 0) {
    const defaultMember = createDefaultMember();
    state.members.push(defaultMember);
    state.activeMemberId = defaultMember.id;
    saveState();
  }
  if (!state.activeMemberId) {
    state.activeMemberId = state.members[0].id;
  }
}

// ========================================
// API Calls
// ========================================
async function fetchPrice(symbol) {
  const currency = state.settings.currency || 'USD';
  const res = await fetch(`/api/price/${encodeURIComponent(symbol)}?currency=${encodeURIComponent(currency)}`);
  if (!res.ok) throw new Error(`Failed to fetch ${symbol}`);
  return res.json();
}

async function fetchMultiplePrices(symbols) {
  const currency = state.settings.currency || 'USD';
  const res = await fetch('/api/prices', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ symbols, currency })
  });
  if (!res.ok) throw new Error('Failed to fetch prices');
  return res.json();
}

async function fetchMetalPrices() {
  const currency = state.settings.currency || 'USD';
  const res = await fetch(`/api/metal-prices?currency=${currency}`);
  if (!res.ok) throw new Error('Failed to fetch metal prices');
  return res.json();
}

async function fetchExchangeRate(fromCurrency, toCurrency) {
  if (fromCurrency === toCurrency) return 1.0;
  const res = await fetch(`/api/exchange-rate/${encodeURIComponent(fromCurrency)}/${encodeURIComponent(toCurrency)}`);
  if (!res.ok) throw new Error(`Failed to fetch exchange rate ${fromCurrency} -> ${toCurrency}`);
  const data = await res.json();
  return data.rate;
}

// ========================================
// Utility
// ========================================
function currencySymbol() {
  return CURRENCY_SYMBOLS[state.settings.currency] || state.settings.currency;
}

function fmt(num) {
  if (num === undefined || num === null || isNaN(num)) return '0.00';
  return Number(num).toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}

function fmtCurrency(num) {
  return `${currencySymbol()} ${fmt(num)}`;
}

function showToast(message, type = 'info') {
  const container = document.getElementById('toastContainer');
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = message;
  container.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(20px)';
    toast.style.transition = 'all 0.3s';
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

function getActiveMember() {
  return state.members.find(m => m.id === state.activeMemberId);
}

// ========================================
// Rendering - Member Tabs
// ========================================
function renderMemberTabs() {
  const container = document.getElementById('membersTabs');
  container.innerHTML = '';
  state.members.forEach(member => {
    const tab = document.createElement('button');
    tab.className = `member-tab ${member.id === state.activeMemberId ? 'active' : ''}`;
    tab.innerHTML = `
      <span class="tab-name">${escapeHtml(member.name)}</span>
      ${state.members.length > 1 ? `
        <span class="tab-edit" title="Rename" data-id="${member.id}" data-action="edit">✎</span>
        <span class="tab-remove" title="Remove" data-id="${member.id}" data-action="remove">✕</span>
      ` : `
        <span class="tab-edit" title="Rename" data-id="${member.id}" data-action="edit">✎</span>
      `}
    `;
    tab.addEventListener('click', (e) => {
      const action = e.target.dataset.action;
      if (action === 'remove') {
        e.stopPropagation();
        removeMember(member.id);
        return;
      }
      if (action === 'edit') {
        e.stopPropagation();
        openMemberModal(member.id);
        return;
      }
      state.activeMemberId = member.id;
      saveState();
      renderAll();
    });
    container.appendChild(tab);
  });
}

function removeMember(id) {
  if (state.members.length <= 1) return;
  if (!confirm('Remove this family member and their portfolio?')) return;
  state.members = state.members.filter(m => m.id !== id);
  if (state.activeMemberId === id) {
    state.activeMemberId = state.members[0].id;
  }
  saveState();
  renderAll();
  showToast('Member removed', 'info');
}

// ========================================
// Rendering - Portfolio Tables
// ========================================
function renderETFTable(type) {
  const member = getActiveMember();
  if (!member) return;
  const items = member.portfolio[type] || [];
  const bodyId = type + 'Body';
  const totalId = type + 'Total';
  const body = document.getElementById(bodyId);
  body.innerHTML = '';

  if (items.length === 0) {
    body.innerHTML = '<div class="table-empty">No holdings added yet</div>';
    document.getElementById(totalId).textContent = fmtCurrency(0);
    return;
  }

  let total = 0;
  items.forEach((item, idx) => {
    const value = (item.units || 0) * (item.currentPrice || 0);
    total += value;
    const row = document.createElement('div');
    row.className = 'table-row';
    row.innerHTML = `
      <span class="symbol">${escapeHtml(item.symbol)}${item.name ? `<span class="symbol-name">${escapeHtml(item.name)}</span>` : ''}</span>
      <span>${fmt(item.units)}</span>
      <span>${fmtCurrency(item.avgPrice)}</span>
      <span>${item.currentPrice ? fmtCurrency(item.currentPrice) : '<span class="price-loading">Not fetched</span>'}</span>
      <span class="value">${fmtCurrency(value)}</span>
      <span class="actions">
        <button class="btn-icon-action refresh" title="Update price" data-type="${type}" data-idx="${idx}">&#8635;</button>
        <button class="btn-icon-action" title="Edit" data-type="${type}" data-idx="${idx}" data-action="edit">✎</button>
        <button class="btn-icon-action delete" title="Delete" data-type="${type}" data-idx="${idx}" data-action="delete">✕</button>
      </span>
    `;
    // Event handlers
    row.querySelector('.refresh').addEventListener('click', () => updateSingleETFPrice(type, idx));
    row.querySelector('[data-action="edit"]').addEventListener('click', () => openItemModal(type, idx));
    row.querySelector('[data-action="delete"]').addEventListener('click', () => deleteItem(type, idx));
    body.appendChild(row);
  });

  document.getElementById(totalId).textContent = fmtCurrency(total);
}

function renderPhysicalTable(type) {
  const member = getActiveMember();
  if (!member) return;
  const items = member.portfolio[type] || [];
  const bodyId = type + 'Body';
  const totalId = type + 'Total';
  const body = document.getElementById(bodyId);
  body.innerHTML = '';

  if (items.length === 0) {
    body.innerHTML = '<div class="table-empty">No holdings added yet</div>';
    document.getElementById(totalId).textContent = fmtCurrency(0);
    return;
  }

  let total = 0;
  items.forEach((item, idx) => {
    const value = (item.weightGrams || 0) * (item.pricePerGram || 0);
    total += value;
    const row = document.createElement('div');
    row.className = 'table-row';
    if (type === 'gold') {
      const invested = (item.buyPricePerGram || 0) * (item.weightGrams || 0);
      const hasBuy = (item.buyPricePerGram || 0) > 0;
      const profit = hasBuy ? value - invested : 0;
      const profitClass = hasBuy ? (profit >= 0 ? 'positive' : 'negative') : 'dim';
      row.innerHTML = `
        <span>${escapeHtml(item.description || type)}</span>
        <span>${fmt(item.weightGrams)}</span>
        <span class="${hasBuy ? '' : 'dim'}">${hasBuy ? fmtCurrency(item.buyPricePerGram) : '—'}</span>
        <span>${fmtCurrency(item.pricePerGram)}</span>
        <span class="value">${fmtCurrency(value)}</span>
        <span class="${profitClass}">${hasBuy ? (profit >= 0 ? '+' : '') + fmtCurrency(profit) : '—'}</span>
        <span class="actions">
          <button class="btn-icon-action" title="Edit" data-action="edit">✎</button>
          <button class="btn-icon-action delete" title="Delete" data-action="delete">✕</button>
        </span>
      `;
    } else {
      const purity = item.purity || 100;
      const invested = (item.buyPricePerGram || 0) * (item.weightGrams || 0);
      const hasBuy = (item.buyPricePerGram || 0) > 0;
      const profit = hasBuy ? value - invested : 0;
      const profitClass = hasBuy ? (profit >= 0 ? 'positive' : 'negative') : 'dim';
      row.innerHTML = `
        <span>${escapeHtml(item.description || type)}</span>
        <span>${fmt(item.weightGrams)}</span>
        <span>${purity}%</span>
        <span class="${hasBuy ? '' : 'dim'}">${hasBuy ? fmtCurrency(item.buyPricePerGram) : '—'}</span>
        <span>${fmtCurrency(item.pricePerGram)}</span>
        <span class="value">${fmtCurrency(value)}</span>
        <span class="${profitClass}">${hasBuy ? (profit >= 0 ? '+' : '') + fmtCurrency(profit) : '—'}</span>
        <span class="actions">
          <button class="btn-icon-action" title="Edit" data-action="edit">✎</button>
          <button class="btn-icon-action delete" title="Delete" data-action="delete">✕</button>
        </span>
      `;
    }
    row.querySelector('[data-action="edit"]').addEventListener('click', () => openItemModal(type, idx));
    row.querySelector('[data-action="delete"]').addEventListener('click', () => deleteItem(type, idx));
    body.appendChild(row);
  });

  document.getElementById(totalId).textContent = fmtCurrency(total);
}

function renderCashTable(type) {
  const member = getActiveMember();
  if (!member) return;
  const items = member.portfolio[type] || [];
  const bodyId = type + 'Body';
  const totalId = type + 'Total';
  const body = document.getElementById(bodyId);
  body.innerHTML = '';

  if (items.length === 0) {
    body.innerHTML = '<div class="table-empty">No items added yet</div>';
    document.getElementById(totalId).textContent = fmtCurrency(0);
    return;
  }

  let total = 0;
  items.forEach((item, idx) => {
    total += (item.amount || 0);
    const row = document.createElement('div');
    row.className = 'table-row';
    row.innerHTML = `
      <span>${escapeHtml(item.description || '')}</span>
      <span></span>
      <span></span>
      <span></span>
      <span class="value">${fmtCurrency(item.amount)}</span>
      <span class="actions">
        <button class="btn-icon-action" title="Edit" data-action="edit">✎</button>
        <button class="btn-icon-action delete" title="Delete" data-action="delete">✕</button>
      </span>
    `;
    row.querySelector('[data-action="edit"]').addEventListener('click', () => openItemModal(type, idx));
    row.querySelector('[data-action="delete"]').addEventListener('click', () => deleteItem(type, idx));
    body.appendChild(row);
  });

  document.getElementById(totalId).textContent = fmtCurrency(total);
}

function renderPortfolio() {
  renderETFTable('etfs');
  renderETFTable('crypto');
  renderETFTable('stocks');
  renderPhysicalTable('gold');
  renderPhysicalTable('silver');
  renderCashTable('cash');
  renderCashTable('liabilities');
}

// ========================================
// Rendering - Zakat Summary
// ========================================
function calculateMemberWealth(member) {
  let etfsValue = 0;
  let cryptoValue = 0;
  let stocksValue = 0;
  let goldValue = 0;
  let silverValue = 0;
  let cashValue = 0;
  let liabilitiesValue = 0;

  (member.portfolio.etfs || []).forEach(item => {
    etfsValue += (item.units || 0) * (item.currentPrice || 0);
  });
  (member.portfolio.crypto || []).forEach(item => {
    cryptoValue += (item.units || 0) * (item.currentPrice || 0);
  });
  (member.portfolio.stocks || []).forEach(item => {
    stocksValue += (item.units || 0) * (item.currentPrice || 0);
  });
  (member.portfolio.gold || []).forEach(item => {
    goldValue += (item.weightGrams || 0) * (item.pricePerGram || 0);
  });
  (member.portfolio.silver || []).forEach(item => {
    silverValue += (item.weightGrams || 0) * (item.pricePerGram || 0);
  });
  (member.portfolio.cash || []).forEach(item => {
    cashValue += (item.amount || 0);
  });
  (member.portfolio.liabilities || []).forEach(item => {
    liabilitiesValue += (item.amount || 0);
  });

  const totalAssets = etfsValue + cryptoValue + stocksValue + goldValue + silverValue + cashValue;
  const netWealth = totalAssets - liabilitiesValue;

  return { etfsValue, cryptoValue, stocksValue, goldValue, silverValue, cashValue, liabilitiesValue, totalAssets, netWealth };
}

function getNisabThreshold() {
  const method = state.settings.nisabMethod;
  if (method === 'gold') {
    return NISAB_GOLD_GRAMS * (state.metalPrices.gold.pricePerGram || 0);
  } else {
    return NISAB_SILVER_GRAMS * (state.metalPrices.silver.pricePerGram || 0);
  }
}

function renderZakatSummary() {
  const container = document.getElementById('zakatSummaryCards');
  const combinedContainer = document.getElementById('combinedSummary');
  container.innerHTML = '';

  const nisab = getNisabThreshold();
  let combinedWealth = 0;
  let combinedZakat = 0;

  state.members.forEach(member => {
    const w = calculateMemberWealth(member);
    const zakatDue = w.netWealth >= nisab ? w.netWealth * ZAKAT_RATE : 0;
    combinedWealth += w.netWealth;
    combinedZakat += zakatDue;

    const card = document.createElement('div');
    card.className = 'summary-card';
    card.innerHTML = `
      <h3>${escapeHtml(member.name)}</h3>
      <div class="summary-row">
        <span class="label">ETFs</span>
        <span class="amount">${fmtCurrency(w.etfsValue)}</span>
      </div>
      <div class="summary-row">
        <span class="label">Crypto</span>
        <span class="amount">${fmtCurrency(w.cryptoValue)}</span>
      </div>
      <div class="summary-row">
        <span class="label">Stocks</span>
        <span class="amount">${fmtCurrency(w.stocksValue)}</span>
      </div>
      <div class="summary-row">
        <span class="label">Physical Gold</span>
        <span class="amount">${fmtCurrency(w.goldValue)}</span>
      </div>
      <div class="summary-row">
        <span class="label">Physical Silver</span>
        <span class="amount">${fmtCurrency(w.silverValue)}</span>
      </div>
      <div class="summary-row">
        <span class="label">Cash & Other</span>
        <span class="amount">${fmtCurrency(w.cashValue)}</span>
      </div>
      <div class="summary-row">
        <span class="label">Liabilities</span>
        <span class="amount" style="color: var(--accent-red);">- ${fmtCurrency(w.liabilitiesValue)}</span>
      </div>
      <div class="summary-row total">
        <span class="label">Net Zakatable Wealth</span>
        <span class="amount">${fmtCurrency(w.netWealth)}</span>
      </div>
      ${w.netWealth >= nisab
        ? `<div class="summary-row zakat-amount">
            <span class="label">Zakat Due (2.5%)</span>
            <span class="amount">${fmtCurrency(zakatDue)}</span>
          </div>`
        : `<div class="summary-row below-nisab">
            <span class="label">Status</span>
            <span class="amount">Below Nisab — No Zakat Due</span>
          </div>`
      }
    `;
    container.appendChild(card);
  });

  // Combined summary
  combinedContainer.innerHTML = `
    <h3>Combined Family Zakat</h3>
    <div class="combined-totals">
      <div class="combined-stat">
        <div class="stat-label">Total Family Wealth</div>
        <div class="stat-value wealth">${fmtCurrency(combinedWealth)}</div>
      </div>
      <div class="combined-stat">
        <div class="stat-label">Nisab Threshold (${state.settings.nisabMethod})</div>
        <div class="stat-value">${fmtCurrency(nisab)}</div>
      </div>
      <div class="combined-stat">
        <div class="stat-label">Total Zakat Payable</div>
        <div class="stat-value zakat">${fmtCurrency(combinedZakat)}</div>
      </div>
    </div>
  `;
}

// ========================================
// Rendering - Per-Item Analysis
// ========================================
function renderAnalysis() {
  const container = document.getElementById('analysisContainer');
  container.innerHTML = '';
  const nisab = getNisabThreshold();

  state.members.forEach(member => {
    const w = calculateMemberWealth(member);
    const isAboveNisab = w.netWealth >= nisab;

    const memberSection = document.createElement('div');
    memberSection.className = 'analysis-member';

    let rows = '';
    let totalInvested = 0;
    let totalCurrent = 0;
    let totalProfit = 0;
    let totalZakat = 0;

    // ETFs, Crypto, Stocks
    ['etfs', 'crypto', 'stocks'].forEach(type => {
      const typeLabel = type === 'etfs' ? 'ETF' : type === 'crypto' ? 'Crypto' : 'Stock';
      (member.portfolio[type] || []).forEach(item => {
        const invested = (item.units || 0) * (item.avgPrice || 0);
        const current = (item.units || 0) * (item.currentPrice || 0);
        const profit = current - invested;
        const itemZakat = isAboveNisab ? current * ZAKAT_RATE : 0;
        const ratio = itemZakat > 0 ? (profit / itemZakat) : 0;
        totalInvested += invested;
        totalCurrent += current;
        totalProfit += profit;
        totalZakat += itemZakat;

        const profitClass = profit >= 0 ? 'positive' : 'negative';
        rows += `
          <tr>
            <td><span class="analysis-type-badge ${type}">${typeLabel}</span></td>
            <td class="item-name">${escapeHtml(item.symbol)}${item.name ? ' <small>' + escapeHtml(item.name) + '</small>' : ''}</td>
            <td class="num">${fmtCurrency(invested)}</td>
            <td class="num">${fmtCurrency(current)}</td>
            <td class="num ${profitClass}">${profit >= 0 ? '+' : ''}${fmtCurrency(profit)}</td>
            <td class="num">${fmtCurrency(itemZakat)}</td>
            <td class="num ratio">${itemZakat > 0 ? ratio.toFixed(1) + 'x' : '—'}</td>
          </tr>
        `;
      });
    });

    // Physical Gold
    (member.portfolio.gold || []).forEach(item => {
      const invested = (item.weightGrams || 0) * (item.buyPricePerGram || 0);
      const current = (item.weightGrams || 0) * (item.pricePerGram || 0);
      const hasInvested = (item.buyPricePerGram || 0) > 0;
      const profit = hasInvested ? current - invested : 0;
      const itemZakat = isAboveNisab ? current * ZAKAT_RATE : 0;
      const ratio = (itemZakat > 0 && hasInvested) ? (profit / itemZakat) : 0;
      if (hasInvested) totalInvested += invested;
      totalCurrent += current;
      if (hasInvested) totalProfit += profit;
      totalZakat += itemZakat;

      const profitClass = hasInvested ? (profit >= 0 ? 'positive' : 'negative') : 'dim';
      rows += `
        <tr>
          <td><span class="analysis-type-badge gold">Gold</span></td>
          <td class="item-name">${escapeHtml(item.description || 'Physical Gold')} <small>${fmt(item.weightGrams)}g</small></td>
          <td class="num ${hasInvested ? '' : 'dim'}">${hasInvested ? fmtCurrency(invested) : '—'}</td>
          <td class="num">${fmtCurrency(current)}</td>
          <td class="num ${profitClass}">${hasInvested ? (profit >= 0 ? '+' : '') + fmtCurrency(profit) : '—'}</td>
          <td class="num">${fmtCurrency(itemZakat)}</td>
          <td class="num ${hasInvested ? 'ratio' : 'dim'}">${(itemZakat > 0 && hasInvested) ? ratio.toFixed(1) + 'x' : '—'}</td>
        </tr>
      `;
    });

    // Physical Silver
    (member.portfolio.silver || []).forEach(item => {
      const invested = (item.weightGrams || 0) * (item.buyPricePerGram || 0);
      const current = (item.weightGrams || 0) * (item.pricePerGram || 0);
      const hasInvested = (item.buyPricePerGram || 0) > 0;
      const profit = hasInvested ? current - invested : 0;
      const itemZakat = isAboveNisab ? current * ZAKAT_RATE : 0;
      const ratio = (itemZakat > 0 && hasInvested) ? (profit / itemZakat) : 0;
      if (hasInvested) totalInvested += invested;
      totalCurrent += current;
      if (hasInvested) totalProfit += profit;
      totalZakat += itemZakat;

      const profitClass = hasInvested ? (profit >= 0 ? 'positive' : 'negative') : 'dim';
      rows += `
        <tr>
          <td><span class="analysis-type-badge silver">Silver</span></td>
          <td class="item-name">${escapeHtml(item.description || 'Physical Silver')} <small>${fmt(item.weightGrams)}g</small></td>
          <td class="num ${hasInvested ? '' : 'dim'}">${hasInvested ? fmtCurrency(invested) : '—'}</td>
          <td class="num">${fmtCurrency(current)}</td>
          <td class="num ${profitClass}">${hasInvested ? (profit >= 0 ? '+' : '') + fmtCurrency(profit) : '—'}</td>
          <td class="num">${fmtCurrency(itemZakat)}</td>
          <td class="num ${hasInvested ? 'ratio' : 'dim'}">${(itemZakat > 0 && hasInvested) ? ratio.toFixed(1) + 'x' : '—'}</td>
        </tr>
      `;
    });

    // Cash
    (member.portfolio.cash || []).forEach(item => {
      const current = item.amount || 0;
      const itemZakat = isAboveNisab ? current * ZAKAT_RATE : 0;
      totalCurrent += current;
      totalZakat += itemZakat;

      rows += `
        <tr>
          <td><span class="analysis-type-badge cash">Cash</span></td>
          <td class="item-name">${escapeHtml(item.description || 'Cash')}</td>
          <td class="num dim">—</td>
          <td class="num">${fmtCurrency(current)}</td>
          <td class="num dim">—</td>
          <td class="num">${fmtCurrency(itemZakat)}</td>
          <td class="num dim">—</td>
        </tr>
      `;
    });

    // Liabilities (negative)
    (member.portfolio.liabilities || []).forEach(item => {
      const amount = item.amount || 0;

      rows += `
        <tr class="liability-row">
          <td><span class="analysis-type-badge liability">Liability</span></td>
          <td class="item-name">${escapeHtml(item.description || 'Liability')}</td>
          <td class="num dim">—</td>
          <td class="num negative">- ${fmtCurrency(amount)}</td>
          <td class="num dim">—</td>
          <td class="num dim">—</td>
          <td class="num dim">—</td>
        </tr>
      `;
    });

    if (!rows) {
      memberSection.innerHTML = `<h3>${escapeHtml(member.name)}</h3><p class="analysis-empty">No items to analyze</p>`;
      container.appendChild(memberSection);
      return;
    }

    const totalProfitClass = totalProfit >= 0 ? 'positive' : 'negative';
    const totalRatio = totalZakat > 0 ? (totalProfit / totalZakat) : 0;

    memberSection.innerHTML = `
      <h3>${escapeHtml(member.name)}${!isAboveNisab ? ' <span class="below-nisab-tag">Below Nisab</span>' : ''}</h3>
      <div class="analysis-table-wrap">
        <table class="analysis-table">
          <thead>
            <tr>
              <th>Type</th>
              <th>Item</th>
              <th>Invested</th>
              <th>Current Value</th>
              <th>Profit / Loss</th>
              <th>Zakat (2.5%)</th>
              <th>Profit : Zakat</th>
            </tr>
          </thead>
          <tbody>
            ${rows}
          </tbody>
          <tfoot>
            <tr>
              <td colspan="2"><strong>Total</strong></td>
              <td class="num"><strong>${fmtCurrency(totalInvested)}</strong></td>
              <td class="num"><strong>${fmtCurrency(totalCurrent)}</strong></td>
              <td class="num ${totalProfitClass}"><strong>${totalProfit >= 0 ? '+' : ''}${fmtCurrency(totalProfit)}</strong></td>
              <td class="num"><strong>${fmtCurrency(totalZakat)}</strong></td>
              <td class="num ratio"><strong>${totalZakat > 0 ? totalRatio.toFixed(1) + 'x' : '—'}</strong></td>
            </tr>
          </tfoot>
        </table>
      </div>
    `;
    container.appendChild(memberSection);
  });
}

// ========================================
// Rendering - Settings Display
// ========================================
function renderSettings() {
  const member = getActiveMember();
  document.getElementById('currencySelect').value = state.settings.currency;
  document.getElementById('nisabMethod').value = state.settings.nisabMethod;

  const memberKarat = member ? (member.goldKarat || '22') : (state.settings.goldKarat || '22');
  document.getElementById('goldKarat').value = memberKarat;
  document.getElementById('goldSectionKarat').value = memberKarat;

  const karat = parseInt(memberKarat);
  const karatFactor = karat / 24;
  const goldPPG = state.metalPrices.gold.pricePerGram;
  const goldPPGKarat = goldPPG ? goldPPG * karatFactor : 0;
  const silverPPG = state.metalPrices.silver.pricePerGram;

  document.getElementById('goldKaratLabel').textContent = karat + 'K';
  document.getElementById('goldPriceDisplay').textContent = goldPPG ? `${fmtCurrency(goldPPGKarat)}` : '--';
  document.getElementById('silverPriceDisplay').textContent = silverPPG ? fmtCurrency(silverPPG) : '--';

  const nisab = getNisabThreshold();
  document.getElementById('nisabValue').textContent = nisab ? fmtCurrency(nisab) : 'Fetch prices first';

  if (state.lastUpdated) {
    document.getElementById('lastUpdated').textContent = `Last updated: ${new Date(state.lastUpdated).toLocaleString()}`;
  }
}

function renderAll() {
  renderMemberTabs();
  renderPortfolio();
  renderZakatSummary();
  renderAnalysis();
  renderSettings();
}

// ========================================
// Actions - Price Updates
// ========================================
async function updateAllPrices() {
  const btn = document.getElementById('btnUpdateAllPrices');
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span> Updating...';

  try {
    // 1. Fetch metal spot prices
    showToast('Fetching gold & silver spot prices...', 'info');
    const metals = await fetchMetalPrices();
    state.metalPrices.gold = metals.gold;
    state.metalPrices.silver = metals.silver;

    // Apply metal prices to physical holdings for all members
    // Convert USD to selected currency if needed
    state.members.forEach(member => {
      const memberKarat = parseInt(member.goldKarat || '22');
      const karatFactor = memberKarat / 24;
      (member.portfolio.gold || []).forEach(item => {
        if (!item.manualPrice) {
          item.purity = karatFactor * 100;
          item.pricePerGram = metals.gold.pricePerGram * karatFactor;
        }
      });
      (member.portfolio.silver || []).forEach(item => {
        if (!item.manualPrice) {
          item.pricePerGram = metals.silver.pricePerGram * ((item.purity || 99.9) / 100);
        }
      });
    });

    // 2. Collect all unique ETF, crypto & stock symbols
    const symbols = new Set();
    state.members.forEach(member => {
      (member.portfolio.etfs || []).forEach(i => symbols.add(i.symbol));
      (member.portfolio.crypto || []).forEach(i => symbols.add(i.symbol));
      (member.portfolio.stocks || []).forEach(i => symbols.add(i.symbol));
    });

    if (symbols.size > 0) {
      showToast(`Fetching prices for ${symbols.size} symbol(s)...`, 'info');
      const data = await fetchMultiplePrices([...symbols]);
      // Apply prices to all members
      state.members.forEach(member => {
        ['etfs', 'crypto', 'stocks'].forEach(type => {
          (member.portfolio[type] || []).forEach(item => {
            const priceData = data.prices[item.symbol.toUpperCase()];
            if (priceData && !priceData.error) {
              item.currentPrice = priceData.price;
            }
          });
        });
      });
    }

    state.lastUpdated = new Date().toISOString();
    saveState();
    renderAll();
    showToast('All prices updated successfully!', 'success');
  } catch (err) {
    console.error('Price update error:', err);
    showToast('Error updating prices: ' + err.message, 'error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<span class="btn-icon">&#8635;</span> Update All Prices';
  }
}

async function updateSingleETFPrice(type, idx) {
  const member = getActiveMember();
  if (!member) return;
  const item = member.portfolio[type][idx];
  if (!item) return;

  try {
    showToast(`Fetching price for ${item.symbol}...`, 'info');
    const data = await fetchPrice(item.symbol);
    item.currentPrice = data.price;
    saveState();
    renderAll();
    showToast(`${item.symbol}: ${fmtCurrency(data.price)}`, 'success');
  } catch (err) {
    showToast(`Failed to fetch ${item.symbol}`, 'error');
  }
}

async function refreshGoldSpotPrice() {
  const btn = document.getElementById('btnRefreshGoldPrice');
  btn.disabled = true;
  btn.textContent = '⏳';

  try {
    showToast('Fetching gold spot price...', 'info');
    const metals = await fetchMetalPrices();
    state.metalPrices.gold = metals.gold;
    state.metalPrices.silver = metals.silver;

    // Apply to all members' physical gold items that don't have manual price
    state.members.forEach(member => {
      const memberKarat = parseInt(member.goldKarat || '22');
      const karatFactor = memberKarat / 24;
      (member.portfolio.gold || []).forEach(item => {
        if (!item.manualPrice) {
          item.purity = karatFactor * 100;
          item.pricePerGram = metals.gold.pricePerGram * karatFactor;
        }
      });
    });

    saveState();
    renderAll();
    showToast('Gold spot price updated!', 'success');
  } catch (err) {
    showToast('Failed to refresh gold price: ' + err.message, 'error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = '&#8635;';
  }
}

// ========================================
// Item CRUD
// ========================================
function deleteItem(type, idx) {
  const member = getActiveMember();
  if (!member) return;
  if (!confirm('Delete this item?')) return;
  member.portfolio[type].splice(idx, 1);
  saveState();
  renderAll();
  showToast('Item deleted', 'info');
}

// ========================================
// Modal Management
// ========================================
function openModal() {
  document.getElementById('modalOverlay').classList.add('active');
}

function closeModal() {
  document.getElementById('modalOverlay').classList.remove('active');
}

function openMemberModal(editId = null) {
  const overlay = document.getElementById('memberModalOverlay');
  const title = document.getElementById('memberModalTitle');
  const input = document.getElementById('memberName');

  if (editId) {
    const member = state.members.find(m => m.id === editId);
    title.textContent = 'Rename Member';
    input.value = member ? member.name : '';
    input.dataset.editId = editId;
  } else {
    title.textContent = 'Add Family Member';
    input.value = '';
    input.dataset.editId = '';
  }

  overlay.classList.add('active');
  setTimeout(() => input.focus(), 100);
}

function closeMemberModal() {
  document.getElementById('memberModalOverlay').classList.remove('active');
}

function saveMember() {
  const input = document.getElementById('memberName');
  const name = input.value.trim();
  if (!name) {
    showToast('Please enter a name', 'error');
    return;
  }

  const editId = input.dataset.editId;
  if (editId) {
    const member = state.members.find(m => m.id === editId);
    if (member) member.name = name;
  } else {
    const newMember = createDefaultMember(name);
    state.members.push(newMember);
    state.activeMemberId = newMember.id;
  }

  saveState();
  closeMemberModal();
  renderAll();
  showToast(editId ? 'Member renamed' : 'Member added', 'success');
}

// ========================================
// Item Modal - Dynamic Forms
// ========================================
let currentModalContext = { type: null, idx: null };

function openItemModal(type, idx = null) {
  currentModalContext = { type, idx };
  const member = getActiveMember();
  if (!member) return;

  const isEdit = idx !== null;
  const item = isEdit ? member.portfolio[type][idx] : null;
  const title = document.getElementById('modalTitle');
  const body = document.getElementById('modalBody');

  if (type === 'etfs' || type === 'crypto' || type === 'stocks') {
    const typeLabel = type === 'etfs' ? 'ETF' : type === 'crypto' ? 'Crypto' : 'Stock';
    title.textContent = isEdit ? `Edit ${typeLabel}` : `Add ${typeLabel}`;
    body.innerHTML = `
      <div class="form-group">
        <label for="isinSearch">Search by ISIN or Name</label>
        <div class="search-input-wrapper">
          <input type="text" id="isinSearch" placeholder="e.g., IE0009JOT9U1 or Gold ETF" />
          <button class="btn btn-small btn-primary" id="btnIsinSearch" type="button">Search</button>
        </div>
        <div class="search-results" id="searchResults"></div>
      </div>
      <div class="form-group">
        <label for="itemSymbol">Symbol</label>
        <input type="text" id="itemSymbol" placeholder="Ticker symbol (auto-filled from search)" value="${item ? escapeHtml(item.symbol) : ''}" />
        <span class="resolved-name" id="resolvedName">${item ? escapeHtml(item.name || '') : ''}</span>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label for="itemUnits">Units</label>
          <input type="number" id="itemUnits" step="0.001" placeholder="0" value="${item ? item.units : ''}" />
        </div>
        <div class="form-group">
          <label for="itemAvgPrice">Avg Buy Price</label>
          <input type="number" id="itemAvgPrice" step="0.01" placeholder="0.00" value="${item ? item.avgPrice : ''}" />
        </div>
      </div>
      <div class="form-group">
        <label for="itemCurrentPrice">Current Price (leave blank to fetch)</label>
        <input type="number" id="itemCurrentPrice" step="0.01" placeholder="Auto-fetch" value="${item && item.currentPrice ? item.currentPrice : ''}" />
      </div>
    `;
    // Wire up ISIN search
    setTimeout(() => {
      const searchBtn = document.getElementById('btnIsinSearch');
      const searchInput = document.getElementById('isinSearch');
      if (searchBtn) {
        searchBtn.addEventListener('click', () => performSymbolSearch());
      }
      if (searchInput) {
        searchInput.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') { e.preventDefault(); performSymbolSearch(); }
        });
      }
    }, 50);
  } else if (type === 'gold') {
    title.textContent = isEdit ? 'Edit Physical Gold' : 'Add Physical Gold';
    body.innerHTML = `
      <div class="form-group">
        <label for="itemDesc">Description</label>
        <input type="text" id="itemDesc" placeholder="e.g., Chain, Coins, Ring, etc." value="${item ? escapeHtml(item.description || '') : ''}" />
      </div>
      <div class="form-group">
        <label for="itemWeight">Weight (grams)</label>
        <input type="number" id="itemWeight" step="0.01" placeholder="0" value="${item ? item.weightGrams : ''}" />
      </div>
      <div class="form-group">
        <label for="itemBuyPrice">Buy Price per gram</label>
        <input type="number" id="itemBuyPrice" step="0.01" placeholder="0.00" value="${item && item.buyPricePerGram ? item.buyPricePerGram : ''}" />
      </div>
      <div class="form-group">
        <label for="itemPricePerGram">Current Price per gram (leave blank to use spot price adjusted for karat)</label>
        <input type="number" id="itemPricePerGram" step="0.01" placeholder="Auto from spot price" value="${item && item.manualPrice ? item.pricePerGram : ''}" />
      </div>
    `;
  } else if (type === 'silver') {
    title.textContent = isEdit ? 'Edit Physical Silver' : 'Add Physical Silver';
    body.innerHTML = `
      <div class="form-group">
        <label for="itemDesc">Description</label>
        <input type="text" id="itemDesc" placeholder="e.g., Coins, Bars, etc." value="${item ? escapeHtml(item.description || '') : ''}" />
      </div>
      <div class="form-row">
        <div class="form-group">
          <label for="itemWeight">Weight (grams)</label>
          <input type="number" id="itemWeight" step="0.01" placeholder="0" value="${item ? item.weightGrams : ''}" />
        </div>
        <div class="form-group">
          <label for="itemPurity">Purity (%)</label>
          <input type="number" id="itemPurity" step="0.1" min="1" max="100" placeholder="99.9" value="${item ? (item.purity || 99.9) : '99.9'}" />
        </div>
      </div>
      <div class="form-group">
        <label for="itemBuyPrice">Buy Price per gram</label>
        <input type="number" id="itemBuyPrice" step="0.01" placeholder="0.00" value="${item && item.buyPricePerGram ? item.buyPricePerGram : ''}" />
      </div>
      <div class="form-group">
        <label for="itemPricePerGram">Current Price per gram (leave blank to use spot price)</label>
        <input type="number" id="itemPricePerGram" step="0.01" placeholder="Auto from spot price" value="${item && item.manualPrice ? item.pricePerGram : ''}" />
      </div>
    `;
  } else if (type === 'cash' || type === 'liabilities') {
    title.textContent = isEdit ? `Edit ${capitalize(type)}` : `Add ${type === 'cash' ? 'Cash / Other Asset' : 'Liability'}`;
    body.innerHTML = `
      <div class="form-group">
        <label for="itemDesc">Description</label>
        <input type="text" id="itemDesc" placeholder="e.g., Bank Balance, Loan, etc." value="${item ? escapeHtml(item.description || '') : ''}" />
      </div>
      <div class="form-group">
        <label for="itemAmount">Amount (${currencySymbol()})</label>
        <input type="number" id="itemAmount" step="0.01" placeholder="0.00" value="${item ? item.amount : ''}" />
      </div>
    `;
  }

  openModal();
  // Focus first input
  setTimeout(() => {
    const firstInput = body.querySelector('input');
    if (firstInput) firstInput.focus();
  }, 100);
}

function saveItem() {
  const { type, idx } = currentModalContext;
  const member = getActiveMember();
  if (!member) return;

  let item;

  if (type === 'etfs' || type === 'crypto' || type === 'stocks') {
    const symbol = document.getElementById('itemSymbol').value.trim().toUpperCase();
    const units = parseFloat(document.getElementById('itemUnits').value) || 0;
    const avgPrice = parseFloat(document.getElementById('itemAvgPrice').value) || 0;
    const currentPrice = parseFloat(document.getElementById('itemCurrentPrice').value) || 0;

    if (!symbol) {
      showToast('Symbol is required', 'error');
      return;
    }

    const resolvedName = document.getElementById('resolvedName')?.textContent || '';
    item = { symbol, units, avgPrice, currentPrice, name: resolvedName };
  } else if (type === 'gold') {
    const description = document.getElementById('itemDesc').value.trim();
    const weightGrams = parseFloat(document.getElementById('itemWeight').value) || 0;
    const member = getActiveMember();
    const karat = parseInt(member.goldKarat || '22');
    const purity = (karat / 24) * 100;
    const buyPricePerGram = parseFloat(document.getElementById('itemBuyPrice').value) || 0;
    const manualPriceVal = document.getElementById('itemPricePerGram').value.trim();
    const manualPrice = manualPriceVal !== '';
    const spotPrice = state.metalPrices.gold.pricePerGram || 0;
    const pricePerGram = manualPrice ? parseFloat(manualPriceVal) : spotPrice * (purity / 100);

    if (weightGrams <= 0) {
      showToast('Weight is required', 'error');
      return;
    }

    item = { description, weightGrams, purity, buyPricePerGram, pricePerGram, manualPrice };
  } else if (type === 'silver') {
    const description = document.getElementById('itemDesc').value.trim();
    const weightGrams = parseFloat(document.getElementById('itemWeight').value) || 0;
    const purity = parseFloat(document.getElementById('itemPurity').value) || 99.9;
    const buyPricePerGram = parseFloat(document.getElementById('itemBuyPrice').value) || 0;
    const manualPriceVal = document.getElementById('itemPricePerGram').value.trim();
    const manualPrice = manualPriceVal !== '';
    const spotPrice = state.metalPrices.silver.pricePerGram || 0;
    const pricePerGram = manualPrice ? parseFloat(manualPriceVal) : spotPrice * (purity / 100);

    if (weightGrams <= 0) {
      showToast('Weight is required', 'error');
      return;
    }

    item = { description, weightGrams, purity, buyPricePerGram, pricePerGram, manualPrice };
  } else if (type === 'cash' || type === 'liabilities') {
    const description = document.getElementById('itemDesc').value.trim();
    const amount = parseFloat(document.getElementById('itemAmount').value) || 0;

    if (!description) {
      showToast('Description is required', 'error');
      return;
    }

    item = { description, amount };
  }

  if (idx !== null) {
    member.portfolio[type][idx] = item;
  } else {
    member.portfolio[type].push(item);
  }

  saveState();
  closeModal();
  renderAll();
  showToast(idx !== null ? 'Item updated' : 'Item added', 'success');
}

// ========================================
// Helpers
// ========================================
// ========================================
// ISIN / Symbol Search
// ========================================
async function performSymbolSearch() {
  const input = document.getElementById('isinSearch');
  const resultsDiv = document.getElementById('searchResults');
  const query = input.value.trim();
  if (!query) { showToast('Enter an ISIN or search term', 'error'); return; }

  resultsDiv.innerHTML = '<div class="search-loading"><span class="spinner"></span> Searching...</div>';

  try {
    const res = await fetch(`/api/search/${encodeURIComponent(query)}`);
    const data = await res.json();
    const results = data.results || [];

    if (results.length === 0) {
      resultsDiv.innerHTML = '<div class="search-empty">No results found</div>';
      return;
    }

    resultsDiv.innerHTML = '';
    results.forEach(r => {
      const item = document.createElement('div');
      item.className = 'search-result-item';
      item.innerHTML = `
        <span class="sr-symbol">${escapeHtml(r.symbol)}</span>
        <span class="sr-name">${escapeHtml(r.name)}</span>
        <span class="sr-meta">${escapeHtml(r.type || '')} ${escapeHtml(r.exchange || '')}</span>
      `;
      item.addEventListener('click', () => {
        document.getElementById('itemSymbol').value = r.symbol;
        document.getElementById('resolvedName').textContent = r.name;
        resultsDiv.innerHTML = '';
        showToast(`Selected: ${r.symbol} — ${r.name}`, 'success');
      });
      resultsDiv.appendChild(item);
    });
  } catch (err) {
    resultsDiv.innerHTML = '<div class="search-empty">Search failed</div>';
    showToast('Search error: ' + err.message, 'error');
  }
}

function capitalize(str) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.appendChild(document.createTextNode(str));
  return div.innerHTML;
}

// ========================================
// Export / Import
// ========================================

// ---- Shared helpers ----
function buildExportRows(member) {
  const w = calculateMemberWealth(member);
  const nisab = getNisabThreshold();
  const isAboveNisab = w.netWealth >= nisab;
  const cur = state.settings.currency;

  const sections = [];

  // ETFs
  if ((member.portfolio.etfs || []).length) {
    sections.push({ title: 'ETFs', rows: member.portfolio.etfs.map(i => ({
      Symbol: i.symbol, Name: i.name || '', Units: i.units || 0,
      'Avg Price': i.avgPrice || 0, 'Current Price': i.currentPrice || 0,
      Value: (i.units || 0) * (i.currentPrice || 0),
      Profit: i.avgPrice ? ((i.currentPrice || 0) - i.avgPrice) * (i.units || 0) : '',
      Currency: cur
    })) });
  }

  // Stocks
  if ((member.portfolio.stocks || []).length) {
    sections.push({ title: 'Stocks', rows: member.portfolio.stocks.map(i => ({
      Symbol: i.symbol, Name: i.name || '', Units: i.units || 0,
      'Avg Price': i.avgPrice || 0, 'Current Price': i.currentPrice || 0,
      Value: (i.units || 0) * (i.currentPrice || 0),
      Profit: i.avgPrice ? ((i.currentPrice || 0) - i.avgPrice) * (i.units || 0) : '',
      Currency: cur
    })) });
  }

  // Crypto
  if ((member.portfolio.crypto || []).length) {
    sections.push({ title: 'Crypto', rows: member.portfolio.crypto.map(i => ({
      Symbol: i.symbol, Name: i.name || '', Units: i.units || 0,
      'Avg Price': i.avgPrice || 0, 'Current Price': i.currentPrice || 0,
      Value: (i.units || 0) * (i.currentPrice || 0),
      Profit: i.avgPrice ? ((i.currentPrice || 0) - i.avgPrice) * (i.units || 0) : '',
      Currency: cur
    })) });
  }

  // Physical Gold
  if ((member.portfolio.gold || []).length) {
    const karat = parseInt(member.goldKarat || '22');
    sections.push({ title: 'Physical Gold', rows: member.portfolio.gold.map(i => ({
      Description: i.description || '', 'Weight (g)': i.weightGrams || 0,
      Karat: karat + 'K', 'Buy Price/g': i.buyPricePerGram || '',
      'Current Price/g': i.pricePerGram || 0,
      Value: (i.weightGrams || 0) * (i.pricePerGram || 0),
      Profit: i.buyPricePerGram ? ((i.pricePerGram || 0) - i.buyPricePerGram) * (i.weightGrams || 0) : '',
      Currency: cur
    })) });
  }

  // Physical Silver
  if ((member.portfolio.silver || []).length) {
    sections.push({ title: 'Physical Silver', rows: member.portfolio.silver.map(i => ({
      Description: i.description || '', 'Weight (g)': i.weightGrams || 0,
      'Purity (%)': i.purity || 99.9, 'Buy Price/g': i.buyPricePerGram || '',
      'Current Price/g': i.pricePerGram || 0,
      Value: (i.weightGrams || 0) * (i.pricePerGram || 0),
      Profit: i.buyPricePerGram ? ((i.pricePerGram || 0) - i.buyPricePerGram) * (i.weightGrams || 0) : '',
      Currency: cur
    })) });
  }

  // Cash
  if ((member.portfolio.cash || []).length) {
    sections.push({ title: 'Cash & Other', rows: member.portfolio.cash.map(i => ({
      Description: i.description || '', Amount: i.amount || 0, Currency: cur
    })) });
  }

  // Liabilities
  if ((member.portfolio.liabilities || []).length) {
    sections.push({ title: 'Liabilities', rows: member.portfolio.liabilities.map(i => ({
      Description: i.description || '', Amount: i.amount || 0, Currency: cur
    })) });
  }

  // Summary
  const zakatDue = isAboveNisab ? w.netWealth * ZAKAT_RATE : 0;
  sections.push({ title: 'Summary', rows: [
    { Category: 'ETFs', Value: w.etfsValue, Currency: cur },
    { Category: 'Crypto', Value: w.cryptoValue, Currency: cur },
    { Category: 'Stocks', Value: w.stocksValue, Currency: cur },
    { Category: 'Physical Gold', Value: w.goldValue, Currency: cur },
    { Category: 'Physical Silver', Value: w.silverValue, Currency: cur },
    { Category: 'Cash & Other', Value: w.cashValue, Currency: cur },
    { Category: 'Total Assets', Value: w.totalAssets, Currency: cur },
    { Category: 'Liabilities', Value: w.liabilitiesValue, Currency: cur },
    { Category: 'Net Wealth', Value: w.netWealth, Currency: cur },
    { Category: 'Nisab Threshold', Value: getNisabThreshold(), Currency: cur },
    { Category: 'Above Nisab?', Value: isAboveNisab ? 'Yes' : 'No', Currency: '' },
    { Category: 'Zakat Due (2.5%)', Value: zakatDue, Currency: cur }
  ]});

  return sections;
}

// ---- Excel Export ----
function exportExcel() {
  try {
    const wb = XLSX.utils.book_new();
    const cur = state.settings.currency;
    const dateStr = new Date().toLocaleDateString('en-GB').replace(/\//g, '-');

    // Per-member sheets
    state.members.forEach(member => {
      const sheetName = member.name.slice(0, 28).replace(/[:\\/?*\[\]]/g, '_');
      const wsData = [];

      // Header block
      wsData.push([`Zakat Calculator - ${member.name}`]);
      wsData.push([`Exported: ${new Date().toLocaleString()}`]);
      wsData.push([`Currency: ${cur}`]);
      wsData.push([]);

      const sections = buildExportRows(member);
      sections.forEach(section => {
        wsData.push([`=== ${section.title} ===`]);
        if (!section.rows.length) {
          wsData.push(['(none)']);
        } else {
          wsData.push(Object.keys(section.rows[0]));
          section.rows.forEach(row => wsData.push(Object.values(row)));
        }
        wsData.push([]);
      });

      const ws = XLSX.utils.aoa_to_sheet(wsData);
      // Auto column widths
      const colWidths = wsData.reduce((acc, row) => {
        (row || []).forEach((cell, i) => {
          const len = String(cell ?? '').length;
          if (!acc[i] || acc[i] < len) acc[i] = len;
        });
        return acc;
      }, []);
      ws['!cols'] = colWidths.map(w => ({ wch: Math.min(Math.max(w + 2, 8), 50) }));

      XLSX.utils.book_append_sheet(wb, ws, sheetName);
    });

    // Combined summary sheet
    if (state.members.length > 1) {
      const summaryData = [];
      summaryData.push(['Combined Zakat Summary']);
      summaryData.push([`Exported: ${new Date().toLocaleString()}`]);
      summaryData.push([`Currency: ${cur}`]);
      summaryData.push([]);
      summaryData.push(['Member', 'Net Wealth', 'Zakat Due', 'Above Nisab?', 'Currency']);
      const nisab = getNisabThreshold();
      let totalWealth = 0, totalZakat = 0;
      state.members.forEach(member => {
        const w = calculateMemberWealth(member);
        const above = w.netWealth >= nisab;
        const zakat = above ? w.netWealth * ZAKAT_RATE : 0;
        totalWealth += w.netWealth;
        totalZakat += zakat;
        summaryData.push([member.name, w.netWealth, zakat, above ? 'Yes' : 'No', cur]);
      });
      summaryData.push([]);
      summaryData.push(['TOTAL', totalWealth, totalZakat, '', cur]);

      const ws = XLSX.utils.aoa_to_sheet(summaryData);
      ws['!cols'] = [{ wch: 20 }, { wch: 16 }, { wch: 14 }, { wch: 14 }, { wch: 10 }];
      XLSX.utils.book_append_sheet(wb, ws, 'Combined Summary');
    }

    XLSX.writeFile(wb, `Zakat_Portfolio_${dateStr}.xlsx`);
    showToast('Excel export downloaded successfully!', 'success');
  } catch (err) {
    console.error('Excel export error:', err);
    showToast('Excel export failed: ' + err.message, 'error');
  }
}

// ---- PDF Export ----
function exportPDF() {
  try {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
    const cur = state.settings.currency;
    const pageW = doc.internal.pageSize.getWidth();
    const nisab = getNisabThreshold();

    const PRIMARY = [99, 102, 241];
    const DARK = [15, 15, 20];
    const LIGHT_BG = [245, 245, 250];

    doc.setFillColor(...DARK);
    doc.rect(0, 0, pageW, 22, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    doc.text('Zakat Calculator — Portfolio Report', 14, 13);
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.text(`Generated: ${new Date().toLocaleString()}   |   Currency: ${cur}`, pageW - 14, 13, { align: 'right' });

    let y = 30;

    const checkPage = (needed = 20) => {
      if (y + needed > doc.internal.pageSize.getHeight() - 14) {
        doc.addPage();
        y = 14;
      }
    };

    const sectionHeader = (title) => {
      checkPage(14);
      doc.setFillColor(...PRIMARY);
      doc.roundedRect(12, y, pageW - 24, 8, 1.5, 1.5, 'F');
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(10);
      doc.setFont('helvetica', 'bold');
      doc.text(title, 16, y + 5.5);
      y += 12;
    };

    const memberHeader = (name) => {
      checkPage(16);
      doc.setFillColor(...LIGHT_BG);
      doc.rect(0, y - 2, pageW, 12, 'F');
      doc.setTextColor(30, 30, 40);
      doc.setFontSize(13);
      doc.setFont('helvetica', 'bold');
      doc.text(name, 14, y + 6);
      y += 16;
    };

    const numFmt = (v) => {
      if (v === '' || v === undefined || v === null) return '—';
      const n = Number(v);
      if (isNaN(n)) return String(v);
      return n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    };

    state.members.forEach((member, mi) => {
      if (mi > 0) { doc.addPage(); y = 14; }
      memberHeader(member.name);

      const sections = buildExportRows(member);
      sections.forEach(section => {
        if (!section.rows.length) return;
        sectionHeader(section.title);

        const headers = Object.keys(section.rows[0]);
        const rows = section.rows.map(r =>
          Object.values(r).map((v, i) => {
            if (typeof v === 'number') return numFmt(v);
            return String(v ?? '—');
          })
        );

        doc.autoTable({
          startY: y,
          head: [headers],
          body: rows,
          margin: { left: 12, right: 12 },
          headStyles: { fillColor: [55, 55, 75], textColor: 255, fontStyle: 'bold', fontSize: 8 },
          bodyStyles: { fontSize: 8, textColor: [30, 30, 40] },
          alternateRowStyles: { fillColor: [248, 248, 252] },
          styles: { cellPadding: 2, overflow: 'linebreak' },
          didDrawPage: () => { y = doc.lastAutoTable.finalY + 6; }
        });
        y = doc.lastAutoTable.finalY + 8;
        checkPage(8);
      });
    });

    // Final combined summary page
    if (state.members.length > 1) {
      doc.addPage();
      y = 14;
      sectionHeader('Combined Family Zakat Summary');

      let totalWealth = 0, totalZakat = 0;
      const summaryRows = state.members.map(member => {
        const w = calculateMemberWealth(member);
        const above = w.netWealth >= nisab;
        const zakat = above ? w.netWealth * ZAKAT_RATE : 0;
        totalWealth += w.netWealth;
        totalZakat += zakat;
        return [member.name, numFmt(w.totalAssets), numFmt(w.liabilitiesValue), numFmt(w.netWealth), above ? 'Yes' : 'No', numFmt(zakat)];
      });
      summaryRows.push(['TOTAL', '', '', numFmt(totalWealth), '', numFmt(totalZakat)]);

      doc.autoTable({
        startY: y,
        head: [['Member', 'Total Assets', 'Liabilities', 'Net Wealth', 'Above Nisab?', 'Zakat Due']],
        body: summaryRows,
        margin: { left: 12, right: 12 },
        headStyles: { fillColor: [55, 55, 75], textColor: 255, fontStyle: 'bold', fontSize: 9 },
        bodyStyles: { fontSize: 9 },
        alternateRowStyles: { fillColor: [248, 248, 252] },
        didParseCell: (data) => {
          if (data.row.index === summaryRows.length - 1) {
            data.cell.styles.fontStyle = 'bold';
            data.cell.styles.fillColor = [230, 230, 245];
          }
        }
      });
    }

    const dateStr = new Date().toLocaleDateString('en-GB').replace(/\//g, '-');
    doc.save(`Zakat_Portfolio_${dateStr}.pdf`);
    showToast('PDF export downloaded successfully!', 'success');
  } catch (err) {
    console.error('PDF export error:', err);
    showToast('PDF export failed: ' + err.message, 'error');
  }
}

// ---- Excel Import ----
function importExcel(file) {
  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const data = new Uint8Array(e.target.result);
      const wb = XLSX.read(data, { type: 'array' });

      // Parse each member sheet (skip 'Combined Summary')
      const imported = [];
      wb.SheetNames.forEach(name => {
        if (name.trim().toLowerCase() === 'combined summary') return;

        const ws = wb.Sheets[name];
        const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });

        const member = createDefaultMember(name);
        let currentSection = null;
        let headers = [];

        rows.forEach(row => {
          const first = String(row[0] || '').trim();

          // Section header marker
          if (first.startsWith('===') && first.endsWith('===')) {
            currentSection = first.replace(/===/g, '').trim().toLowerCase();
            headers = [];
            return;
          }

          // Skip meta/empty rows
          if (!currentSection || !first || first.startsWith('Zakat') || first.startsWith('Exported') || first.startsWith('Currency')) return;

          // Header row: detect by content (not numeric)
          if (!headers.length) {
            const nonEmpty = row.filter(c => String(c).trim());
            if (nonEmpty.length >= 2 && isNaN(Number(nonEmpty[1]))) {
              headers = row.map(c => String(c).trim());
              return;
            }
          }

          if (!headers.length) return;

          // Map row to object
          const obj = {};
          headers.forEach((h, i) => { if (h) obj[h] = row[i]; });

          const num = (k) => parseFloat(obj[k]) || 0;
          const str = (k) => String(obj[k] || '').trim();

          if (currentSection === 'etfs' || currentSection === 'stocks' || currentSection === 'crypto') {
            const sym = str('Symbol');
            if (!sym) return;
            const item = { symbol: sym, name: str('Name'), units: num('Units'), avgPrice: num('Avg Price'), currentPrice: num('Current Price') };
            if (currentSection === 'etfs') member.portfolio.etfs.push(item);
            else if (currentSection === 'stocks') member.portfolio.stocks.push(item);
            else member.portfolio.crypto.push(item);

          } else if (currentSection === 'physical gold') {
            const w = num('Weight (g)');
            if (!w) return;
            const karatStr = str('Karat');
            const karat = parseInt(karatStr) || 22;
            member.goldKarat = String(karat);
            member.portfolio.gold.push({
              description: str('Description'),
              weightGrams: w,
              purity: (karat / 24) * 100,
              buyPricePerGram: num('Buy Price/g') || 0,
              pricePerGram: num('Current Price/g'),
              manualPrice: num('Current Price/g') > 0
            });

          } else if (currentSection === 'physical silver') {
            const w = num('Weight (g)');
            if (!w) return;
            member.portfolio.silver.push({
              description: str('Description'),
              weightGrams: w,
              purity: num('Purity (%)') || 99.9,
              buyPricePerGram: num('Buy Price/g') || 0,
              pricePerGram: num('Current Price/g'),
              manualPrice: num('Current Price/g') > 0
            });

          } else if (currentSection === 'cash & other') {
            const amt = num('Amount');
            if (!amt) return;
            member.portfolio.cash.push({ description: str('Description'), amount: amt });

          } else if (currentSection === 'liabilities') {
            const amt = num('Amount');
            if (!amt) return;
            member.portfolio.liabilities.push({ description: str('Description'), amount: amt });
          }
        });

        imported.push(member);
      });

      if (!imported.length) {
        showToast('No member sheets found in the file.', 'error');
        return;
      }

      const msg = `Import "${file.name}"?\n\nThis will REPLACE all current members with ${imported.length} member(s) from the file.\n\nClick OK to confirm.`;
      if (!confirm(msg)) return;

      state.members = imported;
      state.activeMemberId = imported[0].id;
      saveState();
      renderAll();
      showToast(`Imported ${imported.length} member(s) successfully!`, 'success');

    } catch (err) {
      console.error('Import error:', err);
      showToast('Import failed: ' + err.message, 'error');
    }
  };
  reader.readAsArrayBuffer(file);
}

// ========================================
// Event Listeners
// ========================================
function initEventListeners() {
  // Update all prices
  document.getElementById('btnUpdateAllPrices').addEventListener('click', updateAllPrices);

  // Export / Import
  document.getElementById('btnExportExcel').addEventListener('click', exportExcel);
  document.getElementById('btnExportPDF').addEventListener('click', exportPDF);
  document.getElementById('importFileInput').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) {
      importExcel(file);
      e.target.value = ''; // reset so same file can be re-imported
    }
  });

  // Settings changes
  document.getElementById('currencySelect').addEventListener('change', async (e) => {
    const newCurrency = e.target.value;
    const oldCurrency = state.settings.currency;
    if (newCurrency === oldCurrency) return;

    try {
      showToast(`Converting values from ${oldCurrency} to ${newCurrency}...`, 'info');
      const rate = await fetchExchangeRate(oldCurrency, newCurrency);

      // Convert manually entered values for all members
      state.members.forEach(member => {
        // Cash amounts
        (member.portfolio.cash || []).forEach(item => {
          item.amount = item.amount * rate;
        });
        // Liabilities
        (member.portfolio.liabilities || []).forEach(item => {
          item.amount = item.amount * rate;
        });
        // Physical gold: buy prices and manual current prices
        (member.portfolio.gold || []).forEach(item => {
          if (item.buyPricePerGram) item.buyPricePerGram = item.buyPricePerGram * rate;
          if (item.manualPrice) item.pricePerGram = item.pricePerGram * rate;
        });
        // Physical silver: buy prices and manual current prices
        (member.portfolio.silver || []).forEach(item => {
          if (item.buyPricePerGram) item.buyPricePerGram = item.buyPricePerGram * rate;
          if (item.manualPrice) item.pricePerGram = item.pricePerGram * rate;
        });
        // ETFs/Stocks/Crypto: convert avg purchase prices
        ['etfs', 'stocks', 'crypto'].forEach(type => {
          (member.portfolio[type] || []).forEach(item => {
            if (item.avgPrice) item.avgPrice = item.avgPrice * rate;
          });
        });
      });

      state.settings.currency = newCurrency;
      saveState();

      // Re-fetch live prices in the new currency
      await updateAllPrices();
      showToast(`Converted to ${newCurrency} successfully!`, 'success');
    } catch (err) {
      console.error('Currency conversion error:', err);
      showToast('Currency conversion failed: ' + err.message, 'error');
      // Revert the dropdown
      e.target.value = oldCurrency;
    }
  });

  document.getElementById('nisabMethod').addEventListener('change', (e) => {
    state.settings.nisabMethod = e.target.value;
    saveState();
    renderAll();
  });

  document.getElementById('goldKarat').addEventListener('change', (e) => {
    const member = getActiveMember();
    if (member) member.goldKarat = e.target.value;
    saveState();
    renderAll();
  });

  document.getElementById('goldSectionKarat').addEventListener('change', (e) => {
    const member = getActiveMember();
    if (member) member.goldKarat = e.target.value;
    saveState();
    renderAll();
  });

  // Refresh gold spot price
  document.getElementById('btnRefreshGoldPrice').addEventListener('click', refreshGoldSpotPrice);

  // Add member
  document.getElementById('btnAddMember').addEventListener('click', () => openMemberModal());

  // Member modal
  document.getElementById('memberModalClose').addEventListener('click', closeMemberModal);
  document.getElementById('memberModalCancel').addEventListener('click', closeMemberModal);
  document.getElementById('memberModalSave').addEventListener('click', saveMember);
  document.getElementById('memberModalOverlay').addEventListener('click', (e) => {
    if (e.target === e.currentTarget) closeMemberModal();
  });
  document.getElementById('memberName').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') saveMember();
  });

  // Item modal
  document.getElementById('modalClose').addEventListener('click', closeModal);
  document.getElementById('modalCancel').addEventListener('click', closeModal);
  document.getElementById('modalSave').addEventListener('click', saveItem);
  document.getElementById('modalOverlay').addEventListener('click', (e) => {
    if (e.target === e.currentTarget) closeModal();
  });

  // Listen for Enter in modal
  document.getElementById('modalBody').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') saveItem();
  });

  // Add buttons for each asset type
  document.querySelectorAll('.btn-add').forEach(btn => {
    btn.addEventListener('click', () => {
      const type = btn.dataset.type;
      openItemModal(type);
    });
  });

  // Keyboard shortcut: Escape to close modals
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeModal();
      closeMemberModal();
    }
  });
}

// ========================================
// Initialize
// ========================================
function init() {
  loadState();
  initEventListeners();
  renderAll();
  console.log('Zakat Calculator initialized');
}

document.addEventListener('DOMContentLoaded', init);
