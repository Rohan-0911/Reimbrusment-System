/* ============================================================
   Reimbursement System :  Core App (State, Router, API Client, Utils)
   ============================================================ */

'use strict';

// ── App State ────────────────────────────────────────────────
const AppState = {
  user: null,
  company: null,
  token: null,
  currentPage: null,
  sidebarCollapsed: false,

  load() {
    try {
      this.token = localStorage.getItem('riq_token');
      this.user = JSON.parse(localStorage.getItem('riq_user') || 'null');
      this.company = JSON.parse(localStorage.getItem('riq_company') || 'null');
      this.sidebarCollapsed = localStorage.getItem('riq_sidebar_collapsed') === 'true';
    } catch { this.clear(); }
  },

  save() {
    if (this.token) localStorage.setItem('riq_token', this.token);
    if (this.user) localStorage.setItem('riq_user', JSON.stringify(this.user));
    if (this.company) localStorage.setItem('riq_company', JSON.stringify(this.company));
    localStorage.setItem('riq_sidebar_collapsed', this.sidebarCollapsed);
  },

  clear() {
    localStorage.removeItem('riq_token');
    localStorage.removeItem('riq_user');
    localStorage.removeItem('riq_company');
    this.token = null;
    this.user = null;
    this.company = null;
  },

  isAuthenticated() { return !!(this.token && this.user); },
  isAdmin() { return this.user?.role === 'admin'; },
  isEmployee() { return this.user?.role === 'employee'; }
};

// ── API Client ───────────────────────────────────────────────
const API_BASE = 'http://localhost:5001/api';

const API = {
  async request(method, endpoint, data = null, isFormData = false) {
    const url = `${API_BASE}${endpoint}`;
    const headers = {};

    if (AppState.token) {
      headers['Authorization'] = `Bearer ${AppState.token}`;
    }

    if (data && !isFormData) {
      headers['Content-Type'] = 'application/json';
    }

    const options = {
      method,
      headers,
      body: data ? (isFormData ? data : JSON.stringify(data)) : undefined
    };

    try {
      const res = await fetch(url, options);
      const json = await res.json();

      if (!res.ok) {
        const errorMsg = json.detail || json.error || `Request failed: ${res.status}`;
        throw new APIError(errorMsg, res.status);
      }

      return json;
    } catch (err) {
      if (err instanceof APIError) throw err;
      // Network error :  backend not connected yet (expected in frontend-only mode)
      throw new APIError('Cannot connect to server. Backend not available yet.', 0);
    }
  },

  get(endpoint) { return this.request('GET', endpoint); },
  post(endpoint, data, isFormData) { return this.request('POST', endpoint, data, isFormData); },
  put(endpoint, data) { return this.request('PUT', endpoint, data); },
  delete(endpoint) { return this.request('DELETE', endpoint); },

  // Auth
  auth: {
    login: (data) => API.post('/auth/login', data),
    signup: (data) => API.post('/auth/signup', data),
    me: () => API.get('/auth/me'),
  },

  // Expenses
  expenses: {
    list: () => API.get('/expenses'),
    get: (id) => API.get(`/expenses/${id}`),
    create: (formData) => API.post('/expenses', formData, true),
    scanReceipt: (file) => {
      const fd = new FormData();
      fd.append('receipt', file);
      return API.post('/expenses/scan-receipt', fd, true);
    },
    dashboard: () => API.get('/expenses/dashboard'),
    categories: () => API.get('/expenses/categories'),
    convert: (amount, from, to) => API.get(`/expenses/convert?amount=${amount}&from=${from}&to=${to}`),
    vote: (id, data) => API.post(`/expenses/${id}/vote`, data),
    approve: (id, comment = '') => API.post(`/expenses/${id}/vote`, { vote: 'approve', comment }),
    reject: (id, comment = '') => API.post(`/expenses/${id}/vote`, { vote: 'reject', comment }),
    recordPayout: (id, data) => API.post(`/expenses/${id}/payout`, data),
    downloadExport: async (search = '', status = '') => {
      const q = new URLSearchParams();
      if (search) q.append('search', search);
      if (status) q.append('status', status);
      const url = `${API_BASE}/expenses/export?${q.toString()}`;
      const headers = {};
      if (AppState.token) {
        headers['Authorization'] = `Bearer ${AppState.token}`;
      }
      const res = await fetch(url, { headers });
      if (!res.ok) {
        throw new Error('Export download failed');
      }
      const blob = await res.blob();
      const downloadUrl = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = downloadUrl;
      const contentDisp = res.headers.get('Content-Disposition');
      let filename = `reimbursement_ledger_${new Date().toISOString().slice(0, 10)}.csv`;
      if (contentDisp && contentDisp.includes('filename=')) {
        const match = contentDisp.match(/filename="?([^"]+)"?/);
        if (match && match[1]) filename = match[1];
      }
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(downloadUrl);
    },
    exportUrl: (search = '', status = '') => {
      const q = new URLSearchParams();
      if (search) q.append('search', search);
      if (status) q.append('status', status);
      return `http://localhost:5001/api/expenses/export?${q.toString()}`;
    },
  },

  // Admin
  admin: {
    users: () => API.get('/admin/users'),
    createUser: (data) => API.post('/admin/users', data),
    updateUser: (id, data) => API.put(`/admin/users/${id}`, data),
    stats: () => API.get('/admin/stats'),
  }
};

