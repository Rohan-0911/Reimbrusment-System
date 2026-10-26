/* ============================================================
   Reimbursement System: Admin Directory & Analytics
   ============================================================ */

'use strict';

// Admin Users Directory
const AdminUsers = {
  users: [],
  filtered: [],

  async init() {
    UI.showPage('admin-users');
    this.renderLoading();
    await this.loadUsers();
    this.bindEvents();
  },

  renderLoading() {
    const tbody = document.getElementById('users-tbody');
    if (tbody) {
      tbody.innerHTML = `
        <tr>
          <td colspan="5" style="text-align:center;padding:24px;font-family:var(--font-mono);font-size:0.8125rem;color:var(--text-muted)">
            Loading enterprise user directory...
          </td>
        </tr>
      `;
    }
  },

  async loadUsers() {
    try {
      this.users = await API.admin.users();
    } catch {
      this.users = this.getMockUsers();
    }
    this.filtered = [...this.users];
    this.renderTable();
  },

  getMockUsers() {
    return [
      { id: 'u1', name: 'Alice Johnson', email: 'alice@acme.com', role: 'employee', is_active: 1, created_at: '2026-08-01T10:00:00Z' },
      { id: 'u2', name: 'Bob Williams', email: 'bob@acme.com', role: 'employee', is_active: 1, created_at: '2026-08-05T09:00:00Z' },
      { id: 'u3', name: 'Jane Smith', email: 'jane@acme.com', role: 'employee', is_active: 1, created_at: '2026-08-10T08:00:00Z' },
      { id: 'u4', name: 'Alex Lee', email: 'alex@acme.com', role: 'employee', is_active: 0, created_at: '2026-08-15T11:00:00Z' },
      { id: 'u5', name: AppState.user?.name || 'Admin User', email: AppState.user?.email || 'admin@acme.com', role: 'admin', is_active: 1, created_at: '2026-07-01T08:00:00Z' },
    ];
  },

  bindEvents() {
    // Search
    document.getElementById('users-search')?.addEventListener('input', (e) => {
      const q = e.target.value.toLowerCase();
      this.filtered = this.users.filter(u =>
        u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q)
      );
      this.renderTable();
    });

    // Role filter
    document.getElementById('users-role-filter')?.addEventListener('change', (e) => {
      const role = e.target.value;
      this.filtered = role ? this.users.filter(u => u.role === role) : [...this.users];
      this.renderTable();
    });

    // Create user modal
    document.getElementById('create-user-btn')?.addEventListener('click', () => {
      this.openCreateModal();
    });

    document.getElementById('create-user-modal-close')?.addEventListener('click', () => {
      this.closeModal();
    });

    document.getElementById('create-user-form')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      await this.handleCreateUser();
    });

    // Close modal on overlay click
    document.getElementById('create-user-modal')?.addEventListener('click', (e) => {
      if (e.target.id === 'create-user-modal') this.closeModal();
    });
  },

  renderTable() {
    const tbody = document.getElementById('users-tbody');
    const countEl = document.getElementById('users-count');

    if (countEl) countEl.textContent = `${this.filtered.length} user${this.filtered.length !== 1 ? 's' : ''}`;

    if (!tbody) return;

    if (!this.filtered.length) {
      tbody.innerHTML = `<tr><td colspan="5"><div class="empty-state"><div class="empty-state-code">[NO-USERS]</div><h3>No personnel records found</h3></div></td></tr>`;
      return;
    }

    tbody.innerHTML = this.filtered.map(user => `
      <tr>
        <td>
          <div class="user-avatar-cell">
            <div class="user-table-avatar">${UI.initials(user.name)}</div>
            <div>
              <div class="user-table-name">${user.name}</div>
              <div class="user-table-email">${user.email}</div>
            </div>
          </div>
        </td>
        <td>
          <span class="role-badge role-${user.role}">${user.role.toUpperCase()}</span>
        </td>
        <td>
          <div class="status-toggle">
            <label class="toggle-switch">
              <input type="checkbox" ${user.is_active ? 'checked' : ''} 
                     onchange="AdminUsers.toggleStatus('${user.id}', this.checked)"
                     ${user.id === AppState.user?.id ? 'disabled' : ''}>
              <span class="toggle-track"></span>
            </label>
            <span class="toggle-label">${user.is_active ? 'Active' : 'Suspended'}</span>
          </div>
        </td>
        <td class="expense-date">${UI.formatDate(user.created_at)}</td>
        <td>
          <div class="action-menu" id="menu-${user.id}">
            <button class="action-menu-btn" onclick="AdminUsers.toggleMenu('${user.id}')">Manage</button>
            <div class="action-dropdown" id="dropdown-${user.id}">
              <button class="action-dropdown-item" onclick="AdminUsers.openEditModal('${user.id}')">
                Edit Role
              </button>
              ${user.id !== AppState.user?.id ? `
                <button class="action-dropdown-item danger" onclick="AdminUsers.deactivate('${user.id}')">
                  Deactivate Account
                </button>
              ` : ''}
            </div>
          </div>
        </td>
      </tr>
    `).join('');
  },

  toggleMenu(userId) {
    document.querySelectorAll('.action-dropdown').forEach(d => {
      if (d.id !== `dropdown-${userId}`) d.classList.remove('open');
    });
    document.getElementById(`dropdown-${userId}`)?.classList.toggle('open');
  },

  openCreateModal() {
    document.getElementById('create-user-modal')?.style.setProperty('display', 'flex');
    document.getElementById('create-user-error')?.classList.remove('visible');
    document.getElementById('create-user-form')?.reset();
  },

  closeModal() {
    document.getElementById('create-user-modal')?.style.setProperty('display', 'none');
  },

  async handleCreateUser() {
    const name = document.getElementById('new-user-name')?.value.trim();
    const email = document.getElementById('new-user-email')?.value.trim();
    const password = document.getElementById('new-user-password')?.value;
    const role = document.getElementById('new-user-role')?.value;
    const btn = document.getElementById('create-user-submit');
    const errorEl = document.getElementById('create-user-error');

    if (!name || !email || !password || !role) {
      errorEl.textContent = '[ERR] Please complete all required fields.';
      errorEl?.classList.add('visible');
      return;
    }

    UI.setButtonLoading(btn, true, 'Creating record...');
    errorEl?.classList.remove('visible');

    try {
      const newUser = await API.admin.createUser({ name, email, password, role });
      this.users.unshift(newUser);
      this.filtered = [...this.users];
      this.renderTable();
      this.closeModal();
      Toast.show(`User "${name}" enrolled successfully.`, 'success');
    } catch (err) {
      if (err.status === 0) {
        // Demo mode
        const fakeUser = { id: `u${Date.now()}`, name, email, role, is_active: 1, created_at: new Date().toISOString() };
        this.users.unshift(fakeUser);
        this.filtered = [...this.users];
        this.renderTable();
        this.closeModal();
        Toast.show(`User "${name}" enrolled in local directory.`, 'success');
      } else {
        errorEl.textContent = '[ERR] ' + err.message;
        errorEl?.classList.add('visible');
      }
    } finally {
      UI.setButtonLoading(btn, false);
      if (btn._originalHTML) btn.innerHTML = btn._originalHTML;
    }
  },

  async toggleStatus(userId, isActive) {
    const user = this.users.find(u => u.id === userId);
    if (!user) return;

    try {
      await API.admin.updateUser(userId, { role: user.role, is_active: isActive ? 1 : 0 });
      user.is_active = isActive ? 1 : 0;
      Toast.show(`User account status updated.`, 'success');
    } catch {
      // Demo mode fallback
      user.is_active = isActive ? 1 : 0;
      Toast.show(`User account status updated (local session).`, 'success');
    }
    this.renderTable();
  },

  openEditModal(userId) {
    const user = this.users.find(u => u.id === userId);
    if (!user) return;

    const newRole = window.prompt(
      `Update authorization role for "${user.name}".\nCurrent: ${user.role}\nEnter role (admin / employee):`,
      user.role
    );

    if (!newRole || !['admin', 'employee'].includes(newRole.toLowerCase())) {
      if (newRole !== null) Toast.show('Invalid role assignment. Enter admin or employee.', 'error');
      return;
    }

    this.updateRole(userId, newRole.toLowerCase());
    document.getElementById(`dropdown-${userId}`)?.classList.remove('open');
  },

  async updateRole(userId, role) {
    const user = this.users.find(u => u.id === userId);
    if (!user) return;

    try {
      await API.admin.updateUser(userId, { role, is_active: user.is_active });
      user.role = role;
      Toast.show(`Role reclassified as "${role}".`, 'success');
    } catch {
      user.role = role;
      Toast.show(`Role reclassified as "${role}" (local session).`, 'success');
    }
    this.renderTable();
  },

  deactivate(userId) {
    if (!UI.confirm('Suspend user account? Authentication privileges will be revoked.')) return;
    this.toggleStatus(userId, false);
  }
};

