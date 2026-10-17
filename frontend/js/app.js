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
    dashboard: () => API.get('/expenses/dashboard'),
    categories: () => API.get('/expenses/categories'),
    convert: (amount, from, to) => API.get(`/expenses/convert?amount=${amount}&from=${from}&to=${to}`),
    vote: (id, data) => API.post(`/expenses/${id}/vote`, data),
    approve: (id, comment = '') => API.post(`/expenses/${id}/vote`, { vote: 'approve', comment }),
    reject: (id, comment = '') => API.post(`/expenses/${id}/vote`, { vote: 'reject', comment }),
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
  statusBadge(status) {
    const labels = {
      approved: 'Approved',
      rejected: 'Rejected',
      pending: 'Pending',
      in_review: 'In Review',
      cancelled: 'Cancelled'
    };
    return `<span class="badge badge-${status}">${labels[status] || status}</span>`;
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

// ── Charts (Vanilla Canvas) ──────────────────────────────────
const Charts = {
  // Draw a donut chart on a canvas
  donut(canvasId, segments, { size = 160, thickness = 20 } = {}) {
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
    const total = segments.reduce((s, seg) => s + (seg.value || 0), 0);
    if (total === 0) {
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.strokeStyle = '#e2e8f0';
      ctx.lineWidth = thickness;
      ctx.stroke();
      return;
    }

    let startAngle = -Math.PI / 2;
    const gap = segments.filter(s => s.value > 0).length > 1 ? 0.05 : 0;

    segments.forEach(seg => {
      if (!seg.value) return;
      const slice = (seg.value / total) * (Math.PI * 2 - (gap * segments.length));
      ctx.beginPath();
      ctx.arc(cx, cy, r, startAngle, startAngle + slice);
      ctx.strokeStyle = seg.color;
      ctx.lineWidth = thickness;
      ctx.lineCap = 'round';
      ctx.stroke();
      startAngle += slice + gap;
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
