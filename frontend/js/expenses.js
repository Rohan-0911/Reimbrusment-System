/* ============================================================
   Reimbursement System: Expenses Ledger (Employee and Admin Views)
   ============================================================ */

'use strict';

const Expenses = {
  expenses: [],
  filtered: [],
  mode: 'my', // 'my' or 'all'

  filters: {
    search: '',
    status: '',
    category: '',
    sortBy: 'date_desc'
  },

  async init(mode = 'my') {
    this.mode = mode;
    const pageId = mode === 'all' ? 'all-expenses' : 'my-expenses';
    UI.showPage(pageId);
    this.expenses = [];
    this.filtered = [];
    this.resetFilters();
    this.renderLoading(pageId);
    await this.loadData();
  },

  resetFilters() {
    this.filters = { search: '', status: '', sortBy: 'date_desc', category: '' };
    const fields = ['expense-search', 'expense-filter-status', 'expense-sort'];
    fields.forEach(id => {
      const el = document.getElementById(id);
      if (el) el.value = '';
    });
  },

  renderLoading(pageId) {
    const tbody = document.getElementById(`${pageId}-tbody`);
    if (tbody) {
      tbody.innerHTML = `
        <tr>
          <td colspan="7" style="text-align:center;padding:32px;font-family:var(--font-mono);font-size:0.8125rem;color:var(--text-muted)">
            Loading expense ledger records...
          </td>
        </tr>
      `;
    }
  },

  async loadData() {
    try {
      this.expenses = await API.expenses.list();
    } catch {
      // Mock data
      this.expenses = this.getMockExpenses();
    }
    this.applyFilters();
    this.renderTable();
    this.bindFilterEvents();
  },

  getMockExpenses() {
    const cats = ['Travel', 'Accommodation', 'Meals & Entertainment', 'Office Supplies', 'Software & Subscriptions'];
    const statuses = ['approved', 'rejected', 'in_review', 'pending'];
    const names = ['Alice Johnson', 'Bob Williams', 'Jane Smith', AppState.user?.name || 'You'];

    return Array.from({ length: 15 }, (_, i) => ({
      id: `mock-${i + 1}`,
      description: ['Q4 Conference Travel', 'Team Dinner', 'Hotel NYC', 'Office Supplies', 'Figma License', 'Flight - Mumbai', 'Client Lunch', 'Laptop Stand', 'AWS Credits', 'Training Course'][i % 10],
      amount: [4200, 680, 1850, 320, 144, 3100, 540, 220, 980, 1500][i % 10],
      original_amount: [4200, 680, 1850, 320, 144, 3100, 540, 220, 980, 1500][i % 10],
      original_currency: AppState.company?.currency_code || 'INR',
      status: statuses[i % statuses.length],
      category_name: cats[i % cats.length],
      expense_date: new Date(Date.now() - i * 3 * 86400000).toISOString().split('T')[0],
      submitter_name: names[i % names.length],
      created_at: new Date(Date.now() - i * 3 * 86400000).toISOString(),
      has_receipt: i % 3 === 0,
    }));
  },

  bindFilterEvents() {
    const pageId = this.mode === 'all' ? 'all-expenses' : 'my-expenses';

    const searchEl = document.getElementById(`${pageId}-search`);
    if (searchEl) {
      searchEl.addEventListener('input', () => {
        this.filters.search = searchEl.value.toLowerCase();
        this.applyFilters();
        this.renderTable();
      });
    }

    const statusEl = document.getElementById(`${pageId}-status`);
    if (statusEl) {
      statusEl.addEventListener('change', () => {
        this.filters.status = statusEl.value;
        this.applyFilters();
        this.renderTable();
      });
    }

    const sortEl = document.getElementById(`${pageId}-sort`);
    if (sortEl) {
      sortEl.addEventListener('change', () => {
        this.filters.sortBy = sortEl.value;
        this.applyFilters();
        this.renderTable();
      });
    }
  },

  applyFilters() {
    let list = [...this.expenses];

    if (this.filters.search) {
      list = list.filter(e =>
        e.description?.toLowerCase().includes(this.filters.search) ||
        e.category_name?.toLowerCase().includes(this.filters.search) ||
        e.submitter_name?.toLowerCase().includes(this.filters.search)
      );
    }

    if (this.filters.status) {
      list = list.filter(e => e.status === this.filters.status);
    }

    if (this.filters.sortBy === 'date_desc') {
      list.sort((a, b) => new Date(b.expense_date) - new Date(a.expense_date));
    } else if (this.filters.sortBy === 'date_asc') {
      list.sort((a, b) => new Date(a.expense_date) - new Date(b.expense_date));
    } else if (this.filters.sortBy === 'amount_desc') {
      list.sort((a, b) => b.amount - a.amount);
    } else if (this.filters.sortBy === 'amount_asc') {
      list.sort((a, b) => a.amount - b.amount);
    }

    this.filtered = list;
  },

  renderTable() {
    const pageId = this.mode === 'all' ? 'all-expenses' : 'my-expenses';
    const tbody = document.getElementById(`${pageId}-tbody`);
    const countEl = document.getElementById(`${pageId}-count`);
    const sym = AppState.company?.currency_symbol || '₹';

    if (countEl) {
      countEl.textContent = `${this.filtered.length} record${this.filtered.length !== 1 ? 's' : ''}`;
    }

    if (!tbody) return;

    const showSubmitter = this.mode === 'all';
    const totalCols = showSubmitter ? 8 : 7;

    if (!this.filtered.length) {
      tbody.innerHTML = `
        <tr>
          <td colspan="${totalCols}">
            <div class="empty-state">
              <div class="empty-state-code">[NO-RECORDS]</div>
              <h3>No matching expense records</h3>
              <p>Adjust your filter parameters or file a new expense voucher.</p>
            </div>
          </td>
        </tr>
      `;
      return;
    }

    tbody.innerHTML = this.filtered.map(exp => `
      <tr onclick="ExpenseDetail.open('${exp.id}')" style="cursor:pointer">
        <td>
          <div style="font-weight:600;font-size:0.875rem">${exp.description}</div>
          <div style="font-size:0.75rem;font-family:var(--font-mono);color:var(--text-muted)">${UI.relativeTime(exp.created_at)}</div>
        </td>
        ${showSubmitter ? `<td><div style="font-size:0.875rem">${exp.submitter_name || 'N/A'}</div></td>` : ''}
        <td><span class="expense-category-tag">${exp.category_name || 'Uncategorized'}</span></td>
        <td>
          <span class="expense-amount">${UI.formatCurrency(exp.amount, AppState.company?.currency_code, sym)}</span>
          ${exp.original_currency && exp.original_currency !== AppState.company?.currency_code
        ? `<div class="expense-currency">${exp.original_amount} ${exp.original_currency}</div>`
        : ''}
        </td>
        <td>${UI.statusBadge(exp.status)}</td>
        <td class="expense-date">${UI.formatDate(exp.expense_date)}</td>
        <td>${UI.authenticityBadge(exp.ai_authenticity_score, exp.ai_authenticity_status)}</td>
        <td>
          ${exp.has_receipt || exp.receipt_path 
            ? `<span class="expense-receipt-icon has-receipt"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg> Receipt</span>` 
            : `<span class="expense-receipt-icon">None</span>`
          }
        </td>
      </tr>
    `).join('');
  }
};

// Register routes
Router.register('my-expenses', () => Expenses.init('my'));
Router.register('all-expenses', () => Expenses.init('all'));
