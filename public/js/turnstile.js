/**
 * Cloudflare Turnstile Integration for APEX SUPPORT HUB
 * Protects downloads and visitor interactions with human verification.
 */
(function () {
  'use strict';

  const SITE_KEY = '0x4AAAAAAEqMzg-9Js5PCYJ-';
  const VERIFY_ACTION = 'download';
  const VERIFIED_STORAGE_KEY = 'apex_turnstile_verified_until';
  const VERIFY_DURATION_MS = 20 * 60 * 1000; // 20 minutes session verification

  let turnstileWidgetId = null;
  let pendingAction = null;

  const modal = document.getElementById('verify-modal');
  const modalClose = document.getElementById('verify-modal-close');
  const container = document.getElementById('turnstile-container');
  const statusEl = document.getElementById('verify-status');
  const errorEl = document.getElementById('verify-error');

  function isVerified() {
    try {
      const until = sessionStorage.getItem(VERIFIED_STORAGE_KEY);
      if (until && Date.now() < parseInt(until, 10)) {
        return true;
      }
    } catch {}
    return false;
  }

  function setVerified() {
    try {
      sessionStorage.setItem(VERIFIED_STORAGE_KEY, (Date.now() + VERIFY_DURATION_MS).toString());
    } catch {}
  }

  function openModal() {
    if (!modal) return;
    if (errorEl) { errorEl.style.display = 'none'; errorEl.textContent = ''; }
    if (statusEl) { statusEl.style.display = 'none'; statusEl.textContent = 'Validating security token...'; }
    modal.removeAttribute('hidden');
    renderTurnstile();
  }

  function closeModal() {
    if (!modal) return;
    modal.setAttribute('hidden', '');
    pendingAction = null;
  }

  function renderTurnstile() {
    if (!window.turnstile) {
      setTimeout(renderTurnstile, 150);
      return;
    }

    if (!container) return;

    if (turnstileWidgetId !== null) {
      try {
        window.turnstile.reset(turnstileWidgetId);
        return;
      } catch (e) {
        turnstileWidgetId = null;
      }
    }

    try {
      turnstileWidgetId = window.turnstile.render(container, {
        sitekey: SITE_KEY,
        theme: 'dark',
        action: VERIFY_ACTION,
        callback: onTurnstileSuccess,
        'error-callback': onTurnstileError,
        'expired-callback': onTurnstileExpired
      });
    } catch (err) {
      console.error('Turnstile render error:', err);
    }
  }

  async function onTurnstileSuccess(token) {
    if (statusEl) {
      statusEl.innerHTML = '<span class="verify-spinner"></span> Validating security token...';
      statusEl.style.display = 'block';
    }
    if (errorEl) errorEl.style.display = 'none';

    try {
      const res = await fetch('/api/verify-turnstile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, action: VERIFY_ACTION })
      });

      const data = await res.json();

      if (data && data.success) {
        setVerified();
        if (statusEl) {
          statusEl.innerHTML = '<span style="color:#22c55e;">✓ Verified! Starting download...</span>';
        }
        
        setTimeout(() => {
          closeModal();
          executePending();
        }, 600);
      } else {
        showError(data?.error || 'Verification rejected. Please try again.');
        if (window.turnstile && turnstileWidgetId !== null) {
          window.turnstile.reset(turnstileWidgetId);
        }
      }
    } catch (err) {
      console.error('Turnstile backend verification error:', err);
      setVerified();
      closeModal();
      executePending();
    }
  }

  function onTurnstileError() {
    showError('Security check failed to load. Please refresh or try again.');
  }

  function onTurnstileExpired() {
    showError('Verification session expired. Please verify again.');
    if (window.turnstile && turnstileWidgetId !== null) {
      window.turnstile.reset(turnstileWidgetId);
    }
  }

  function showError(msg) {
    if (statusEl) statusEl.style.display = 'none';
    if (errorEl) {
      errorEl.textContent = msg;
      errorEl.style.display = 'block';
    }
  }

  function executePending() {
    if (!pendingAction) return;
    const { url, name } = pendingAction;
    pendingAction = null;

    if (url && url !== '#' && url.trim() !== '') {
      try {
        fetch('/api/track/' + encodeURIComponent(name), { method: 'POST' }).catch(() => {});
      } catch {}
      window.open(url, '_blank');
      
      const toast = document.getElementById('toast');
      const toastTitle = document.getElementById('toast-title');
      const toastMessage = document.getElementById('toast-message');
      if (toast && toastTitle && toastMessage) {
        toastTitle.textContent = 'Download Started';
        toastMessage.textContent = 'Opening ' + name + '...';
        toast.removeAttribute('hidden');
        clearTimeout(toast._timer);
        toast._timer = setTimeout(() => {
          toast.setAttribute('hidden', '');
        }, 3500);
      }
    }
  }

  // Intercept Download clicks at the capture phase
  document.addEventListener('click', function (e) {
    const btn = e.target.closest('.btn--download');
    if (!btn) return;

    const card = btn.closest('.card');
    const name = (btn.dataset.name || card?.querySelector('.card__title')?.textContent || '').trim().toUpperCase();

    // Do not intercept buttons that open other modals
    if (name === 'OPTIMIZATION FILES' || name === 'PAID SENSI APEX' || name === 'PAID SENSI' || name.includes('TUTORIAL')) {
      return;
    }

    // Direct url resolution
    let url = btn.dataset.url || btn.getAttribute('href') || '';
    if (!url || url === '#') {
      const onclickAttr = btn.getAttribute('onclick');
      if (onclickAttr && onclickAttr.includes("window.open('")) {
        url = onclickAttr.split("window.open('")[1].split("'")[0];
      }
    }

    // If verified in this session, allow direct execution
    if (isVerified()) {
      return;
    }

    // Require human verification
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();

    pendingAction = {
      url: url,
      name: name || 'Requested File',
      element: btn
    };

    openModal();
  }, true);

  // Close modal handlers
  if (modalClose) {
    modalClose.addEventListener('click', closeModal);
  }

  if (modal) {
    modal.addEventListener('click', function (e) {
      if (e.target === modal) {
        closeModal();
      }
    });
  }

  // Escape key closes modal
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && modal && !modal.hasAttribute('hidden')) {
      closeModal();
    }
  });

  window.ApexTurnstile = {
    isVerified,
    setVerified,
    openModal,
    closeModal
  };

})();
