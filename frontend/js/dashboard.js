/* ============================================================
   Reimbursement System :  Dashboard
   ============================================================ */

'use strict';

const Dashboard = {
  data: null,

  async init() {
    UI.showPage('dashboard');
    this.renderLoadingState();
    await this.loadData();
  },

  renderLoadingState() {
    const statsEl = document.getElementById('dashboard-stats');
    if (statsEl) {
      statsEl.innerHTML = Array(4).fill(0).map(() => `
        <div class="stat-card">
          <div class="stat-header"><span class="stat-label">Metric</span><span class="stat-code">--</span></div>
          <div class="stat-value">...</div>
          <div class="stat-meta">Loading data</div>
        </div>
      `).join('');
    }
  },

  async loadData() {
    try {
      this.data = await API.expenses.dashboard();
      this.render();
    } catch (err) {
      // Demo mode: show mock data when backend unavailable
      this.data = this.getMockData();
      this.render();
      if (err.status !== 0) {
        Toast.show('Could not load dashboard data: ' + err.message, 'error');
      }
    }
  },

  getMockData() {
    const isAdmin = AppState.isAdmin();
    return {
      total: { count: isAdmin ? 48 : 7, total: isAdmin ? 72000 : 9500 },
      byStatus: [
        { status: 'paid', count: isAdmin ? 18 : 2, total: isAdmin ? 48000 : 6200 },
        { status: 'approved', count: isAdmin ? 10 : 1, total: isAdmin ? 24000 : 3300 },
        { status: 'pending', count: isAdmin ? 17 : 3, total: isAdmin ? 45000 : 7500 },
        { status: 'rejected', count: isAdmin ? 3 : 1, total: isAdmin ? 7500 : 1200 },
      ],
      byCategory: [
        { name: 'Travel', count: isAdmin ? 16 : 2, total: isAdmin ? 45000 : 8000 },
        { name: 'Accommodation', count: isAdmin ? 10 : 2, total: isAdmin ? 32000 : 5500 },
        { name: 'Meals & Entertainment', count: isAdmin ? 8 : 2, total: isAdmin ? 18000 : 3200 },
        { name: 'Office Supplies', count: isAdmin ? 6 : 1, total: isAdmin ? 12000 : 900 },
        { name: 'Software & Subscriptions', count: isAdmin ? 8 : 0, total: isAdmin ? 17500 : 600 },
      ],
      recent: [
        { id: 'demo1', description: 'Q4 Conference Travel', amount: 4200, status: 'pending', category_name: 'Travel', expense_date: '2026-09-28', submitter_name: AppState.user?.name || 'Demo User' },
        { id: 'demo2', description: 'Team Dinner', amount: 680, status: 'approved', category_name: 'Meals & Entertainment', expense_date: '2026-09-25', submitter_name: AppState.user?.name || 'Demo User' },
        { id: 'demo3', description: 'Hotel: NYC', amount: 1850, status: 'approved', category_name: 'Accommodation', expense_date: '2026-09-20', submitter_name: 'Jane Smith' },
        { id: 'demo4', description: 'Office Supplies', amount: 320, status: 'pending', category_name: 'Office Supplies', expense_date: '2026-09-18', submitter_name: AppState.user?.name || 'Demo User' },
        { id: 'demo5', description: 'Figma Subscription', amount: 144, status: 'rejected', category_name: 'Software & Subscriptions', expense_date: '2026-09-15', submitter_name: 'Alex Lee' },
      ],
      topSpenders: isAdmin ? [
        { name: 'Alice Johnson', role: 'employee', count: 8, total: 28000 },
        { name: 'Bob Williams', role: 'employee', count: 6, total: 19500 },
        { name: 'Jane Smith', role: 'employee', count: 5, total: 14200 },
        { name: 'Alex Lee', role: 'employee', count: 4, total: 9800 },
        { name: 'Mark Chen', role: 'employee', count: 5, total: 8900 },
      ] : []
    };
  },

  render() {
    const sym = AppState.company?.currency_symbol || '₹';
    const { total, byStatus, byCategory, recent, topSpenders } = this.data;

    const statusMap = {};
    (byStatus || []).forEach(s => { statusMap[s.status] = s; });

    const approvedCount = (statusMap.approved?.count || 0) + (statusMap.paid?.count || 0);
    const approvedTotal = (statusMap.approved?.total || 0) + (statusMap.paid?.total || 0);

    // ── Stats cards ────────────────────────────────────────
    const statsEl = document.getElementById('dashboard-stats');
    if (statsEl) {
      statsEl.innerHTML = `
        <div class="stat-card">
          <div class="stat-header">
            <span class="stat-label">Total Claims</span>
            <div class="stat-icon-wrap stat-icon-blue">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>
            </div>
          </div>
          <div class="stat-value">${total?.count || 0}</div>
          <div class="stat-meta">
            <span class="stat-trend stat-trend-up">Active</span>
            <span>Recorded in ledger</span>
          </div>
        </div>
        <div class="stat-card">
          <div class="stat-header">
            <span class="stat-label">Approved & Paid</span>
            <div class="stat-icon-wrap stat-icon-green">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
            </div>
          </div>
          <div class="stat-value">${approvedCount}</div>
          <div class="stat-meta">
            <span class="stat-trend stat-trend-up">Cleared</span>
            <span>Approved + Reimbursed</span>
          </div>
        </div>
        <div class="stat-card">
          <div class="stat-header">
            <span class="stat-label">Pending Approval</span>
            <div class="stat-icon-wrap stat-icon-amber">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
            </div>
          </div>
          <div class="stat-value">${(statusMap.pending?.count || 0) + (statusMap.in_review?.count || 0)}</div>
          <div class="stat-meta">
            <span class="stat-trend stat-trend-neutral">Pending</span>
            <span>Awaiting admin approval</span>
          </div>
        </div>
        <div class="stat-card">
          <div class="stat-header">
            <span class="stat-label">Total Spend</span>
            <div class="stat-icon-wrap stat-icon-purple">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>
            </div>
          </div>
          <div class="stat-value">${sym}${(approvedTotal / 1000).toFixed(1)}k</div>
          <div class="stat-meta">
            <span class="stat-trend stat-trend-up">Approved</span>
            <span>Approved & Paid spend</span>
          </div>
        </div>
      `;
    }

    // ── Donut chart: by status ─────────────────────────────
    const statusColors = {
      paid: '#059669',         // Deep emerald for reimbursed
      approved: '#10b981',     // Vibrant emerald
      pending: '#f59e0b',      // Amber for pending approval
      rejected: '#ef4444',     // Rose
    };

    const donutSegments = (byStatus || [])
      .filter(s => s.status !== 'in_review')
      .map(s => ({
        value: s.count,
        color: statusColors[s.status] || '#64748b',
        label: s.status === 'pending' ? 'Pending Approval' : s.status
      }));

    Charts.donut('donut-status', donutSegments, { size: 160, thickness: 22 });

    const legendEl = document.getElementById('status-legend');
    if (legendEl) {
      legendEl.innerHTML = (byStatus || [])
        .filter(s => s.status !== 'in_review')
        .map(s => `
        <div class="legend-item">
          <span class="legend-label">
            <span class="legend-dot" style="background:${statusColors[s.status] || '#64748b'}"></span>
            ${s.status === 'pending' ? 'Pending Approval' : s.status.replace('_', ' ')}
          </span>
          <span class="legend-value">${s.count}</span>
        </div>
      `).join('');
    }

    const donutCenterEl = document.getElementById('donut-total');
    if (donutCenterEl) donutCenterEl.textContent = total?.count || 0;

    // ── Bar chart: by category ────────────────────────────
    const catEl = document.getElementById('category-bars');
    if (catEl) {
      const maxTotal = Math.max(...(byCategory || []).map(c => c.total), 1);
      catEl.innerHTML = (byCategory || []).slice(0, 5).map(c => {
        const pct = Math.round((c.total / maxTotal) * 100);
        return `
          <div class="bar-row">
            <span class="bar-label" title="${c.name}">${c.name}</span>
            <div class="bar-track">
              <div class="bar-fill" data-width="${pct}%" style="width:0%"></div>
            </div>
            <span class="bar-amount">${sym}${(c.total / 1000).toFixed(1)}k</span>
          </div>
        `;
      }).join('');
      Charts.animateBars('#category-bars');
    }

    // ── Recent Expenses ───────────────────────────────────
    const recentEl = document.getElementById('recent-expenses-body');
    if (recentEl) {
      if (!recent?.length) {
        recentEl.innerHTML = `<tr><td colspan="5" class="text-center" style="padding:40px;color:var(--text-muted)">No expenses yet</td></tr>`;
      } else {
        recentEl.innerHTML = recent.map(exp => `
          <tr onclick="Router.navigate('expense-detail', { id: '${exp.id}' })" style="cursor:pointer">
            <td>
              <div style="font-weight:600;font-size:0.875rem">${exp.description}</div>
              <div style="font-size:0.75rem;color:var(--text-muted)">${exp.submitter_name} • Incurred ${UI.formatDate(exp.expense_date)}</div>
            </td>
            <td><span class="expense-category-tag">${exp.category_name}</span></td>
            <td class="expense-amount">${UI.formatCurrency(exp.amount, AppState.company?.currency_code, sym)}</td>
            <td>${UI.statusBadge(exp.status, exp.utr_number)}</td>
            <td>
              <div class="expense-date" style="font-weight:600">${UI.formatDate(exp.created_at || exp.expense_date)}</div>
              <div style="font-size:0.72rem;color:var(--text-muted);font-family:var(--font-mono)">${UI.relativeTime(exp.created_at)}</div>
            </td>
          </tr>
        `).join('');
      }
    }

    // ── Top Spenders (Admin only) ─────────────────────────
    const spendersEl = document.getElementById('top-spenders');
    if (spendersEl) {
      if (!topSpenders?.length) {
        spendersEl.innerHTML = `<div class="empty-state" style="padding:24px"><p>No data yet</p></div>`;
      } else {
        spendersEl.innerHTML = topSpenders.map((s, i) => `
          <div class="spender-item">
            <div class="spender-rank ${i === 0 ? 'top-1' : ''}">${i + 1}</div>
            <div class="spender-avatar">${UI.initials(s.name)}</div>
            <div class="spender-info">
              <div class="spender-name">${s.name}</div>
              <div class="spender-count">${s.count} approved claim${s.count !== 1 ? 's' : ''}</div>
            </div>
            <div class="spender-total">${sym}${(s.total / 1000).toFixed(1)}k</div>
          </div>
        `).join('');
      }
    }
  }
};

// Register route
Router.register('dashboard', () => Dashboard.init());
