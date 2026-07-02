/* ============================================================
   NexaAI — main.js  (vanilla JS only)
   ============================================================ */

/* ---------- Navbar: active link ---------- */
(function markActiveNav() {
  const page = location.pathname.split('/').pop() || 'index.html';
  document.querySelectorAll('.nav-links a').forEach(a => {
    const href = a.getAttribute('href');
    if (href === page || (href === 'index.html' && page === '')) {
      a.classList.add('active');
    }
  });
})();

/* ---------- Hamburger toggle ---------- */
(function initHamburger() {
  const btn  = document.querySelector('.hamburger');
  const menu = document.querySelector('.nav-links');
  if (!btn || !menu) return;
  btn.addEventListener('click', () => {
    const open = menu.classList.toggle('open');
    btn.classList.toggle('open', open);
    btn.setAttribute('aria-expanded', open);
  });
  document.addEventListener('click', e => {
    if (!btn.contains(e.target) && !menu.contains(e.target)) {
      menu.classList.remove('open');
      btn.classList.remove('open');
    }
  });
})();

/* ---------- Scroll-reveal with IntersectionObserver ---------- */
(function initReveal() {
  const io = new IntersectionObserver(entries => {
    entries.forEach(en => {
      if (en.isIntersecting) {
        en.target.classList.add('visible');
        io.unobserve(en.target);
      }
    });
  }, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });
  document.querySelectorAll('.reveal').forEach(el => io.observe(el));
})();

/* ---------- Animated counter (hero stats) ---------- */
(function initCounters() {
  const els = document.querySelectorAll('[data-count]');
  if (!els.length) return;
  const io = new IntersectionObserver(entries => {
    entries.forEach(en => {
      if (!en.isIntersecting) return;
      const el    = en.target;
      const end   = parseFloat(el.dataset.count);
      const suffix = el.dataset.suffix || '';
      const dur   = 1800;
      const step  = 16;
      let current = 0;
      const inc   = end / (dur / step);
      const timer = setInterval(() => {
        current = Math.min(current + inc, end);
        el.textContent = (Number.isInteger(end) ? Math.round(current) : current.toFixed(1)) + suffix;
        if (current >= end) clearInterval(timer);
      }, step);
      io.unobserve(el);
    });
  }, { threshold: 0.5 });
  els.forEach(el => io.observe(el));
})();

function showSiteToast(message) {
  let toast = document.getElementById('siteToast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'siteToast';
    toast.className = 'site-toast';
    document.body.appendChild(toast);
  }
  toast.textContent = message;
  toast.classList.add('show');
  clearTimeout(showSiteToast.timeout);
  showSiteToast.timeout = setTimeout(() => toast.classList.remove('show'), 2200);
}

function getQueryParam(name) {
  const params = new URLSearchParams(window.location.search);
  return params.get(name) || '';
}

function prefillRecapRequest() {
  const requestType = getQueryParam('request');
  if (requestType !== 'event-recap') return;

  const eventTitle = getQueryParam('event') || 'this event';
  const eventDate = getQueryParam('date') || '';
  const jobTitleField = document.getElementById('jobTitle');
  const jobDetailsField = document.getElementById('jobDetails');

  if (jobTitleField) {
    jobTitleField.value = 'Event Recap Request';
  }

  if (jobDetailsField) {
    const detailText = `Hello admin, I would like to request the recap for ${eventTitle}${eventDate ? ` (${eventDate})` : ''}. Please share the recap materials or any relevant follow-up details.`;
    jobDetailsField.value = detailText;
  }

  showSiteToast('Your recap request has been prepared. Please send the form and our team will follow up.');
}

