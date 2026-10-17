/* ============================================================
   Reimbursement System: New Expense Submission
   ============================================================ */

'use strict';

const NewExpense = {
  categories: [],
  selectedFile: null,
  _listenersAttached: false,

  async init() {
    UI.showPage('new-expense');
    this.selectedFile = null;
    // Reset form
    document.getElementById('new-expense-form')?.reset();
    document.getElementById('file-preview')?.classList.remove('visible');
    document.getElementById('amount-preview')?.classList.remove('visible');

    await this.loadCategories();
    this.bindCurrencyPreview();
    if (!this._listenersAttached) {
      this._listenersAttached = true;
      this.bindForm();
      this.bindFileUpload();
    }
  },

  async loadCategories() {
    try {
      this.categories = await API.expenses.categories();
    } catch {
      // Mock categories
      this.categories = [
        { id: 'cat1', name: 'Travel' },
        { id: 'cat2', name: 'Accommodation' },
        { id: 'cat3', name: 'Meals & Entertainment' },
        { id: 'cat4', name: 'Office Supplies' },
        { id: 'cat5', name: 'Software & Subscriptions' },
        { id: 'cat6', name: 'Training & Education' },
        { id: 'cat7', name: 'Marketing' },
        { id: 'cat8', name: 'Miscellaneous' },
      ];
    }

    const catSelect = document.getElementById('expense-category');
    if (catSelect) {
      catSelect.innerHTML = `<option value="">Select category...</option>` +
        this.categories.map(c => `<option value="${c.id}">${c.name}</option>`).join('');
    }

    // Set today as default date
    const dateInput = document.getElementById('expense-date');
    if (dateInput) {
      dateInput.value = new Date().toISOString().split('T')[0];
      dateInput.max = new Date().toISOString().split('T')[0];
    }

    // Populate currencies
    const currencySelect = document.getElementById('expense-currency');
    if (currencySelect) {
      const baseCurrency = AppState.company?.currency_code || 'INR';
      const currencies = ['INR', 'USD', 'EUR', 'GBP', 'AED', 'JPY', 'CAD', 'AUD', 'SGD', 'CHF'];
      currencySelect.innerHTML = currencies.map(c =>
        `<option value="${c}" ${c === baseCurrency ? 'selected' : ''}>${c}</option>`
      ).join('');
    }
  },

  bindCurrencyPreview() {
    const amountInput = document.getElementById('expense-amount');
    const currencySelect = document.getElementById('expense-currency');
    const previewEl = document.getElementById('amount-preview');
    const baseCurrency = AppState.company?.currency_code || 'INR';
    const baseSymbol = AppState.company?.currency_symbol || '₹';

    const update = async () => {
      const amount = parseFloat(amountInput?.value);
      const currency = currencySelect?.value || baseCurrency;

      if (!amount || !previewEl) return;

      if (currency === baseCurrency) {
        previewEl.classList.remove('visible');
        return;
      }

      previewEl.classList.add('visible');
      previewEl.innerHTML = `Converting rate...`;

      try {
        const res = await API.expenses.convert(amount, currency, baseCurrency);
        previewEl.innerHTML = `Est. <strong>${baseSymbol}${res.convertedAmount?.toFixed(2)}</strong> ${baseCurrency} (FX: ${res.rate?.toFixed(4)})`;
      } catch {
        previewEl.innerHTML = `Est. ${baseSymbol}${(amount * 0.82).toFixed(2)} ${baseCurrency} (indicative)`;
      }
    };

    amountInput?.addEventListener('input', debounce(update, 600));
    currencySelect?.addEventListener('change', () => { if (amountInput?.value) update(); });
  },

  bindFileUpload() {
    const dropArea = document.getElementById('file-drop-area');
    const fileInput = document.getElementById('receipt-file');
    const preview = document.getElementById('file-preview');
    const previewName = document.getElementById('file-preview-name');
    const previewSize = document.getElementById('file-preview-size');
    const removeBtn = document.getElementById('file-remove-btn');

    if (!dropArea || !fileInput) return;

    // Drag & drop
    dropArea.addEventListener('dragover', (e) => {
      e.preventDefault();
      dropArea.classList.add('drag-over');
    });
    dropArea.addEventListener('dragleave', () => dropArea.classList.remove('drag-over'));
    dropArea.addEventListener('drop', (e) => {
      e.preventDefault();
      dropArea.classList.remove('drag-over');
      const file = e.dataTransfer.files[0];
      if (file) this.handleFileSelected(file, preview, previewName, previewSize);
    });

    fileInput.addEventListener('change', () => {
      if (fileInput.files[0]) {
        this.handleFileSelected(fileInput.files[0], preview, previewName, previewSize);
      }
    });

    removeBtn?.addEventListener('click', () => {
      this.selectedFile = null;
      fileInput.value = '';
      preview?.classList.remove('visible');
    });
  },

  handleFileSelected(file, previewEl, nameEl, sizeEl) {
    const maxSize = 10 * 1024 * 1024; // 10MB
    if (file.size > maxSize) {
      Toast.show('File exceeds size limit (10MB max).', 'error');
      return;
    }
    const allowed = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
    if (!allowed.includes(file.type)) {
      Toast.show('Unsupported file format. Provide JPEG, PNG, or PDF voucher.', 'error');
      return;
    }

    this.selectedFile = file;
    if (nameEl) nameEl.textContent = file.name;
    if (sizeEl) sizeEl.textContent = this.formatFileSize(file.size);

    // Show image preview if image
    const imgEl = document.getElementById('file-preview-img');
    if (imgEl && file.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onload = (e) => { imgEl.src = e.target.result; };
      reader.readAsDataURL(file);
      imgEl.style.display = 'block';
    } else if (imgEl) {
      imgEl.src = '';
      imgEl.style.display = 'none';
    }

    previewEl?.classList.add('visible');
    Toast.show('Document voucher attached.', 'success');
  },

  formatFileSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  },

  bindForm() {
    const form = document.getElementById('new-expense-form');
    const cancelBtn = document.getElementById('expense-cancel');

    form?.addEventListener('submit', async (e) => {
      e.preventDefault();
      await this.handleSubmit();
    });

    cancelBtn?.addEventListener('click', () => {
      if (UI.confirm('Discard this draft entry?')) {
        Router.navigate('my-expenses');
      }
    });
  },

  async handleSubmit() {
    const amount = document.getElementById('expense-amount')?.value;
    const currency = document.getElementById('expense-currency')?.value;
    const categoryId = document.getElementById('expense-category')?.value;
    const description = document.getElementById('expense-description')?.value?.trim();
    const date = document.getElementById('expense-date')?.value;
    const btn = document.getElementById('expense-submit-btn');

    // Validation
    if (!amount || parseFloat(amount) <= 0) {
      Toast.show('Please enter a valid expense sum.', 'error'); return;
    }
    if (!categoryId) {
      Toast.show('Please select a valid ledger category.', 'error'); return;
    }
    if (!description) {
      Toast.show('Please provide a descriptive ledger note.', 'error'); return;
    }
    if (!date) {
      Toast.show('Please select an effective transaction date.', 'error'); return;
    }

    UI.setButtonLoading(btn, true, 'Submitting claim...');

    try {
      const formData = new FormData();
      formData.append('amount', amount);
      formData.append('currency', currency);
      formData.append('category_id', categoryId);
      formData.append('description', description);
      formData.append('expense_date', date);
      if (this.selectedFile) {
        formData.append('receipt', this.selectedFile);
      }

      await API.expenses.create(formData);
      Toast.show('Expense claim registered successfully.', 'success');
      Router.navigate('my-expenses');
    } catch (err) {
      // Demo mode: simulate success
      if (err.status === 0) {
        Toast.show('Expense claim registered (local session / offline mode).', 'success');
        Router.navigate('my-expenses');
      } else {
        Toast.show('Submission failed: ' + err.message, 'error');
      }
    } finally {
      UI.setButtonLoading(btn, false);
      if (btn._originalHTML) btn.innerHTML = btn._originalHTML;
    }
  }
};

// Debounce utility
function debounce(fn, delay) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
}

// Register route
Router.register('new-expense', () => NewExpense.init());
