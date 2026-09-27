/**
 * Cloudflare Turnstile Integration for APEX SUPPORT HUB
 * Protects website entrance (login/access) and downloads with human verification.
 */
(function () {
  'use strict';

  const SITE_KEY = '0x4AAAAAAEqMzg-9Js5PCYJ-';
  const VERIFIED_STORAGE_KEY = 'apex_turnstile_verified_until';
  const VERIFY_DURATION_MS = 2 * 60 * 60 * 1000; // 2 hours verification session

  let turnstileWidgetId = null;
  let isGatekeeper = false;
  let currentAction = 'login';
  let pendingAction = null;

  const modal = document.getElementById('verify-modal');
  const modalClose = document.getElementById('verify-modal-close');
  const container = document.getElementById('turnstile-container');
  const statusEl = document.getElementById('verify-status');
  const errorEl = document.getElementById('verify-error');
  const badgeText = document.getElementById('verify-badge-text');
  const titleEl = document.getElementById('verify-modal-title');
  const subtitleEl = document.getElementById('verify-modal-subtitle');

  function isVerified() {
    try {
      const sessionVal = sessionStorage.getItem(VERIFIED_STORAGE_KEY);
      if (sessionVal && Date.now() < parseInt(sessionVal, 10)) {
        return true;
      }
      const localVal = localStorage.getItem(VERIFIED_STORAGE_KEY);
      if (localVal && Date.now() < parseInt(localVal, 10)) {
        sessionStorage.setItem(VERIFIED_STORAGE_KEY, localVal);
        return true;
      }
    } catch (e) {}
    return false;
  }

  function setVerified() {
    const expiry = (Date.now() + VERIFY_DURATION_MS).toString();
    try {
      sessionStorage.setItem(VERIFIED_STORAGE_KEY, expiry);
      localStorage.setItem(VERIFIED_STORAGE_KEY, expiry);
    } catch (e) {}
  }

  function openGatekeeper() {
    if (!modal) return;
    isGatekeeper = true;
    currentAction = 'login';

    document.body.classList.add('gatekeeper-locked');
    modal.classList.add('gatekeeper-overlay');
    if (modalClose) {
      modalClose.style.display = 'none';
      // Safety timer: show close button after 4s so users are never trapped if CDN fails
      setTimeout(() => {
        if (modalClose && isGatekeeper) {
          modalClose.style.display = '';
        }
      }, 4000);
    }

    if (badgeText) badgeText.textContent = 'SECURITY GATEWAY';
    if (titleEl) titleEl.innerHTML = 'Website <span class="gradient-text">Access Check</span>';
    if (subtitleEl) subtitleEl.textContent = 'Please complete the Cloudflare security verification below to confirm you are human and enter the website.';

    if (errorEl) { errorEl.style.display = 'none'; errorEl.textContent = ''; }
    if (statusEl) { statusEl.style.display = 'none'; }

    modal.removeAttribute('hidden');
    renderTurnstile();
  }

  function openDownloadModal(pending) {
    if (!modal) return;
    isGatekeeper = false;
    currentAction = 'download';
    pendingAction = pending;

    modal.classList.remove('gatekeeper-overlay');
    if (modalClose) modalClose.style.display = '';

    if (badgeText) badgeText.textContent = 'HUMAN VERIFICATION';
    if (titleEl) titleEl.innerHTML = '<span class="gradient-text">Security</span> Check';
    if (subtitleEl) subtitleEl.textContent = 'Please complete the Cloudflare security challenge below to verify you are human and proceed to download.';

    if (errorEl) { errorEl.style.display = 'none'; errorEl.textContent = ''; }
    if (statusEl) { statusEl.style.display = 'none'; }

    modal.removeAttribute('hidden');
    renderTurnstile();
  }

  function closeModal() {
    if (!modal) return;
    modal.setAttribute('hidden', '');
    modal.classList.remove('gatekeeper-overlay');
    document.body.classList.remove('gatekeeper-locked');
    isGatekeeper = false;
    pendingAction = null;
  }

  let renderRetries = 0;
  const MAX_RENDER_RETRIES = 20; // ~3 seconds maximum wait

  function renderTurnstile() {
    if (!window.turnstile) {
      renderRetries++;
      if (renderRetries >= MAX_RENDER_RETRIES) {
        console.warn('⚠️ Cloudflare Turnstile script unavailable. Granting fallback access.');
        setVerified();
        closeModal();
        if (pendingAction) {
          executePending();
        }
        return;
      }
      setTimeout(renderTurnstile, 150);
      return;
    }
    renderRetries = 0;

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
        action: currentAction,
        callback: onTurnstileSuccess,
        'error-callback': onTurnstileError,
        'expired-callback': onTurnstileExpired
      });
    } catch (err) {
      console.error('Turnstile render error:', err);
      // Fallback on render error
      setVerified();
      closeModal();
      if (pendingAction) {
        executePending();
      }
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
        body: JSON.stringify({ token, action: currentAction })
      });

      const data = await res.json();

      if (data && data.success) {
        setVerified();
        if (statusEl) {
          statusEl.innerHTML = '<span style="color:#22c55e; font-weight:600;">✓ Verified! Access granted.</span>';
        }

        setTimeout(() => {
          const wasGatekeeper = isGatekeeper;
          closeModal();
          if (!wasGatekeeper) {
            executePending();
          }
        }, 650);
      } else {
        showError(data?.error || 'Verification rejected. Please try again.');
        if (window.turnstile && turnstileWidgetId !== null) {
          window.turnstile.reset(turnstileWidgetId);
        }
      }
    } catch (err) {
      console.error('Turnstile backend verification error:', err);
      // Fallback in case of server network glitch
      setVerified();
      const wasGatekeeper = isGatekeeper;
      closeModal();
      if (!wasGatekeeper) {
        executePending();
      }
    }
  }

  function onTurnstileError() {
    showError('Security check failed to load or was blocked.');
    if (errorEl) {
      const skipBtn = document.createElement('button');
      skipBtn.className = 'verify-retry-btn';
      skipBtn.style.marginTop = '8px';
      skipBtn.textContent = 'Continue to Site';
      skipBtn.onclick = () => {
        setVerified();
        closeModal();
        if (pendingAction) {
          executePending();
        }
      };
      errorEl.appendChild(document.createElement('br'));
      errorEl.appendChild(skipBtn);
    }
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
      if (toast) {
        const toastTitle = document.getElementById('toast-title') || toast.querySelector('.toast__title');
        const toastMessage = document.getElementById('toast-message') || toast.querySelector('.toast__message');
        if (toastTitle) toastTitle.textContent = 'Download Started';
        if (toastMessage) toastMessage.textContent = 'Opening ' + name + '...';
        toast.removeAttribute('hidden');
        clearTimeout(toast._timer);
        toast._timer = setTimeout(() => {
          toast.setAttribute('hidden', '');
        }, 3500);
      }
    }
  }

  // Intercept Download clicks
  document.addEventListener('click', function (e) {
    const btn = e.target.closest('.btn--download');
    if (!btn) return;

    // Skip disabled or coming-soon buttons
    if (btn.disabled || btn.hasAttribute('disabled') || btn.classList.contains('disabled')) {
      e.preventDefault();
      return;
    }

    const card = btn.closest('.card');
    const rawTitle = card?.querySelector('.card__title')?.textContent || '';
    const name = (btn.dataset.name || rawTitle).trim().toUpperCase();

    // Do not intercept buttons that open other modals
    if (
      name.includes('OPTIMIZATION') ||
      name.includes('SENSI') ||
      name.includes('TUTORIAL') ||
      name === 'FREE BYPASS' ||
      btn.id === 'btn-free-bypass' ||
      btn.dataset.name === 'Free Bypass' ||
      (btn.getAttribute('onclick') && btn.getAttribute('onclick').includes('modal')) ||
      btn.classList.contains('btn-modal-trigger')
    ) {
      return;
    }

    // Dynamic downloadLinks resolution with fallback to direct dataset url
    const lookupTitle = rawTitle.trim();
    let url = (window.downloadLinks && (window.downloadLinks[lookupTitle] || window.downloadLinks[name])) ||
              btn.dataset.url || btn.getAttribute('href') || '';
    if (!url || url === '#') {
      const onclickAttr = btn.getAttribute('onclick');
      if (onclickAttr && onclickAttr.includes("window.open('")) {
        url = onclickAttr.split("window.open('")[1].split("'")[0];
      }
    }

    // If already verified, allow direct execution
    if (isVerified()) {
      return;
    }

    // Require human verification
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();

    openDownloadModal({
      url: url,
      name: rawTitle.trim() || name || 'Requested File',
      element: btn
    });
  }, true);

  // Close modal button
  if (modalClose) {
    modalClose.addEventListener('click', closeModal);
  }

  // Backdrop click (disabled in gatekeeper mode)
  if (modal) {
    modal.addEventListener('click', function (e) {
      if (e.target === modal && !isGatekeeper) {
        closeModal();
      }
    });
  }

  // Escape key (disabled in gatekeeper mode)
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && modal && !modal.hasAttribute('hidden') && !isGatekeeper) {
      closeModal();
    }
  });

  // Initial Gatekeeper check on page load / entry
  function initGatekeeper() {
    if (!isVerified()) {
      openGatekeeper();
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initGatekeeper);
  } else {
    initGatekeeper();
  }

  window.ApexTurnstile = {
    isVerified,
    setVerified,
    openGatekeeper,
    openDownloadModal,
    closeModal
  };

})();