/* ---------- Contact form validation & submission ---------- */
(function initContactForm() {
  const form = document.getElementById('contactForm');
  if (!form) return;

  prefillRecapRequest();

  const backendBase = (window.NEXAAI_BACKEND_URL || 'https://pd-three-chi.vercel.app').replace(/\/$/, '');

  const rules = {
    fullName:    v => v.trim().length >= 2 || 'Please enter your full name.',
    email:       v => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) || 'Please enter a valid email.',
    phone:       v => /^[\d\s\+\-\(\)]{7,}$/.test(v) || 'Please enter a valid phone number.',
    company:     v => v.trim().length >= 1 || 'Please enter your company name.',
    country:     v => v !== '' || 'Please select a country.',
    jobTitle:    v => v.trim().length >= 1 || 'Please enter your job title.',
    jobDetails:  v => v.trim().length >= 10 || 'Please provide a brief description (min 10 chars).',
  };

  function validate(field) {
    const rule = rules[field.name];
    if (!rule) return true;
    const result = rule(field.value);
    const errEl  = form.querySelector(`#err-${field.name}`);
    if (result === true) {
      field.classList.remove('error');
      if (errEl) { errEl.textContent = ''; errEl.classList.remove('visible'); }
      return true;
    } else {
      field.classList.add('error');
      if (errEl) { errEl.textContent = result; errEl.classList.add('visible'); }
      return false;
    }
  }

  // Live validation on blur
  form.querySelectorAll('input,select,textarea').forEach(f => {
    f.addEventListener('blur', () => validate(f));
    f.addEventListener('input', () => { if (f.classList.contains('error')) validate(f); });
  });

  form.addEventListener('submit', async e => {
    e.preventDefault();
    let ok = true;
    form.querySelectorAll('input,select,textarea').forEach(f => { if (!validate(f)) ok = false; });
    if (!ok) return;

    const btn = form.querySelector('.form-submit');
    btn.disabled = true;
    btn.textContent = 'Sending…';

    const data = Object.fromEntries(new FormData(form));
    const payload = {
      ...data,
      interest: data.jobTitle || 'General inquiry',
      jobDetails: data.jobDetails || '',
    };

    try {
      const response = await fetch(`${backendBase}/api/contact`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.message || 'Unable to send your message right now.');
      }

      const inquiries = JSON.parse(localStorage.getItem('nexaai_inquiries') || '[]');
      inquiries.push({ ...payload, date: new Date().toLocaleDateString(), status: 'New' });
      localStorage.setItem('nexaai_inquiries', JSON.stringify(inquiries));

      form.style.display = 'none';
      const msg = document.getElementById('successMessage');
      if (msg) msg.classList.add('show');
    } catch (error) {
      btn.disabled = false;
      btn.textContent = 'Send Message →';
      const errEl = document.getElementById('contactFormError');
      if (errEl) {
        errEl.textContent = error.message;
        errEl.style.display = 'block';
      } else {
        alert(error.message);
      }
    }
  });
})();