class APIError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
    this.name = 'APIError';
  }
}

// ── Router ───────────────────────────────────────────────────
const Router = {
  routes: {},
  currentRoute: null,

  register(name, handler) {
    this.routes[name] = handler;
  },

  navigate(page, params = {}) {
    if (!AppState.isAuthenticated() && page !== 'auth') {
      this.navigate('auth');
      return;
    }

    if (AppState.isAuthenticated() && page === 'auth') {
      this.navigate('dashboard');
      return;
    }

    if (AppState.isAuthenticated()) {
      UI.showApp();
    } else {
      UI.showAuth();
    }

    // Role guard
    const adminOnly = ['admin-users', 'admin-stats'];
    if (adminOnly.includes(page) && !AppState.isAdmin()) {
      Toast.show('Access denied', 'error');
      this.navigate('dashboard');
      return;
    }

    this.currentRoute = { page, params };
    window.location.hash = page;

    if (this.routes[page]) {
      this.routes[page](params);
    }
  },

  init() {
    window.addEventListener('hashchange', () => {
      const hash = window.location.hash.slice(1) || 'dashboard';
      this.navigate(hash);
    });

    const initial = window.location.hash.slice(1) || '';
    if (!AppState.isAuthenticated()) {
      this.navigate('auth');
    } else {
      this.navigate(initial || 'dashboard');
    }
  }
};

// ── Toast Notifications ──────────────────────────────────────
const Toast = {
  container: null,

  init() {
    this.container = document.getElementById('toast-container');
    if (!this.container) {
      this.container = document.createElement('div');
      this.container.id = 'toast-container';
      this.container.className = 'toast-container';
      document.body.appendChild(this.container);
    }
  },

  show(message, type = 'info', duration = 3500) {
    const tags = { success: 'OK', error: 'ERR', warning: 'WARN', info: 'INFO' };
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.innerHTML = `
      <span class="toast-icon-tag">${tags[type] || 'INFO'}</span>
      <span>${message}</span>
    `;
    this.container.appendChild(toast);

    setTimeout(() => {
      toast.remove();
    }, duration);

    return toast;
  }
};

