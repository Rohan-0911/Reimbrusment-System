/* ============================================================
   Reimbursement System: New Expense Submission (with Gemini AI Auto-Fill)
   ============================================================ */

'use strict';

const NewExpense = {
  categories: [],
  selectedFile: null,
  aiData: null,
  _listenersAttached: false,

  async init() {
    UI.showPage('new-expense');
    this.selectedFile = null;
    this.aiData = null;

    // Reset form & UI states
    document.getElementById('new-expense-form')?.reset();
    document.getElementById('file-preview')?.classList.remove('visible');
    document.getElementById('amount-preview')?.classList.remove('visible');
    
    const scanLoading = document.getElementById('ai-scan-loading');
    if (scanLoading) scanLoading.style.display = 'none';

    const authCard = document.getElementById('ai-authenticity-card');
    if (authCard) authCard.style.display = 'none';

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
      this.aiData = null;
      fileInput.value = '';
      preview?.classList.remove('visible');
      
      const scanLoading = document.getElementById('ai-scan-loading');
      if (scanLoading) scanLoading.style.display = 'none';

      const authCard = document.getElementById('ai-authenticity-card');
      if (authCard) authCard.style.display = 'none';
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

    // Trigger Gemini AI scanning for automatic extraction & fraud verification
    this.triggerAiScan(file);
  },

  async triggerAiScan(file) {
    const scanLoading = document.getElementById('ai-scan-loading');
    const authCard = document.getElementById('ai-authenticity-card');

    if (scanLoading) scanLoading.style.display = 'flex';
    if (authCard) authCard.style.display = 'none';

    try {
      const result = await API.expenses.scanReceipt(file);
      this.aiData = result;

      // Auto-fill form fields
      this.applyAiDataToForm(result);

      // Render AI Authenticity preview card
      this.renderAiAuthenticityCard(result);

      Toast.show('✨ Gemini AI scanned receipt! Fields auto-filled (you can edit anytime).', 'success');
    } catch (err) {
      console.warn('[AI Scan] Scan failed or service unreachable:', err);
      Toast.show('Receipt attached. You can manually fill or review the fields.', 'info');
    } finally {
      if (scanLoading) scanLoading.style.display = 'none';
    }
  },

  applyAiDataToForm(ai) {
    if (!ai) return;
    console.log('[AI Auto-Fill] Applying extracted receipt data:', ai);

    // 1. Amount: check all possible keys and clean any currency formatting
    const amountInput = document.getElementById('expense-amount');
    const rawAmount = ai.amount !== undefined && ai.amount !== null && ai.amount !== '' ? ai.amount :
                      ai.total !== undefined && ai.total !== null && ai.total !== '' ? ai.total :
                      ai.total_amount !== undefined && ai.total_amount !== null && ai.total_amount !== '' ? ai.total_amount :
                      ai.grand_total !== undefined && ai.grand_total !== null && ai.grand_total !== '' ? ai.grand_total :
                      ai.total_payable !== undefined && ai.total_payable !== null && ai.total_payable !== '' ? ai.total_payable :
                      ai.payable_amount !== undefined && ai.payable_amount !== null && ai.payable_amount !== '' ? ai.payable_amount :
                      ai.bill_amount !== undefined && ai.bill_amount !== null && ai.bill_amount !== '' ? ai.bill_amount : null;

    if (amountInput && rawAmount !== null) {
      let num = typeof rawAmount === 'number' ? rawAmount : parseFloat(String(rawAmount).replace(/[^0-9.]/g, ''));
      if (!isNaN(num) && num > 0) {
        amountInput.value = num;
        this.flashField(amountInput);
        amountInput.dispatchEvent(new Event('input', { bubbles: true }));
        amountInput.dispatchEvent(new Event('change', { bubbles: true }));
      }
    }

    // 2. Currency
    const currencySelect = document.getElementById('expense-currency');
    if (currencySelect && ai.currency) {
      const cur = ai.currency.toUpperCase().trim();
      const optionExists = Array.from(currencySelect.options).some(o => o.value === cur);
      if (optionExists) {
        currencySelect.value = cur;
        this.flashField(currencySelect);
        currencySelect.dispatchEvent(new Event('change', { bubbles: true }));
      }
    }

    // 3. Date
    const dateInput = document.getElementById('expense-date');
    if (dateInput && ai.date) {
      // Validate or standardize date YYYY-MM-DD
      const parsedDate = new Date(ai.date);
      if (!isNaN(parsedDate.getTime())) {
        const yyyy = parsedDate.getFullYear();
        const mm = String(parsedDate.getMonth() + 1).padStart(2, '0');
        const dd = String(parsedDate.getDate()).padStart(2, '0');
        dateInput.value = `${yyyy}-${mm}-${dd}`;
        this.flashField(dateInput);
        dateInput.dispatchEvent(new Event('input', { bubbles: true }));
      }
    }

    // 4. Description / Merchant
    const descInput = document.getElementById('expense-description');
    if (descInput) {
      let desc = '';
      if (ai.merchant_name && ai.description && ai.merchant_name !== ai.description) {
        desc = `${ai.merchant_name} - ${ai.description}`;
      } else if (ai.merchant_name) {
        desc = ai.merchant_name;
      } else if (ai.description) {
        desc = ai.description;
      }
      if (desc) {
        descInput.value = desc;
        this.flashField(descInput);
        descInput.dispatchEvent(new Event('input', { bubbles: true }));
      }
    }

    // 5. Category (Fuzzy match suggested category)
    const catSelect = document.getElementById('expense-category');
    if (catSelect && ai.suggested_category && this.categories.length) {
      const target = ai.suggested_category.toLowerCase();
      const match = this.categories.find(c => {
        const cname = c.name.toLowerCase();
        return cname === target || cname.includes(target) || target.includes(cname);
      });
      if (match) {
        catSelect.value = match.id;
        this.flashField(catSelect);
        catSelect.dispatchEvent(new Event('change', { bubbles: true }));
      }
    }

    // Force currency preview recalculation
    if (amountInput && amountInput.value) {
      amountInput.dispatchEvent(new Event('input', { bubbles: true }));
    }
  },

  flashField(element) {
    element.classList.remove('field-autofilled');
    // Trigger reflow to restart animation
    void element.offsetWidth;
    element.classList.add('field-autofilled');
  },

  renderAiAuthenticityCard(ai) {
    const card = document.getElementById('ai-authenticity-card');
    const badgeEl = document.getElementById('ai-auth-score-badge');
    const reasonEl = document.getElementById('ai-auth-reason');
    const tagsEl = document.getElementById('ai-auth-meta-tags');

    if (!card) return;

    if (badgeEl) {
      badgeEl.innerHTML = UI.authenticityBadge(ai.authenticity_score, ai.authenticity_status);
    }

    if (reasonEl) {
      reasonEl.textContent = ai.authenticity_reason || 'Document structure and metadata verified successfully.';
    }

    if (tagsEl) {
      const tags = [];
      if (ai.merchant_name) {
        tags.push(`<span class="ai-auth-tag">Vendor: <strong>${ai.merchant_name}</strong></span>`);
      }
      if (ai.invoice_or_tax_id) {
        tags.push(`<span class="ai-auth-tag">Tax/Invoice: <strong>${ai.invoice_or_tax_id}</strong></span>`);
      }
      if (ai.suggested_category) {
        tags.push(`<span class="ai-auth-tag">Category: <strong>${ai.suggested_category}</strong></span>`);
      }
      if (ai.tax_amount) {
        tags.push(`<span class="ai-auth-tag">Tax: <strong>${ai.currency || ''} ${ai.tax_amount}</strong></span>`);
      }
      tagsEl.innerHTML = tags.join('');
    }

    card.style.display = 'block';
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

      // If AI extracted data is available, attach authenticity scoring and OCR metadata
      if (this.aiData) {
        if (this.aiData.authenticity_score !== undefined && this.aiData.authenticity_score !== null) {
          formData.append('ai_authenticity_score', this.aiData.authenticity_score);
        }
        if (this.aiData.authenticity_status) {
          formData.append('ai_authenticity_status', this.aiData.authenticity_status);
        }
        if (this.aiData.authenticity_reason) {
          formData.append('ai_authenticity_reason', this.aiData.authenticity_reason);
        }
        formData.append('ai_extracted_data', JSON.stringify(this.aiData));
        if (this.aiData.ocr_text) {
          formData.append('receipt_ocr_text', this.aiData.ocr_text);
        }
      }

      await API.expenses.create(formData);
      Toast.show('Expense claim registered successfully with Gemini audit record.', 'success');
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
