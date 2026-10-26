/* ============================================================
   Reimbursement System: Expense Detail View
   ============================================================ */

'use strict';

const ExpenseDetail = {
  currentExpense: null,

  async open(id) {
    UI.showPage('expense-detail');
    this.renderLoading();

    try {
      const data = await API.expenses.get(id);
      this.currentExpense = data.expense;
      this.render(data.expense, data.approvalRequest, data.votes || []);
    } catch {
      // Mock detail
      const mock = this.getMockDetail(id);
      this.currentExpense = mock.expense;
      this.render(mock.expense, mock.approvalRequest, mock.votes);
    }
  },

  getMockDetail(id) {
    const sym = AppState.company?.currency_symbol || '₹';
    return {
      expense: {
        id,
        description: 'Q4 Conference Travel: Ledger Item',
        amount: 4200,
        original_amount: 4200,
        original_currency: AppState.company?.currency_code || 'INR',
        base_currency: AppState.company?.currency_code || 'INR',
        category_name: 'Travel',
        status: 'in_review',
        expense_date: '2026-09-28',
        created_at: new Date(Date.now() - 2 * 86400000).toISOString(),
        submitter_name: AppState.user?.name || 'Demo User',
        receipt_path: null,
        receipt_ocr_text: null,
      },
      approvalRequest: {
        id: 'ar1',
        current_step: 0,
        status: 'pending',
      },
      votes: [],
    };
  },

  renderLoading() {
    const el = document.getElementById('expense-detail-content');
    if (!el) return;
    el.innerHTML = `
      <div class="card" style="padding:32px;text-align:center;color:var(--text-muted);font-family:var(--font-mono);font-size:0.8125rem">
        Loading expense record [ID: REQ-PENDING]...
      </div>
    `;
  },

  render(expense, approvalRequest, votes) {
    const sym = AppState.company?.currency_symbol || '₹';
    const el = document.getElementById('expense-detail-content');
    if (!el) return;

    // Approval steps (simplified for 2 roles: employee and admin)
    const approvalSteps = [
      { role: 'admin', label: 'Admin Audit & Review' },
    ];

    // Determine step status
    const currentStep = approvalRequest?.current_step ?? 0;
    const arStatus = approvalRequest?.status || 'pending';
    const expStatus = expense.status;

    function getStepStatus(i) {
      if (expStatus === 'approved') return 'done';
      if (expStatus === 'rejected') {
        return i < currentStep ? 'done' : (i === currentStep ? 'rejected' : 'pending');
      }
      if (i < currentStep) return 'done';
      if (i === currentStep && expStatus === 'in_review') return 'current';
      return 'pending';
    }

    const stepIcons = {
      done: `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg>`,
      current: `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>`,
      rejected: `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`,
      pending: `<span style="font-size:14px;line-height:1">•</span>`
    };

    const timelineHTML = approvalSteps.map((step, i) => {
      const status = getStepStatus(i);
      const stepVotes = votes.filter(v => v.step === i);
      const approveCount = stepVotes.filter(v => v.vote === 'approve').length;
      const rejectCount = stepVotes.filter(v => v.vote === 'reject').length;

      return `
        <div class="timeline-item">
          <div class="timeline-icon ${status}">${stepIcons[status]}</div>
          <div class="timeline-content">
            <div class="timeline-step">${step.label}</div>
            <div class="timeline-meta">
              ${status === 'done' ? 'Completed review' :
          status === 'current' ? 'Under review' :
            status === 'rejected' ? 'Rejected at this stage' : 'Pending review'}
              ${stepVotes.length ? ' • ' + approveCount + ' approved, ' + rejectCount + ' rejected' : ''}
            </div>
            ${stepVotes.map(v => `
              <div class="timeline-comment">
                <strong>${v.approver_name}</strong>: ${v.vote.toUpperCase()} ${v.comment ? '• "' + v.comment + '"' : ''}
              </div>
            `).join('')}
          </div>
        </div>
      `;
    }).join('');

    // Final outcome
    const finalHTML = expStatus === 'approved'
      ? `<div class="timeline-item">
           <div class="timeline-icon done"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg></div>
           <div class="timeline-content"><div class="timeline-step" style="color:#059669;font-weight:700">Fully Approved</div></div>
         </div>`
      : expStatus === 'rejected'
        ? `<div class="timeline-item">
           <div class="timeline-icon rejected"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></div>
           <div class="timeline-content"><div class="timeline-step" style="color:#dc2626;font-weight:700">Claim Rejected</div></div>
         </div>`
        : '';

    el.innerHTML = `
      <div class="detail-grid">
        <!-- Main info -->
        <div class="detail-main">
          <!-- Header card -->
          <div class="card" style="padding:24px">
            <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:16px;flex-wrap:wrap">
              <div>
                <h2 style="font-size:1.1875rem;margin-bottom:8px;font-weight:700;letter-spacing:-0.01em">${expense.description}</h2>
                <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">
                  ${UI.statusBadge(expense.status)}
                  <span class="expense-category-tag">${expense.category_name}</span>
                  <span style="font-size:0.75rem;color:var(--text-muted);font-family:var(--font-mono)">${UI.formatDate(expense.expense_date)}</span>
                </div>
              </div>
              <div style="text-align:right">
                <div class="detail-amount-display">${UI.formatCurrency(expense.amount, expense.base_currency, sym)}</div>
                ${expense.original_currency !== expense.base_currency
        ? `<div class="detail-amount-secondary">${expense.original_amount} ${expense.original_currency} original</div>`
        : ''}
              </div>
            </div>
          </div>

          <!-- Info grid -->
          <div class="card">
            <div class="section-header">
              <div>
                <span class="section-code">[SEC-01]</span>
                <h3 class="section-title">Ledger Entry Metadata</h3>
              </div>
            </div>
            <div class="detail-info-grid">
              <div>
                <div class="detail-field-label">SUBMITTER</div>
                <div class="detail-field-value">${expense.submitter_name}</div>
              </div>
              <div>
                <div class="detail-field-label">SUBMITTED ON</div>
                <div class="detail-field-value" style="font-family:var(--font-mono)">${UI.formatDate(expense.created_at)}</div>
              </div>
              <div>
                <div class="detail-field-label">EXPENSE CATEGORY</div>
                <div class="detail-field-value">${expense.category_name}</div>
              </div>
              <div>
                <div class="detail-field-label">TRANSACTION DATE</div>
                <div class="detail-field-value" style="font-family:var(--font-mono)">${UI.formatDate(expense.expense_date)}</div>
              </div>
              <div>
                <div class="detail-field-label">BASE CONVERTED VALUE</div>
                <div class="detail-field-value" style="font-family:var(--font-mono);font-weight:700">
                  ${UI.formatCurrency(expense.amount, expense.base_currency, sym)}
                </div>
              </div>
              <div>
                <div class="detail-field-label">SUBMITTED CURRENCY & SUM</div>
                <div class="detail-field-value" style="font-family:var(--font-mono)">${expense.original_amount} ${expense.original_currency}</div>
              </div>
            </div>
          </div>

          <!-- AI Authenticity & Fraud Audit Card (Visible to Employee and Admin) -->
          ${(() => {
            const hasScore = expense.ai_authenticity_score !== null && expense.ai_authenticity_score !== undefined;
            let extracted = {};
            if (expense.ai_extracted_data) {
              try {
                extracted = typeof expense.ai_extracted_data === 'string' ? JSON.parse(expense.ai_extracted_data) : expense.ai_extracted_data;
              } catch (_) {}
            }

            if (!hasScore && !expense.receipt_path) {
              return `
                <div class="card" style="background:#fafafa">
                  <div class="section-header">
                    <div>
                      <span class="section-code">[AI-AUDIT]</span>
                      <h3 class="section-title">AI Receipt Authenticity Verification</h3>
                    </div>
                  </div>
                  <p style="font-size:0.8125rem;color:var(--text-muted);margin:0">No receipt file was attached to this expense claim. Authenticity scoring is only generated when a voucher or bill is uploaded.</p>
                </div>
              `;
            }

            const score = hasScore ? Math.round(Number(expense.ai_authenticity_score)) : null;
            const statusRaw = (expense.ai_authenticity_status || (score !== null ? (score >= 80 ? 'GENUINE' : score >= 50 ? 'NEEDS_REVIEW' : 'SUSPICIOUS') : 'PENDING')).toUpperCase();
            
            const badgeClass = statusRaw === 'GENUINE' ? 'genuine' : statusRaw === 'SUSPICIOUS' ? 'suspicious' : 'review';
            const statusTitle = statusRaw === 'GENUINE' 
              ? 'Authentic & Validated Voucher' 
              : statusRaw === 'SUSPICIOUS' 
                ? 'Flagged as High Risk / Suspicious' 
                : 'Needs Administrative Review';

            const reason = expense.ai_authenticity_reason || extracted.authenticity_reason || 'AI evaluated receipt clarity, merchant indicators, tax metadata, and tampering signals.';
            const riskFactors = Array.isArray(extracted.risk_factors) ? extracted.risk_factors : [];

            return `
              <div class="ai-audit-card">
                <div class="ai-audit-header">
                  <div class="ai-audit-title">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#4f46e5" stroke-width="2"><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/></svg>
                    <span>Gemini AI Receipt Authenticity Audit</span>
                  </div>
                  <div>
                    ${UI.authenticityBadge(expense.ai_authenticity_score, expense.ai_authenticity_status)}
                  </div>
                </div>

                <div class="ai-audit-body">
                  <div class="ai-score-gauge-box">
                    <div class="ai-score-number-badge ${badgeClass}">
                      <span>${score !== null ? score + '%' : '--'}</span>
                      <small>${statusRaw.replace('_', ' ')}</small>
                    </div>
                    <div class="ai-score-details-text">
                      <div class="ai-score-status-title">${statusTitle}</div>
                      <div class="ai-score-explanation">${reason}</div>
                      ${riskFactors.length ? `
                        <div class="ai-risk-factors-list">
                          ${riskFactors.map(rf => `<span class="ai-risk-tag"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg> ${rf}</span>`).join('')}
                        </div>
                      ` : ''}
                    </div>
                  </div>

                  <div class="ai-audit-meta-grid">
                    <div>
                      <div class="ai-audit-meta-item-label">Verified Vendor</div>
                      <div class="ai-audit-meta-item-val">${extracted.merchant_name || 'Standard Vendor'}</div>
                    </div>
                    <div>
                      <div class="ai-audit-meta-item-label">Tax / Invoice Ref</div>
                      <div class="ai-audit-meta-item-val">${extracted.invoice_or_tax_id || 'Not Detected'}</div>
                    </div>
                    <div>
                      <div class="ai-audit-meta-item-label">Extracted Voucher Sum</div>
                      <div class="ai-audit-meta-item-val">${extracted.amount ? (extracted.currency || '') + ' ' + extracted.amount : 'Matched claim'}</div>
                    </div>
                    <div>
                      <div class="ai-audit-meta-item-label">Audit Transparency</div>
                      <div class="ai-audit-meta-item-val" style="color:#059669">Employee & Admin</div>
                    </div>
                  </div>
                </div>
              </div>
            `;
          })()}

          <!-- OCR text if available -->
          ${expense.receipt_ocr_text ? `
            <div class="card">
              <div class="section-header">
                <div>
                  <span class="section-code">[OCR-EXTRACT]</span>
                  <h3 class="section-title">Optical Character Recognition Output</h3>
                </div>
              </div>
              <pre style="font-size:0.8125rem;font-family:var(--font-mono);color:var(--text-secondary);white-space:pre-wrap;word-break:break-word;background:#f8fafc;border:1px solid var(--border-color);padding:16px;border-radius:var(--radius-md)">${expense.receipt_ocr_text}</pre>
            </div>
          ` : ''}
        </div>

        <!-- Sidebar -->
        <div class="detail-sidebar">
          <!-- Approval Timeline -->
          <div class="card">
            <div class="section-header">
              <div>
                <span class="section-code">[AUDIT]</span>
                <h3 class="section-title">Verification Trail</h3>
              </div>
            </div>
            <div class="timeline">
              <!-- Submitted -->
              <div class="timeline-item">
                <div class="timeline-icon done">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z"/></svg>
                </div>
                <div class="timeline-content">
                  <div class="timeline-step">Initial Filing</div>
                  <div class="timeline-meta">${UI.relativeTime(expense.created_at)}</div>
                </div>
              </div>
              ${timelineHTML}
              ${finalHTML}
            </div>
          </div>

          <!-- Receipt -->
          ${expense.receipt_path ? `
            <div class="receipt-preview-card">
              <img src="http://localhost:5001/${expense.receipt_path}" alt="Receipt Voucher Document" 
                   onerror="this.src='';this.style.display='none'">
              <div class="receipt-preview-footer">
                <span style="font-size:0.75rem;font-weight:600;color:var(--text-secondary)">Receipt on file</span>
                <a href="http://localhost:5001/${expense.receipt_path}" target="_blank" class="btn btn-sm btn-secondary">View Document</a>
              </div>
            </div>
          ` : `
            <div class="card" style="text-align:center;padding:24px">
              <div style="font-size:0.75rem;font-weight:600;color:var(--text-muted);margin-bottom:4px">No Receipt</div>
              <p style="font-size:0.8125rem;color:var(--text-secondary)">No document attached to this claim</p>
            </div>
          `}

          <!-- Admin Actions (if admin and status is pending/in_review) -->
          ${AppState.isAdmin() && (expense.status === 'in_review' || expense.status === 'pending') ? `
            <div class="card" style="border:1px solid #bfdbfe;background:#eff6ff">
              <h3 style="font-size:0.9375rem;font-weight:700;color:#1e40af;margin-bottom:4px">Administrative Audit</h3>
              <p style="font-size:0.8125rem;color:#3b82f6;margin-bottom:12px">Record your approval or rejection decision.</p>
              <div class="form-group" style="margin-bottom:12px">
                <input type="text" id="admin-vote-comment" class="form-control" style="background:#ffffff" placeholder="Optional audit memo or reason...">
              </div>
              <div style="display:flex;gap:8px">
                <button class="btn btn-primary" style="flex:1;background:linear-gradient(135deg, #10b981, #059669);border-color:#059669;color:#ffffff" onclick="ExpenseDetail.handleVote('${expense.id}', 'approve')">
                  Approve Claim
                </button>
                <button class="btn btn-secondary" style="flex:1;background:#ffffff;border-color:#fca5a5;color:#dc2626" onclick="ExpenseDetail.handleVote('${expense.id}', 'reject')">
                  Reject Claim
                </button>
              </div>
            </div>
          ` : ''}

          <!-- Back button -->
          <button class="btn btn-secondary w-full" onclick="history.back()">
            Back to Ledger List
          </button>
        </div>
      </div>
    `;
  },

  async handleVote(expenseId, vote) {
    const commentInput = document.getElementById('admin-vote-comment');
    const comment = commentInput ? commentInput.value.trim() : '';

    try {
      await API.expenses.vote(expenseId, { vote, comment });
      UI.toast(`Expense claim marked as ${vote === 'approve' ? 'approved' : 'rejected'}.`, 'success');
      await this.open(expenseId);
    } catch (err) {
      // In mock/offline mode fallback
      if (this.currentExpense) {
        this.currentExpense.status = vote === 'approve' ? 'approved' : 'rejected';
        UI.toast(`Expense marked as ${this.currentExpense.status} (offline mode).`, 'info');
        this.render(this.currentExpense, { status: this.currentExpense.status }, [
          { approver_name: AppState.user?.name || 'Administrator', vote, comment, step: 0 }
        ]);
      } else {
        UI.toast(err.message || 'Failed to update expense claim', 'error');
      }
    }
  }
};

// Register route
Router.register('expense-detail', (params) => {
  if (params?.id) ExpenseDetail.open(params.id);
});