// ── UI Helpers ───────────────────────────────────────────────
const UI = {
  toast(message, type = 'info') {
    return Toast.show(message, type);
  },

  openTermsModal() {
    const el = document.getElementById('terms-modal');
    if (el) el.style.display = 'flex';
  },

  closeTermsModal() {
    const el = document.getElementById('terms-modal');
    if (el) el.style.display = 'none';
  },

  openPrivacyModal() {
    const el = document.getElementById('privacy-modal');
    if (el) el.style.display = 'flex';
  },

  closePrivacyModal() {
    const el = document.getElementById('privacy-modal');
    if (el) el.style.display = 'none';
  },

  // Show a page view, hide others
  showPage(pageId) {
    document.querySelectorAll('.page-view').forEach(el => el.classList.remove('active'));
    const page = document.getElementById(`page-${pageId}`);
    if (page) {
      page.classList.add('active');
    }
    // Update nav
    document.querySelectorAll('.nav-item').forEach(el => {
      el.classList.toggle('active', el.dataset.page === pageId);
    });
    // Update breadcrumb
    const breadcrumbEl = document.getElementById('breadcrumb-current');
    if (breadcrumbEl) {
      const navItem = document.querySelector(`.nav-item[data-page="${pageId}"]`);
      if (navItem) {
        breadcrumbEl.textContent = navItem.querySelector('.nav-item-text')?.textContent || pageId;
      }
    }
  },

  // Show/hide app shell vs auth page
  showApp() {
    document.getElementById('auth-page').style.display = 'none';
    document.getElementById('app-shell').style.display = 'flex';
    Layout.init();
  },

  showAuth() {
    document.getElementById('auth-page').style.display = 'flex';
    document.getElementById('app-shell').style.display = 'none';
  },

  // Loading state on a button
  setButtonLoading(btn, loading, text = '') {
    if (loading) {
      btn.disabled = true;
      btn._originalHTML = btn.innerHTML;
      btn.innerHTML = `<span class="spinner"></span> ${text || 'Processing...'}`;
    } else {
      btn.disabled = false;
      btn.innerHTML = btn._originalHTML || text;
    }
  },

  // Format currency
  formatCurrency(amount, code = 'INR', symbol = '₹') {
    const num = parseFloat(amount) || 0;
    return `${symbol}${num.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  },

  // Format date
  formatDate(dateStr) {
    if (!dateStr) return 'N/A';
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
  },

  // Status badge HTML
  statusBadge(status, utr = null) {
    const normalizedStatus = (status === 'in_review') ? 'pending' : status;
    const labels = {
      approved: 'Approved',
      paid: 'Reimbursed',
      rejected: 'Rejected',
      pending: 'Pending Approval',
      cancelled: 'Cancelled'
    };
    const titleAttr = (normalizedStatus === 'paid' && utr) ? ` title="Disbursed via Bank UTR: ${utr}"` : '';
    const icon = normalizedStatus === 'paid' ? '<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="margin-right:3px"><polyline points="20 6 9 17 4 12"/></svg>' : '';
    return `<span class="badge badge-${normalizedStatus}"${titleAttr}>${icon}${labels[normalizedStatus] || normalizedStatus}</span>`;
  },

  // AI Authenticity Score & Status badge HTML
  authenticityBadge(score, status) {
    if (score === null || score === undefined || score === '') {
      return `<span class="ai-score-pill ai-score-none"><small>NO SCAN</small></span>`;
    }
    const num = Math.round(Number(score));
    const rawSt = (status || (num >= 80 ? 'GENUINE' : num >= 50 ? 'NEEDS_REVIEW' : 'SUSPICIOUS')).toUpperCase();
    let cls = 'ai-score-genuine';
    let icon = `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>`;
    let label = 'Genuine';

    if (rawSt === 'SUSPICIOUS' || num < 50) {
      cls = 'ai-score-suspicious';
      icon = `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`;
      label = 'Suspicious';
    } else if (rawSt === 'NEEDS_REVIEW' || num < 80) {
      cls = 'ai-score-review';
      icon = `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>`;
      label = 'Review';
    }

    return `<span class="ai-score-pill ${cls}" title="Gemini AI Authenticity Score: ${num}% (${label})">${icon} ${num}% <small>${label}</small></span>`;
  },

  // Get initials from name
  initials(name = '') {
    return name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
  },

  // Relative time
  relativeTime(dateStr) {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    const now = new Date();
    const diff = now - d;
    const mins = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (mins < 1) return 'Just now';
    if (mins < 60) return `${mins}m ago`;
    if (hours < 24) return `${hours}h ago`;
    if (days < 7) return `${days}d ago`;
    return this.formatDate(dateStr);
  },

  // Confirm dialog
  confirm(message) {
    return window.confirm(message);
  },

  // Generic error display in a container
  showError(containerId, message) {
    const el = document.getElementById(containerId);
    if (el) {
      el.textContent = message;
      el.classList.add('visible');
    }
  },

  clearError(containerId) {
    const el = document.getElementById(containerId);
    if (el) {
      el.textContent = '';
      el.classList.remove('visible');
    }
  }
};

// ── Sidebar / Layout Controller ──────────────────────────────
const Layout = {
  sidebar: null,
  mainContent: null,
  overlay: null,
  _initialized: false,

  init() {
    this.sidebar = document.getElementById('sidebar');
    this.mainContent = document.getElementById('main-content');
    this.overlay = document.getElementById('sidebar-overlay');

    if (!this.sidebar) return;

    // Populate user info and rebuild nav every time (reflects current user)
    this.updateUserInfo();
    this.buildNav();

    // Apply saved collapse state
    if (AppState.sidebarCollapsed) {
      this.sidebar.classList.add('collapsed');
      this.mainContent?.classList.add('collapsed');
    } else {
      this.sidebar.classList.remove('collapsed');
      this.mainContent?.classList.remove('collapsed');
    }

    // Only attach event listeners once
    if (this._initialized) return;
    this._initialized = true;

    // Toggle button
    document.getElementById('sidebar-toggle-btn')?.addEventListener('click', () => this.toggle());

    // Mobile menu
    document.getElementById('mobile-menu-btn')?.addEventListener('click', () => this.toggleMobile());

    // Overlay close
    this.overlay?.addEventListener('click', () => this.closeMobile());

    // Logout
    document.getElementById('logout-btn')?.addEventListener('click', () => Auth.logout());
  },

  toggle() {
    AppState.sidebarCollapsed = !AppState.sidebarCollapsed;
    AppState.save();
    this.sidebar.classList.toggle('collapsed', AppState.sidebarCollapsed);
    this.mainContent?.classList.toggle('collapsed', AppState.sidebarCollapsed);
  },

  toggleMobile() {
    const isOpen = this.sidebar.classList.contains('mobile-open');
    if (isOpen) {
      this.closeMobile();
    } else {
      this.sidebar.classList.add('mobile-open');
      this.overlay?.classList.add('visible');
    }
  },

  closeMobile() {
    this.sidebar.classList.remove('mobile-open');
    this.overlay?.classList.remove('visible');
  },

  updateUserInfo() {
    const user = AppState.user;
    const company = AppState.company;
    if (!user) return;

    const avatarEls = document.querySelectorAll('.sidebar-avatar');
    avatarEls.forEach(el => { el.textContent = UI.initials(user.name); });

    const nameEls = document.querySelectorAll('.sidebar-user-name');
    nameEls.forEach(el => { el.textContent = user.name; });

    const roleEls = document.querySelectorAll('.sidebar-user-role');
    roleEls.forEach(el => { el.textContent = user.role; });

    const companyEl = document.getElementById('topbar-company');
    if (companyEl && company) { companyEl.textContent = company.name; }
  },

  buildNav() {
    const isAdmin = AppState.isAdmin();
    const navEl = document.getElementById('sidebar-nav');
    if (!navEl) return;

    const icons = {
      dashboard: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7"></rect><rect x="14" y="3" width="7" height="7"></rect><rect x="14" y="14" width="7" height="7"></rect><rect x="3" y="14" width="7" height="7"></rect></svg>`,
      myExpenses: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line></svg>`,
      newExpense: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="16"></line><line x1="8" y1="12" x2="16" y2="12"></line></svg>`,
      allExpenses: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="7" width="20" height="14" rx="2" ry="2"></rect><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"></path></svg>`,
      users: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg>`,
      analytics: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="20" x2="18" y2="10"></line><line x1="12" y1="20" x2="12" y2="4"></line><line x1="6" y1="20" x2="6" y2="14"></line></svg>`
    };

    // Employee nav items
    const employeeNav = [
      { page: 'dashboard', icon: icons.dashboard, label: 'Overview' },
      { page: 'my-expenses', icon: icons.myExpenses, label: 'My Expenses' },
      { page: 'new-expense', icon: icons.newExpense, label: 'New Expense' },
    ];

    // Admin nav items
    const adminNav = [
      { page: 'all-expenses', icon: icons.allExpenses, label: 'Company Ledger' },
      { page: 'admin-users', icon: icons.users, label: 'Directory' },
      { page: 'admin-stats', icon: icons.analytics, label: 'Analytics' },
    ];

    let html = `
      <span class="nav-section-label">Operations</span>
      ${employeeNav.map(item => `
        <a class="nav-item" data-page="${item.page}" href="#${item.page}" data-tooltip="${item.label}">
          <span class="nav-item-icon">${item.icon}</span>
          <span class="nav-item-text">${item.label}</span>
        </a>
      `).join('')}
    `;

    if (isAdmin) {
      html += `
        <span class="nav-section-label">Governance</span>
        ${adminNav.map(item => `
          <a class="nav-item" data-page="${item.page}" href="#${item.page}" data-tooltip="${item.label}">
            <span class="nav-item-icon">${item.icon}</span>
            <span class="nav-item-text">${item.label}</span>
          </a>
        `).join('')}
      `;
    }

    navEl.innerHTML = html;

    // Attach click handlers
    navEl.querySelectorAll('.nav-item').forEach(link => {
      link.addEventListener('click', (e) => {
        e.preventDefault();
        const page = link.dataset.page;
        Router.navigate(page);
        this.closeMobile();
      });
    });
  }
};