// Admin Stats & Analytics
const AdminStats = {
  async init() {
    UI.showPage('admin-stats');
    await this.loadData();
  },

  async loadData() {
    let data;
    try {
      data = await API.admin.stats();
    } catch {
      data = this.getMockStats();
    }
    this.render(data);
  },

  getMockStats() {
    return {
      company: AppState.company || { name: 'Reimbursement System Corp', currency_code: 'INR', currency_symbol: '₹', country: 'India' },
      userCount: { count: 12 },
      expenseStats: [
        { status: 'approved', count: 28, total: 72000 },
        { status: 'in_review', count: 12, total: 35000 },
        { status: 'pending', count: 5, total: 10000 },
        { status: 'rejected', count: 3, total: 7500 },
      ],
      topSpenders: [
        { name: 'Alice Johnson', role: 'employee', count: 8, total: 28000 },
        { name: 'Bob Williams', role: 'employee', count: 6, total: 19500 },
        { name: 'Jane Smith', role: 'employee', count: 5, total: 14200 },
        { name: 'Alex Lee', role: 'employee', count: 4, total: 9800 },
        { name: 'Mark Chen', role: 'employee', count: 5, total: 8900 },
      ],
    };
  },

  render(data) {
    const { company, userCount, expenseStats, topSpenders } = data;
    const sym = company?.currency_symbol || '₹';
    const total = (expenseStats || []).reduce((s, e) => ({ count: s.count + e.count, total: s.total + e.total }), { count: 0, total: 0 });
    const approved = expenseStats?.find(e => e.status === 'approved');
    const inReview = expenseStats?.find(e => e.status === 'in_review');
    const approvedTotal = approved?.total || 0;

    // KPI cards (Modern light analytics cards)
    const kpiEl = document.getElementById('admin-kpi-grid');
    if (kpiEl) {
      kpiEl.innerHTML = `
        <div class="metric-card">
          <div class="metric-header">
            <span class="metric-label">Enrolled Members</span>
            <div class="stat-icon-wrap stat-icon-blue">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
            </div>
          </div>
          <div class="metric-value">${userCount?.count || 0}</div>
          <div class="metric-meta">Active team accounts</div>
        </div>
        <div class="metric-card">
          <div class="metric-header">
            <span class="metric-label">Total Submissions</span>
            <div class="stat-icon-wrap stat-icon-purple">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
            </div>
          </div>
          <div class="metric-value">${total.count}</div>
          <div class="metric-meta">Filed across all quarters</div>
        </div>
        <div class="metric-card">
          <div class="metric-header">
            <span class="metric-label">Approved Claims</span>
            <div class="stat-icon-wrap stat-icon-green">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
            </div>
          </div>
          <div class="metric-value">${approved?.count || 0}</div>
          <div class="metric-meta">Audited and processed</div>
        </div>
        <div class="metric-card">
          <div class="metric-header">
            <span class="metric-label">Aggregate Spend</span>
            <div class="stat-icon-wrap stat-icon-amber">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>
            </div>
          </div>
          <div class="metric-value">${sym}${(approvedTotal / 1000).toFixed(1)}k</div>
          <div class="metric-meta">Approved company spend only</div>
        </div>
      `;
    }

    // Status chart: vibrant modern status palette
    const statusColors = { 
      approved: '#10b981', 
      in_review: '#3b82f6', 
      pending: '#f59e0b', 
      rejected: '#ef4444' 
    };

    Charts.donut('admin-status-donut', (expenseStats || []).map(s => ({
      value: s.count,
      color: statusColors[s.status] || '#64748b'
    })), { size: 160, thickness: 22 });

    const adminDonutTotal = document.getElementById('admin-donut-total');
    if (adminDonutTotal) adminDonutTotal.textContent = total.count;

    const adminLegendEl = document.getElementById('admin-status-legend');
    if (adminLegendEl) {
      adminLegendEl.innerHTML = (expenseStats || []).map(s => `
        <div class="legend-item">
          <span class="legend-label">
            <span class="legend-dot" style="background:${statusColors[s.status] || '#141618'}"></span>
            ${s.status.replace('_', ' ').toUpperCase()}
          </span>
          <span class="legend-value">${sym}${(s.total / 1000).toFixed(0)}k</span>
        </div>
      `).join('');
    }

    // Top spenders
    const spendersEl = document.getElementById('admin-top-spenders');
    if (spendersEl) {
      spendersEl.innerHTML = (topSpenders || []).map((s, i) => `
        <div class="spender-item">
          <div class="spender-rank">${String(i + 1).padStart(2, '0')}</div>
          <div class="spender-avatar">${UI.initials(s.name)}</div>
          <div class="spender-info">
            <div class="spender-name">${s.name}</div>
            <div class="spender-count">${s.count} approved claim${s.count !== 1 ? 's' : ''} / ${s.role.toUpperCase()}</div>
          </div>
          <div class="spender-total">${sym}${(s.total / 1000).toFixed(1)}k</div>
        </div>
      `).join('');
    }

    // Company info
    const companyEl = document.getElementById('company-info');
    if (companyEl && company) {
      companyEl.innerHTML = `
        <div class="detail-info-grid">
          <div>
            <div class="detail-field-label">CORPORATION</div>
            <div class="detail-field-value">${company.name}</div>
          </div>
          <div>
            <div class="detail-field-label">JURISDICTION</div>
            <div class="detail-field-value">${company.country}</div>
          </div>
          <div>
            <div class="detail-field-label">BASE LEDGER CURRENCY</div>
            <div class="detail-field-value" style="font-family:var(--font-mono)">${company.currency_symbol} ${company.currency_code}</div>
          </div>
          <div>
            <div class="detail-field-label">ENROLLED ACCOUNTS</div>
            <div class="detail-field-value" style="font-family:var(--font-mono)">${userCount?.count || 0}</div>
          </div>
        </div>
      `;
    }
  }
};

// Register routes
Router.register('admin-users', () => AdminUsers.init());
Router.register('admin-stats', () => AdminStats.init());

// Close dropdowns when clicking outside
document.addEventListener('click', (e) => {
  if (!e.target.closest('.action-menu')) {
    document.querySelectorAll('.action-dropdown').forEach(d => d.classList.remove('open'));
  }
});