/* ---------- Admin login / dashboard ---------- */
(function initAdmin() {
  const loginWrap = document.getElementById('loginWrap');
  const dashboard = document.getElementById('dashboard');
  const loginForm = document.getElementById('loginForm');
  const signupForm = document.getElementById('signupForm');
  const loginErr  = document.getElementById('loginError');
  const logoutBtn = document.getElementById('logoutBtn');
  if (!loginWrap && !dashboard) return;

  const rawPage = window.location.pathname.split('/').pop().split('?')[0] || '';
  const currentPage = rawPage.toLowerCase();
  const normalizedPage = currentPage.replace(/\.html$/, '');
  const isRootAdminPage = currentPage === 'admin.html' || currentPage === 'admin';
  const protectedAdminPages = ['dashboard', 'dashboard.html', 'articles', 'articles.html', 'events', 'events.html', 'gallery', 'gallery.html'];
  const dashboardPath = isRootAdminPage ? 'admin/dashboard.html' : 'dashboard.html';
  const loginPath = isRootAdminPage ? 'admin/login.html' : 'login.html';
  const backendBase = (window.NEXAAI_BACKEND_URL || 'https://pd-three-chi.vercel.app').replace(/\/$/, '');
  let inquiryAllRows = [];
  let inquiryCurrentPage = 1;
  const inquiryRowsPerPage = 5;
  let activeAdminUser = null;
  let activeInquiryId = null;

  function renderInquiryPage() {
    const tbody = document.getElementById('inquiryBody');
    if (!tbody) return;

    const totalPages = Math.max(1, Math.ceil(inquiryAllRows.length / inquiryRowsPerPage));
    inquiryCurrentPage = Math.max(1, Math.min(inquiryCurrentPage, totalPages));
    const start = (inquiryCurrentPage - 1) * inquiryRowsPerPage;
    const end = start + inquiryRowsPerPage;
    const pageRows = inquiryAllRows.slice(start, end);

    tbody.innerHTML = pageRows.length ? pageRows.map(r => `
      <tr>
        <td><strong>${r.fullName || r.name || '—'}</strong></td>
        <td>${r.company || '—'}</td>
        <td>${r.email || '—'}</td>
        <td>${r.jobTitle || r.interest || '—'}</td>
        <td>${r.date || (r.createdAt ? new Date(r.createdAt).toLocaleDateString() : '—')}</td>
        <td><span class="status-badge status-${(String(r.status || 'new')).toLowerCase()}">${r.status || 'New'}</span></td>
        <td><button type="button" class="btn btn-sm inquiry-action-btn" data-inquiry-id="${r.id || ''}" style="padding:6px 10px;">Action</button></td>
      </tr>
    `).join('') : '<tr><td colspan="7" style="text-align:center; padding:32px; color:var(--text-muted);">No inquiries found.</td></tr>';

    const pageInfo = document.getElementById('inquiryPageInfo');
    const rangeInfo = document.getElementById('inquiryRangeInfo');
    const prevBtn = document.getElementById('inquiryPrevPage');
    const nextBtn = document.getElementById('inquiryNextPage');
    if (pageInfo) pageInfo.textContent = `Page ${inquiryCurrentPage} of ${totalPages}`;
    if (rangeInfo) rangeInfo.textContent = inquiryAllRows.length
      ? `Showing ${start + 1}–${Math.min(end, inquiryAllRows.length)} of ${inquiryAllRows.length}`
      : 'Showing 0 of 0';
    if (prevBtn) prevBtn.disabled = inquiryCurrentPage === 1;
    if (nextBtn) nextBtn.disabled = inquiryCurrentPage === totalPages || inquiryAllRows.length === 0;
  }

  function clearError() {
    if (!loginErr) return;
    loginErr.classList.remove('show');
    loginErr.textContent = '';
  }

  function showError(message) {
    if (!loginErr) return;
    loginErr.classList.add('show');
    loginErr.textContent = message;
  }

  async function renderTable(user) {
    const tbody = document.getElementById('inquiryBody');
    if (!tbody) return;

    try {
      const [inquiriesRes, articlesRes, galleryRes, eventsRes] = await Promise.all([
        fetch(`${backendBase}/api/inquiries`),
        fetch(`${backendBase}/api/articles`),
        fetch(`${backendBase}/api/gallery`),
        fetch(`${backendBase}/api/events`),
      ]);

      const inquiriesData = await inquiriesRes.json();
      const articlesData = await articlesRes.json();
      const galleryData = await galleryRes.json();
      const eventsData = await eventsRes.json();

      if (!inquiriesRes.ok) throw new Error(inquiriesData.message || 'Unable to load inquiries.');
      if (!articlesRes.ok) throw new Error(articlesData.message || 'Unable to load articles.');
      if (!galleryRes.ok) throw new Error(galleryData.message || 'Unable to load gallery items.');
      if (!eventsRes.ok) throw new Error(eventsData.message || 'Unable to load events.');

      const normalizedRows = Array.isArray(inquiriesData) ? inquiriesData : [];
      const articleRows = Array.isArray(articlesData) ? articlesData : [];
      const galleryRows = Array.isArray(galleryData) ? galleryData : [];
      const eventRows = Array.isArray(eventsData) ? eventsData : [];

      inquiryAllRows = normalizedRows;
      inquiryCurrentPage = 1;

      document.getElementById('totalInquiries').textContent = normalizedRows.length;
      document.getElementById('totalArticles').textContent = articleRows.length;
      document.getElementById('totalGallery').textContent = galleryRows.length;
      document.getElementById('totalEvents').textContent = eventRows.length;

      const userLabel = document.getElementById('adminUserLabel');
      if (userLabel) {
        userLabel.textContent = user?.email || 'Signed in';
      }

      renderInquiryPage();
    } catch (error) {
      inquiryAllRows = [];
      inquiryCurrentPage = 1;
      document.getElementById('totalInquiries').textContent = '0';
      document.getElementById('totalArticles').textContent = '0';
      document.getElementById('totalGallery').textContent = '0';
      document.getElementById('totalEvents').textContent = '0';
      tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; padding:32px; color:#b42318;">${error.message}</td></tr>`;
    }
  }

  function showInquiryActionMessage(message, isError = false) {
    const messageBox = document.getElementById('inquiryActionMessage');
    if (!messageBox) return;
    messageBox.style.display = 'block';
    messageBox.textContent = message;
    messageBox.style.background = isError ? '#fff2f2' : '#f2fbf4';
    messageBox.style.color = isError ? '#b42318' : '#027a48';
  }

  function closeInquiryModal() {
    const modal = document.getElementById('inquiryActionModal');
    if (modal) modal.style.display = 'none';
    activeInquiryId = null;
  }

  function openInquiryModal(inquiry) {
    const modal = document.getElementById('inquiryActionModal');
    const title = document.getElementById('inquiryActionTitle');
    const idInput = document.getElementById('inquiryActionId');
    const statusSelect = document.getElementById('inquiryStatusSelect');
    const subjectInput = document.getElementById('inquiryReplySubject');
    const messageInput = document.getElementById('inquiryReplyMessage');
    const messageBox = document.getElementById('inquiryActionMessage');
    if (!modal || !title || !idInput || !statusSelect || !subjectInput || !messageInput || !messageBox) return;

    activeInquiryId = inquiry?.id || null;
    idInput.value = inquiry?.id || '';
    statusSelect.value = inquiry?.status || 'New';
    title.textContent = `Update inquiry — ${inquiry?.fullName || inquiry?.name || 'Customer'}`;
    subjectInput.value = `Re: ${inquiry?.jobTitle || inquiry?.interest || 'Your inquiry'}`;
    messageInput.value = `Hi ${inquiry?.fullName || inquiry?.name || 'there'},\n\nThank you for reaching out to NexaAI. We have updated your request and will follow up shortly.\n\nBest regards,\nNexaAI Team`;
    messageBox.style.display = 'none';
    modal.style.display = 'flex';
  }

  document.getElementById('inquiryPrevPage')?.addEventListener('click', () => {
    if (inquiryCurrentPage > 1) {
      inquiryCurrentPage--;
      renderInquiryPage();
    }
  });

  document.getElementById('inquiryNextPage')?.addEventListener('click', () => {
    const totalPages = Math.max(1, Math.ceil(inquiryAllRows.length / inquiryRowsPerPage));
    if (inquiryCurrentPage < totalPages) {
      inquiryCurrentPage++;
      renderInquiryPage();
    }
  });

  const inquiryBody = document.getElementById('inquiryBody');
  if (inquiryBody) {
    inquiryBody.addEventListener('click', event => {
      const actionButton = event.target.closest('.inquiry-action-btn');
      if (!actionButton) return;
      const inquiryId = actionButton.getAttribute('data-inquiry-id');
      const inquiry = inquiryAllRows.find(item => String(item.id) === String(inquiryId));
      if (inquiry) openInquiryModal(inquiry);
    });
  }

  document.getElementById('closeInquiryModal')?.addEventListener('click', closeInquiryModal);
  document.getElementById('cancelInquiryAction')?.addEventListener('click', closeInquiryModal);
  document.getElementById('inquiryActionModal')?.addEventListener('click', event => {
    if (event.target.id === 'inquiryActionModal') closeInquiryModal();
  });

  async function updateInquiryStatusOnly() {
    const id = document.getElementById('inquiryActionId')?.value;
    const status = document.getElementById('inquiryStatusSelect')?.value;
    const button = document.getElementById('saveInquiryStatusBtn');
    if (!id) return;

    if (button) {
      button.disabled = true;
      button.textContent = 'Saving...';
    }

    try {
      const statusRes = await fetch(`${backendBase}/api/inquiries/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      const statusData = await statusRes.json().catch(() => ({}));
      if (!statusRes.ok) throw new Error(statusData.message || 'Unable to update inquiry status.');

      const inquiry = inquiryAllRows.find(item => String(item.id) === String(id));
      if (inquiry) inquiry.status = status || inquiry.status;
      renderInquiryPage();
      showInquiryActionMessage('Status updated successfully.');
      setTimeout(closeInquiryModal, 600);
    } catch (error) {
      showInquiryActionMessage(error.message, true);
    } finally {
      if (button) {
        button.disabled = false;
        button.textContent = 'Save status';
      }
    }
  }

  async function sendInquiryReplyOnly() {
    const id = document.getElementById('inquiryActionId')?.value;
    const subject = document.getElementById('inquiryReplySubject')?.value.trim();
    const message = document.getElementById('inquiryReplyMessage')?.value.trim();
    const button = document.getElementById('sendInquiryReplyBtn');
    if (!id) return;

    if (!subject || !message) {
      showInquiryActionMessage('Please add both a subject and a reply message before sending.', true);
      return;
    }

    if (button) {
      button.disabled = true;
      button.textContent = 'Sending...';
    }

    try {
      const replyRes = await fetch(`${backendBase}/api/inquiries/${id}/reply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subject, message }),
      });
      const replyData = await replyRes.json().catch(() => ({}));
      if (!replyRes.ok) throw new Error(replyData.message || 'Unable to send the reply.');

      showInquiryActionMessage('Reply sent successfully.');
      setTimeout(closeInquiryModal, 600);
    } catch (error) {
      showInquiryActionMessage(error.message, true);
    } finally {
      if (button) {
        button.disabled = false;
        button.textContent = 'Send reply';
      }
    }
  }

  document.getElementById('saveInquiryStatusBtn')?.addEventListener('click', updateInquiryStatusOnly);
  document.getElementById('sendInquiryReplyBtn')?.addEventListener('click', sendInquiryReplyOnly);

  function showDashboard(user) {
    activeAdminUser = user;
    if (loginWrap) loginWrap.style.display = 'none';
    if (dashboard) dashboard.classList.add('show');
    renderTable(user);
  }

  function showLogin() {
    if (loginWrap) loginWrap.style.display = '';
    if (dashboard) dashboard.classList.remove('show');
  }

  function getStoredSession() {
    const token = sessionStorage.getItem('nexaai_admin_token');
    const storedUser = sessionStorage.getItem('nexaai_admin_user');
    return {
      token,
      user: storedUser ? JSON.parse(storedUser) : null,
    };
  }

  function saveSession(payload, user) {
    if (payload.idToken) {
      sessionStorage.setItem('nexaai_admin_token', payload.idToken);
    }
    if (payload.refreshToken) {
      sessionStorage.setItem('nexaai_admin_refresh_token', payload.refreshToken);
    }
    if (user) {
      sessionStorage.setItem('nexaai_admin_user', JSON.stringify(user));
    }
  }

  function clearSession() {
    sessionStorage.removeItem('nexaai_admin_token');
    sessionStorage.removeItem('nexaai_admin_refresh_token');
    sessionStorage.removeItem('nexaai_admin_user');
  }

  async function validateStoredSession() {
    const token = sessionStorage.getItem('nexaai_admin_token');
    if (!token) return false;

    try {
      const response = await fetch(`${backendBase}/api/admin/me`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken: token }),
      });
      const data = await response.json();
      if (!response.ok) {
        clearSession();
        return false;
      }
      return true;
    } catch (error) {
      clearSession();
      return false;
    }
  }

  async function submitAuth(form, endpoint, payload, loadingText, successText) {
    clearError();
    const submitBtn = form.querySelector('button[type="submit"]');
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = loadingText;
    }

    try {
      const response = await fetch(`${backendBase}/api/admin/${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.message || 'Unable to complete the request.');
      }

      saveSession(data, { email: payload.email, name: payload.name || '' });
      window.location.href = dashboardPath;
    } catch (error) {
      showError(error.message || 'Unable to complete the request.');
    } finally {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = successText;
      }
    }
  }

  if (loginForm) {
    loginForm.addEventListener('submit', async e => {
      e.preventDefault();
      const email = document.getElementById('adminEmail').value.trim();
      const password = document.getElementById('adminPass').value;
      if (!email || !password) {
        showError('Please enter your email and password.');
        return;
      }

      await submitAuth(loginForm, 'verify-password', { email, password }, 'Signing In…', 'Sign In →');
    });
  }

  if (signupForm) {
    signupForm.addEventListener('submit', async e => {
      e.preventDefault();
      const fullName = document.getElementById('signupName').value.trim();
      const email = document.getElementById('signupEmail').value.trim();
      const password = document.getElementById('signupPass').value;
      if (!fullName || !email || !password) {
        showError('Please enter your name, email, and password.');
        return;
      }
      if (password.length < 6) {
        showError('Password must be at least 6 characters long.');
        return;
      }

      await submitAuth(signupForm, 'signup', { email, password, name: fullName }, 'Creating Account…', 'Create Account →');
    });
  }

  if (logoutBtn) {
    logoutBtn.addEventListener('click', () => {
      clearSession();
      window.location.href = loginPath;
    });
  }

  document.querySelectorAll('.auth-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.auth-tab').forEach(item => item.classList.remove('active'));
      document.querySelectorAll('.auth-panel').forEach(panel => panel.classList.remove('active'));
      tab.classList.add('active');
      const target = document.getElementById(tab.dataset.target);
      if (target) target.classList.add('active');
    });
  });

  (async () => {
    const session = getStoredSession();
    const isProtectedPage = protectedAdminPages.includes(normalizedPage);
    const isDashboardPage = ['dashboard', 'dashboard.html'].includes(normalizedPage);
    const isLoginPage = ['login.html', 'admin.html', 'admin', ''].includes(normalizedPage);

    if (isProtectedPage) {
      if (session.token) {
        const isValid = await validateStoredSession();
        if (isValid) {
          if (isDashboardPage) {
            showDashboard(session.user);
          }
        } else {
          window.location.href = loginPath;
        }
      } else {
        window.location.href = loginPath;
      }
    } else if (isLoginPage) {
      if (session.token) {
        const isValid = await validateStoredSession();
        if (isValid) {
          window.location.href = dashboardPath;
        } else {
          showLogin();
          clearError();
        }
      } else {
        showLogin();
        clearError();
      }
    }
  })();
})();
