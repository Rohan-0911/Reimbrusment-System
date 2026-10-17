/* ============================================================
   Reimbursement System :  Auth (Login + Company Signup)
   ============================================================ */

'use strict';

const Auth = {
  _initialized: false,

  init() {
    if (this._initialized) return; // prevent duplicate listeners
    this._initialized = true;
    this.bindTabSwitching();
    this.bindLoginForm();
    this.bindSignupForm();
    this.bindPasswordToggles();
  },

  bindTabSwitching() {
    document.querySelectorAll('.auth-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        const target = tab.dataset.tab;
        document.querySelectorAll('.auth-tab').forEach(t => t.classList.remove('active'));
        document.querySelectorAll('.auth-panel').forEach(p => p.classList.remove('active'));
        tab.classList.add('active');
        document.getElementById(`panel-${target}`)?.classList.add('active');
        // Clear errors
        document.querySelectorAll('.auth-error').forEach(e => e.classList.remove('visible'));
      });
    });
  },

  bindLoginForm() {
    const form = document.getElementById('login-form');
    if (!form) return;
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      await this.handleLogin();
    });
  },

  bindSignupForm() {
    const form = document.getElementById('signup-form');
    if (!form) return;
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      await this.handleSignup();
    });
  },

  bindPasswordToggles() {
    document.querySelectorAll('.password-toggle').forEach(btn => {
      btn.addEventListener('click', () => {
        const input = btn.previousElementSibling;
        if (!input) return;
        const isPassword = input.type === 'password';
        input.type = isPassword ? 'text' : 'password';
        btn.textContent = isPassword ? 'Show' : 'Hide';
      });
    });
  },

  async handleLogin() {
    const email = document.getElementById('login-email').value.trim();
    const password = document.getElementById('login-password').value;
    const btn = document.getElementById('login-submit');
    const errorEl = document.getElementById('login-error');

    // Validation
    if (!email || !password) {
      this.showError(errorEl, 'Please enter your email and password.');
      return;
    }

    UI.setButtonLoading(btn, true, 'Signing in...');
    this.hideError(errorEl);

    try {
      const data = await API.auth.login({ email, password });
      this.onLoginSuccess(data);
    } catch (err) {
      this.showError(errorEl, err.message);
    } finally {
      UI.setButtonLoading(btn, false, '');
      if (btn._originalHTML) btn.innerHTML = btn._originalHTML;
    }
  },

  async handleSignup() {
    const companyName = document.getElementById('signup-company').value.trim();
    const country = document.getElementById('signup-country').value.trim();
    const adminName = document.getElementById('signup-name').value.trim();
    const adminEmail = document.getElementById('signup-email').value.trim();
    const adminPassword = document.getElementById('signup-password').value;
    const confirmPass = document.getElementById('signup-confirm').value;
    const btn = document.getElementById('signup-submit');
    const errorEl = document.getElementById('signup-error');

    // Validation
    if (!companyName || !country || !adminName || !adminEmail || !adminPassword) {
      this.showError(errorEl, 'Please fill in all required fields.');
      return;
    }

    if (adminPassword !== confirmPass) {
      this.showError(errorEl, 'Passwords do not match.');
      return;
    }

    if (adminPassword.length < 6) {
      this.showError(errorEl, 'Password must be at least 6 characters.');
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(adminEmail)) {
      this.showError(errorEl, 'Please enter a valid email address.');
      return;
    }

    UI.setButtonLoading(btn, true, 'Creating account...');
    this.hideError(errorEl);

    try {
      const data = await API.auth.signup({
        companyName, country, adminName, adminEmail, adminPassword
      });
      this.onLoginSuccess(data);
      Toast.show('Company created successfully! Welcome to Reimbursement System.', 'success');
    } catch (err) {
      this.showError(errorEl, err.message);
    } finally {
      UI.setButtonLoading(btn, false, '');
      if (btn._originalHTML) btn.innerHTML = btn._originalHTML;
    }
  },

  onLoginSuccess({ token, user, company }) {
    AppState.token = token;
    AppState.user = user;
    AppState.company = company;
    AppState.save();
    UI.showApp();
    Router.navigate('dashboard');
  },

  logout() {
    if (!UI.confirm('Are you sure you want to sign out?')) return;
    AppState.clear();
    UI.showAuth();
    Toast.show('Signed out successfully.', 'info');
  },

  demoLogin(role) {
    const isAdmin = role === 'admin';
    const mockData = {
      token: `demo_token_${role}_${Date.now()}`,
      user: {
        id: `demo_user_${role}`,
        name: isAdmin ? 'Admin Demo' : 'Employee Demo',
        email: `${role}@demo.reimbursementsystem.com`,
        role: role,
        company_id: 'demo_company',
        is_active: 1,
      },
      company: {
        id: 'demo_company',
        name: 'Reimbursement System Corp',
        country: 'India',
        currency_code: 'INR',
        currency_symbol: '₹',
      }
    };
    this.onLoginSuccess(mockData);
    Toast.show(`Session initialized: ${isAdmin ? 'Administrator' : 'Employee'} Portal (Offline Mode)`, 'info', 4000);
  },

  showError(el, message) {
    if (!el) return;
    el.textContent = message;
    el.classList.add('visible');
  },

  hideError(el) {
    if (!el) return;
    el.classList.remove('visible');
  }
};

// Register auth route
Router.register('auth', () => {
  UI.showAuth();
  Auth.init();
});
