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
    sortBy: 'submission_desc'
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
    this.filters = { search: '', status: '', sortBy: 'submission_desc', category: '' };
    const pageId = this.mode === 'all' ? 'all-expenses' : 'my-expenses';
    const searchEl = document.getElementById(`${pageId}-search`);
    if (searchEl) searchEl.value = '';
    const statusEl = document.getElementById(`${pageId}-status`);
    if (statusEl) statusEl.value = '';
    const sortEl = document.getElementById(`${pageId}-sort`);
    if (sortEl) sortEl.value = 'submission_desc';
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
    const statuses = ['paid', 'approved', 'rejected', 'in_review', 'pending'];
    const names = ['Alice Johnson', 'Bob Williams', 'Jane Smith', AppState.user?.name || 'You'];

    return Array.from({ length: 15 }, (_, i) => {
      const st = statuses[i % statuses.length];
      return {
        id: `mock-${i + 1}`,
        description: ['Q4 Conference Travel', 'Team Dinner', 'Hotel NYC', 'Office Supplies', 'Figma License', 'Flight - Mumbai', 'Client Lunch', 'Laptop Stand', 'AWS Credits', 'Training Course'][i % 10],
        amount: [4200, 680, 1850, 320, 144, 3100, 540, 220, 980, 1500][i % 10],
        original_amount: [4200, 680, 1850, 320, 144, 3100, 540, 220, 980, 1500][i % 10],
        original_currency: AppState.company?.currency_code || 'INR',
        status: st,
        payout_status: st === 'paid' ? 'paid' : 'unpaid',
        utr_number: st === 'paid' ? `HDFC${10029384 + i}` : null,
        paid_at: st === 'paid' ? new Date(Date.now() - i * 86400000).toISOString() : null,
        is_duplicate: i === 4,
        duplicate_of: i === 4 ? 'mock-1' : null,
        ai_authenticity_score: i === 4 ? 15 : (95 - (i * 5)),
        ai_authenticity_status: i === 4 ? 'SUSPICIOUS' : ((95 - (i * 5)) >= 80 ? 'GENUINE' : 'NEEDS_REVIEW'),
        category_name: cats[i % cats.length],
        expense_date: new Date(Date.now() - i * 3 * 86400000).toISOString().split('T')[0],
        submitter_name: names[i % names.length],
        created_at: new Date(Date.now() - i * 3 * 86400000).toISOString(),
        has_receipt: i % 3 === 0,
      };
    });
  },

  async exportCSV() {
    Toast.show('Generating CSV export...', 'info');
    try {
      await API.expenses.downloadExport(this.filters.search, this.filters.status);
      Toast.show('CSV ledger exported successfully.', 'success');
    } catch (err) {
      console.warn('[CSV Export] API export failed or offline, generating from client ledger:', err);
      this.generateClientCSV();
    }
  },

  generateClientCSV() {
    const list = this.filtered.length ? this.filtered : this.expenses;
    if (!list.length) {
      Toast.show('No records available to export.', 'warning');
      return;
    }
    const headers = [
      'Claim ID', 'Submission Date', 'Expense Date', 'Employee Name',
      'Description', 'Category', 'Claimed Amount', 'Claimed Currency', 'Approval Status',
      'Payout Status', 'Bank UTR / Ref Number', 'AI Authenticity Score', 'Duplicate Detected'
    ];
    const rows = list.map(e => [
      `"${e.id || ''}"`,
      `"${e.created_at ? e.created_at.slice(0, 10) : ''}"`,
      `"${e.expense_date || ''}"`,
      `"${(e.submitter_name || '').replace(/"/g, '""')}"`,
      `"${(e.description || '').replace(/"/g, '""')}"`,
      `"${(e.category_name || '').replace(/"/g, '""')}"`,
      e.amount || 0,
      `"${e.original_currency || AppState.company?.currency_code || 'INR'}"`,
      `"${(e.status || '').toUpperCase()}"`,
      `"${(e.payout_status || (e.status === 'paid' ? 'paid' : 'unpaid')).toUpperCase()}"`,
      `"${e.utr_number || ''}"`,
      `"${e.ai_authenticity_score !== undefined && e.ai_authenticity_score !== null ? e.ai_authenticity_score + '%' : 'N/A'}"`,
      `"${e.is_duplicate || e.duplicate_of ? 'YES (DUPLICATE)' : 'NO'}"`
    ]);

    const csvContent = '\ufeff' + [headers.join(','), ...rows.map(r => r.join(','))].join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `reimbursement_ledger_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    Toast.show('CSV ledger downloaded successfully.', 'success');
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

    const getSubmissionTime = (e) => {
      const d = e.created_at || e.expense_date;
      return d ? new Date(d).getTime() : 0;
    };
    const getIncurredTime = (e) => {
      const d = e.expense_date || e.created_at;
      return d ? new Date(d).getTime() : 0;
    };

    if (this.filters.sortBy === 'submission_desc' || this.filters.sortBy === 'date_desc') {
      list.sort((a, b) => getSubmissionTime(b) - getSubmissionTime(a));
    } else if (this.filters.sortBy === 'submission_asc' || this.filters.sortBy === 'date_asc') {
      list.sort((a, b) => getSubmissionTime(a) - getSubmissionTime(b));
    } else if (this.filters.sortBy === 'incurred_desc' || this.filters.sortBy === 'expense_date_desc') {
      list.sort((a, b) => getIncurredTime(b) - getIncurredTime(a));
    } else if (this.filters.sortBy === 'incurred_asc' || this.filters.sortBy === 'expense_date_asc') {
      list.sort((a, b) => getIncurredTime(a) - getIncurredTime(b));
    } else if (this.filters.sortBy === 'amount_desc') {
      list.sort((a, b) => (b.amount || 0) - (a.amount || 0));
    } else if (this.filters.sortBy === 'amount_asc') {
      list.sort((a, b) => (a.amount || 0) - (b.amount || 0));
    } else {
      // Default: sort by date of expense submission
      list.sort((a, b) => getSubmissionTime(b) - getSubmissionTime(a));
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
          <div style="font-size:0.75rem;font-family:var(--font-mono);color:var(--text-muted)">Incurred: ${UI.formatDate(exp.expense_date)}</div>
          ${exp.is_duplicate || exp.duplicate_of ? `<span class="badge-duplicate" title="Conflicting duplicate receipt detected">DUPLICATE</span>` : ''}
        </td>
        ${showSubmitter ? `<td><div style="font-size:0.875rem">${exp.submitter_name || 'N/A'}</div></td>` : ''}
        <td><span class="expense-category-tag">${exp.category_name || 'Uncategorized'}</span></td>
        <td>
          <span class="expense-amount">${UI.formatCurrency(exp.amount, AppState.company?.currency_code, sym)}</span>
          ${exp.original_currency && exp.original_currency !== AppState.company?.currency_code
        ? `<div class="expense-currency">${exp.original_amount} ${exp.original_currency}</div>`
        : ''}
        </td>
        <td>${UI.statusBadge(exp.status, exp.utr_number)}</td>
        <td>
          <div class="expense-date" style="font-weight:600">${UI.formatDate(exp.created_at || exp.expense_date)}</div>
          <div style="font-size:0.72rem;font-family:var(--font-mono);color:var(--text-muted)">${UI.relativeTime(exp.created_at)}</div>
        </td>
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