// ── Charts (Vanilla Canvas Engine) ───────────────────────────
const Charts = {
  // Draw a donut chart on a canvas
  donut(canvasId, segments, { size = 160, thickness = 22 } = {}) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    canvas.width = size * dpr;
    canvas.height = size * dpr;
    canvas.style.width = size + 'px';
    canvas.style.height = size + 'px';
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, size, size);

    const cx = size / 2, cy = size / 2, r = (size - thickness) / 2;
    const activeSegments = (segments || []).filter(s => (s.value || 0) > 0);
    const total = activeSegments.reduce((s, seg) => s + (seg.value || 0), 0);

    if (total === 0) {
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.strokeStyle = '#e2e8f0';
      ctx.lineWidth = thickness;
      ctx.stroke();
      return;
    }

    let startAngle = -Math.PI / 2;
    const gap = activeSegments.length > 1 ? 0.04 : 0;
    const availableArc = Math.PI * 2 - (gap * activeSegments.length);

    activeSegments.forEach(seg => {
      const slice = (seg.value / total) * availableArc;
      ctx.beginPath();
      ctx.arc(cx, cy, r, startAngle, startAngle + slice);
      ctx.strokeStyle = seg.color;
      ctx.lineWidth = thickness;
      ctx.lineCap = 'round';
      ctx.stroke();
      startAngle += slice + gap;
    });
  },

  // Draw a solid/ring pie chart on a canvas
  pie(canvasId, segments, { size = 160, innerRatio = 0.45 } = {}) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    canvas.width = size * dpr;
    canvas.height = size * dpr;
    canvas.style.width = size + 'px';
    canvas.style.height = size + 'px';
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, size, size);

    const cx = size / 2, cy = size / 2;
    const outerR = size / 2 - 4;
    const innerR = outerR * innerRatio;
    const activeSegments = (segments || []).filter(s => (s.value || 0) > 0);
    const total = activeSegments.reduce((s, seg) => s + (seg.value || 0), 0);

    if (total === 0) {
      ctx.beginPath();
      ctx.arc(cx, cy, outerR, 0, Math.PI * 2);
      ctx.fillStyle = '#f1f5f9';
      ctx.fill();
      return;
    }

    let startAngle = -Math.PI / 2;
    activeSegments.forEach(seg => {
      const slice = (seg.value / total) * (Math.PI * 2);
      const endAngle = startAngle + slice;

      ctx.beginPath();
      ctx.arc(cx, cy, outerR, startAngle, endAngle);
      ctx.arc(cx, cy, innerR, endAngle, startAngle, true);
      ctx.closePath();
      ctx.fillStyle = seg.color;
      ctx.fill();

      // Delicate slice border
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.stroke();

      startAngle = endAngle;
    });
  },

  // Draw an elegant, responsive line / area chart with gradient fill
  line(canvasId, { labels = [], data = [], color = '#2563eb', fillColor = 'rgba(37, 99, 235, 0.14)', unit = '₹', height = 220 } = {}) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    const width = Math.max(canvas.parentElement ? canvas.parentElement.clientWidth : 500, 300);

    canvas.width = width * dpr;
    canvas.height = height * dpr;
    canvas.style.width = width + 'px';
    canvas.style.height = height + 'px';
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, width, height);

    const padL = 52, padR = 24, padT = 28, padB = 36;
    const plotW = width - padL - padR;
    const plotH = height - padT - padB;

    if (!data.length) {
      ctx.fillStyle = '#94a3b8';
      ctx.font = '500 13px Plus Jakarta Sans, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('No historical timeline data available', width / 2, height / 2);
      return;
    }

    const rawMax = Math.max(...data, 10);
    let maxVal = Math.ceil(rawMax * 1.15);
    if (maxVal > 1000) maxVal = Math.ceil(maxVal / 1000) * 1000;
    else if (maxVal > 100) maxVal = Math.ceil(maxVal / 100) * 100;
    else maxVal = Math.ceil(maxVal / 10) * 10;

    // Draw horizontal gridlines & Y labels
    ctx.lineWidth = 1;
    ctx.font = '500 10px JetBrains Mono, monospace';
    ctx.textAlign = 'right';

    for (let i = 0; i <= 4; i++) {
      const yVal = (maxVal / 4) * i;
      const yPos = padT + plotH - (i / 4) * plotH;

      ctx.beginPath();
      ctx.strokeStyle = i === 0 ? '#cbd5e1' : '#f1f5f9';
      ctx.setLineDash(i === 0 ? [] : [4, 4]);
      ctx.moveTo(padL, yPos);
      ctx.lineTo(width - padR, yPos);
      ctx.stroke();
      ctx.setLineDash([]);

      ctx.fillStyle = '#94a3b8';
      let labelText = `${unit}${Math.round(yVal)}`;
      if (yVal >= 1000) labelText = `${unit}${(yVal / 1000).toFixed(1)}k`;
      ctx.fillText(labelText, padL - 8, yPos + 4);
    }

    // Compute point coordinates
    const points = data.map((val, idx) => {
      const x = padL + (idx / Math.max(data.length - 1, 1)) * plotW;
      const y = padT + plotH - (Math.max(val, 0) / maxVal) * plotH;
      return { x, y, val };
    });

    // Gradient fill under the curve
    const grad = ctx.createLinearGradient(0, padT, 0, padT + plotH);
    grad.addColorStop(0, fillColor || 'rgba(37, 99, 235, 0.22)');
    grad.addColorStop(1, 'rgba(37, 99, 235, 0.00)');

    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    for (let i = 0; i < points.length - 1; i++) {
      const xc = (points[i].x + points[i + 1].x) / 2;
      const yc = (points[i].y + points[i + 1].y) / 2;
      ctx.quadraticCurveTo(points[i].x, points[i].y, xc, yc);
    }
    ctx.lineTo(points[points.length - 1].x, points[points.length - 1].y);
    ctx.lineTo(points[points.length - 1].x, padT + plotH);
    ctx.lineTo(points[0].x, padT + plotH);
    ctx.closePath();
    ctx.fillStyle = grad;
    ctx.fill();

    // Smooth stroke
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    for (let i = 0; i < points.length - 1; i++) {
      const xc = (points[i].x + points[i + 1].x) / 2;
      const yc = (points[i].y + points[i + 1].y) / 2;
      ctx.quadraticCurveTo(points[i].x, points[i].y, xc, yc);
    }
    ctx.lineTo(points[points.length - 1].x, points[points.length - 1].y);
    ctx.strokeStyle = color;
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.stroke();

    // Data points & labels
    points.forEach((pt, i) => {
      // Circle dot
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, 4, 0, Math.PI * 2);
      ctx.fillStyle = '#ffffff';
      ctx.fill();
      ctx.strokeStyle = color;
      ctx.lineWidth = 2.5;
      ctx.stroke();

      // Value label on top
      if (data.length <= 10 || pt.val > 0) {
        ctx.font = '600 10px JetBrains Mono, monospace';
        ctx.fillStyle = '#0f172a';
        ctx.textAlign = 'center';
        let valText = `${unit}${Math.round(pt.val)}`;
        if (pt.val >= 1000) valText = `${unit}${(pt.val / 1000).toFixed(1)}k`;
        ctx.fillText(valText, pt.x, Math.max(pt.y - 8, 12));
      }

      // X-axis label
      if (labels && labels[i]) {
        ctx.font = '500 11px Plus Jakarta Sans, sans-serif';
        ctx.fillStyle = '#64748b';
        ctx.textAlign = 'center';
        ctx.fillText(labels[i], pt.x, padT + plotH + 20);
      }
    });
  },

  // Draw a crisp vertical bar chart with rounded tops (supports single or grouped bars)
  bar(canvasId, { labels = [], data = [], secondaryData = null, colors = [], secondaryColor = '#10b981', unit = '₹', height = 200 } = {}) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    const width = Math.max(canvas.parentElement ? canvas.parentElement.clientWidth : 500, 300);

    canvas.width = width * dpr;
    canvas.height = height * dpr;
    canvas.style.width = width + 'px';
    canvas.style.height = height + 'px';
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, width, height);

    const padL = 52, padR = 20, padT = 26, padB = 36;
    const plotW = width - padL - padR;
    const plotH = height - padT - padB;

    if (!data.length) {
      ctx.fillStyle = '#94a3b8';
      ctx.font = '500 13px Plus Jakarta Sans, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('No expense records found', width / 2, height / 2);
      return;
    }

    const allVals = secondaryData && secondaryData.length ? [...data, ...secondaryData] : data;
    const rawMax = Math.max(...allVals, 10);
    let maxVal = Math.ceil(rawMax * 1.15);
    if (maxVal > 1000) maxVal = Math.ceil(maxVal / 1000) * 1000;
    else if (maxVal > 100) maxVal = Math.ceil(maxVal / 100) * 100;
    else maxVal = Math.ceil(maxVal / 10) * 10;

    // Draw horizontal grid lines
    ctx.lineWidth = 1;
    ctx.font = '500 10px JetBrains Mono, monospace';
    ctx.textAlign = 'right';

    for (let i = 0; i <= 3; i++) {
      const yVal = (maxVal / 3) * i;
      const yPos = padT + plotH - (i / 3) * plotH;

      ctx.beginPath();
      ctx.strokeStyle = i === 0 ? '#cbd5e1' : '#f1f5f9';
      ctx.moveTo(padL, yPos);
      ctx.lineTo(width - padR, yPos);
      ctx.stroke();

      ctx.fillStyle = '#94a3b8';
      let labelText = `${unit}${Math.round(yVal)}`;
      if (yVal >= 1000) labelText = `${unit}${(yVal / 1000).toFixed(1)}k`;
      ctx.fillText(labelText, padL - 8, yPos + 4);
    }

    const defaultColors = ['#2563eb', '#3b82f6', '#0ea5e9', '#06b6d4', '#10b981', '#f59e0b', '#8b5cf6'];
    const isGrouped = Array.isArray(secondaryData) && secondaryData.length > 0;
    const slotW = plotW / data.length;

    data.forEach((val, i) => {
      const label = labels[i] || '';
      const displayLabel = label.length > 9 ? label.slice(0, 8) + '…' : label;

      if (isGrouped) {
        // Dual / grouped bar: Primary (Claimed) and Secondary (Approved)
        const secVal = secondaryData[i] || 0;
        const totalBarW = Math.min(Math.max(slotW * 0.64, 22), 60);
        const subW = (totalBarW - 4) / 2;
        const startX = padL + i * slotW + (slotW - totalBarW) / 2;

        // Bar 1: Claimed
        const barH1 = (Math.max(val, 0) / maxVal) * plotH;
        const y1 = padT + plotH - barH1;
        const r1 = Math.min(4, barH1 / 2);
        ctx.beginPath();
        ctx.moveTo(startX, padT + plotH);
        ctx.lineTo(startX, y1 + r1);
        ctx.quadraticCurveTo(startX, y1, startX + r1, y1);
        ctx.lineTo(startX + subW - r1, y1);
        ctx.quadraticCurveTo(startX + subW, y1, startX + subW, y1 + r1);
        ctx.lineTo(startX + subW, padT + plotH);
        ctx.closePath();
        ctx.fillStyle = colors[i] || '#2563eb';
        ctx.fill();

        // Bar 2: Approved
        const startX2 = startX + subW + 4;
        const barH2 = (Math.max(secVal, 0) / maxVal) * plotH;
        const y2 = padT + plotH - barH2;
        const r2 = Math.min(4, barH2 / 2);
        ctx.beginPath();
        ctx.moveTo(startX2, padT + plotH);
        ctx.lineTo(startX2, y2 + r2);
        ctx.quadraticCurveTo(startX2, y2, startX2 + r2, y2);
        ctx.lineTo(startX2 + subW - r2, y2);
        ctx.quadraticCurveTo(startX2 + subW, y2, startX2 + subW, y2 + r2);
        ctx.lineTo(startX2 + subW, padT + plotH);
        ctx.closePath();
        ctx.fillStyle = secondaryColor;
        ctx.fill();

        // Value label on top of primary bar
        ctx.font = '600 9px JetBrains Mono, monospace';
        ctx.fillStyle = '#0f172a';
        ctx.textAlign = 'center';
        let valText1 = val >= 1000 ? `${unit}${(val / 1000).toFixed(1)}k` : `${unit}${Math.round(val)}`;
        ctx.fillText(valText1, startX + subW / 2, Math.max(y1 - 5, 12));

        // Value label on top of secondary bar (if > 0)
        if (secVal > 0) {
          ctx.fillStyle = '#065f46';
          let valText2 = secVal >= 1000 ? `${unit}${(secVal / 1000).toFixed(1)}k` : `${unit}${Math.round(secVal)}`;
          ctx.fillText(valText2, startX2 + subW / 2, Math.max(y2 - 5, 12));
        }

        // X-axis label centered under the pair
        ctx.font = '500 11px Plus Jakarta Sans, sans-serif';
        ctx.fillStyle = '#64748b';
        ctx.textAlign = 'center';
        ctx.fillText(displayLabel, startX + totalBarW / 2, padT + plotH + 18);
      } else {
        // Standard single bar
        const barW = Math.min(Math.max(slotW * 0.52, 14), 48);
        const barH = (Math.max(val, 0) / maxVal) * plotH;
        const x = padL + i * slotW + (slotW - barW) / 2;
        const y = padT + plotH - barH;
        const barColor = colors[i] || defaultColors[i % defaultColors.length];

        const radius = Math.min(6, barH / 2);
        ctx.beginPath();
        ctx.moveTo(x, padT + plotH);
        ctx.lineTo(x, y + radius);
        ctx.quadraticCurveTo(x, y, x + radius, y);
        ctx.lineTo(x + barW - radius, y);
        ctx.quadraticCurveTo(x + barW, y, x + barW, y + radius);
        ctx.lineTo(x + barW, padT + plotH);
        ctx.closePath();
        ctx.fillStyle = barColor;
        ctx.fill();

        ctx.font = '600 10px JetBrains Mono, monospace';
        ctx.fillStyle = '#0f172a';
        ctx.textAlign = 'center';
        let valText = val >= 1000 ? `${unit}${(val / 1000).toFixed(1)}k` : `${unit}${Math.round(val)}`;
        ctx.fillText(valText, x + barW / 2, Math.max(y - 6, 12));

        ctx.font = '500 11px Plus Jakarta Sans, sans-serif';
        ctx.fillStyle = '#64748b';
        ctx.textAlign = 'center';
        ctx.fillText(displayLabel, x + barW / 2, padT + plotH + 18);
      }
    });
  },

  // Animate bar chart bars
  animateBars(containerSelector) {
    document.querySelectorAll(`${containerSelector} .bar-fill`).forEach(bar => {
      const target = bar.dataset.width || '0%';
      bar.style.width = '0%';
      requestAnimationFrame(() => {
        setTimeout(() => { bar.style.width = target; }, 100);
      });
    });
  }
};

// ── Global init ──────────────────────────────────────────────
// NOTE: Use 'load' (not 'DOMContentLoaded') so all other script files
// have already run and registered their routes before the router starts.
window.addEventListener('load', () => {
  AppState.load();
  Toast.init();
  Router.init();
});
