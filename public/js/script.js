(function () {
  'use strict';

  const ALLOWED_ROUTES = Object.freeze([
    'home',
    'free-panel',
    'emulator',
    'optimization',
    'bypass-issue',
    'panel-issue',
    'internal-fix',
    'other-issues',
    'tutorial-video'
  ]);
  const ROUTE_ALIASES = Object.freeze({
    'uid-bypass-fix': 'bypass-issue',
    'uid-bypass': 'bypass-issue',
    'bypass-fix': 'bypass-issue',
    'free-panel-download': 'free-panel',
    'panel': 'free-panel',
    'lib-bypass': 'bypass-issue',
    'lib-bypass-fix': 'bypass-issue',
    'tutorial-setup-video': 'tutorial-video',
    'tutorial-setup': 'tutorial-video',
    'tutorial': 'tutorial-video'
  });
  const DISCORD_URL = 'https://discord.gg/v766g2PNn6';

  const nav = document.getElementById('nav');
  const navToggle = document.getElementById('nav-toggle');
  const navLinks = document.getElementById('nav-links');
  const content = document.getElementById('content');
  const toast = document.getElementById('toast');
  const toastTitle = toast ? toast.querySelector('.toast__title') : null;
  const toastMessage = toast ? toast.querySelector('.toast__message') : null;

  const pages = document.querySelectorAll('.page');
  let currentRoute = '';
  let downloadLinks = {};

  function applyDynamicLinks(links) {
    if (!links || typeof links !== 'object') return;
    document.querySelectorAll('.card').forEach(function (card) {
      var titleEl = card.querySelector('.card__title');
      var rawTitle = titleEl ? titleEl.textContent.trim() : '';
      var btn = card.querySelector('.btn--download');
      if (!btn) return;
      var btnName = btn.dataset.name ? btn.dataset.name.trim() : '';
      var matchedUrl = links[rawTitle] || (btnName && links[btnName]);
      if (matchedUrl && matchedUrl.trim() !== '') {
        btn.dataset.url = matchedUrl;
        if (btn.tagName === 'A') {
          btn.setAttribute('href', matchedUrl);
        }
      }
    });
  }

  // Fetch dynamic links on load & expose globally
  fetch('/api/links')
    .then(res => res.json())
    .then(data => {
      downloadLinks = data;
      window.downloadLinks = data;
      applyDynamicLinks(data);
    })
    .catch(err => console.error('Failed to load links:', err));

  function sanitizeRoute(input) {
    if (typeof input !== 'string') return 'home';
    const trimmed = input.replace(/[^a-z0-9-]/g, '');
    const resolved = ROUTE_ALIASES[trimmed] || trimmed;
    return ALLOWED_ROUTES.includes(resolved) ? resolved : 'home';
  }

  function getRoute() {
    const raw = location.hash.replace(/^#/, '').trim();
    return sanitizeRoute(raw);
  }

  function showPage(route) {
    pages.forEach(function (p) { p.classList.remove('page--active'); });
    var el = document.getElementById(route);
    if (el) {
      el.classList.add('page--active');
      el.scrollIntoView({ behavior: 'instant', block: 'start' });
    }
    currentRoute = route;
  }

  function updateNav(route) {
    if (!navLinks) return;
    navLinks.querySelectorAll('a').forEach(function (a) {
      a.classList.toggle('active', a.dataset.link === route);
    });
  }

  function animateStats() {
    var nums = document.querySelectorAll('.stat__num');
    nums.forEach(function (el) {
      var target = parseFloat(el.dataset.target);
      if (isNaN(target)) return;
      var current = 0;
      var step = target / 40;
      function update() {
        current += step;
        if (current >= target) {
          el.textContent = target >= 10 ? Math.round(target) : target.toFixed(1);
          return;
        }
        el.textContent = target >= 10 ? Math.round(current) : current.toFixed(1);
        requestAnimationFrame(update);
      }
      requestAnimationFrame(update);
    });
  }

  function staggerCards() {
    var cards = document.querySelectorAll('.page--active .card');
    cards.forEach(function (card, i) {
      card.style.animation = 'none';
      void card.offsetHeight;
      card.style.animation = '';
      card.style.setProperty('animation-delay', (i * 0.08) + 's');
    });
  }

  function createCheckmarkIcon() {
    var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('class', 'btn__icon');
    svg.setAttribute('width', '16');
    svg.setAttribute('height', '16');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('fill', 'none');
    svg.setAttribute('stroke', 'currentColor');
    svg.setAttribute('stroke-width', '3');
    svg.setAttribute('stroke-linecap', 'round');
    svg.setAttribute('stroke-linejoin', 'round');
    var polyline = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
    polyline.setAttribute('points', '20 6 9 17 4 12');
    svg.appendChild(polyline);
    return svg;
  }

  function getDownloadName(btn) {
    var card = btn.closest('.card');
    if (!card) return 'File';
    var title = card.querySelector('.card__title');
    return title ? title.textContent.trim() : 'File';
  }

  function handleDownload(btn, e) {
    if (!btn || btn.disabled || btn.hasAttribute('disabled') || btn.classList.contains('disabled')) return;
    var name = getDownloadName(btn);
    var lookupName = name;
    if (name === 'Optimization Settings') lookupName = 'Paid Sensi Settings';
    if (name === 'Optimization File') lookupName = 'Paid Sensi File';

    // 1. Direct dataset URL on button or link element
    var directUrl = btn.dataset.url || null;

    // 2. Check href on button or parent anchor element
    if (!directUrl) {
      if (btn.tagName === 'A' && btn.getAttribute('href') && btn.getAttribute('href') !== '#') {
        directUrl = btn.getAttribute('href');
      } else {
        var parentAnchor = btn.closest('a');
        if (parentAnchor && parentAnchor.getAttribute('href') && parentAnchor.getAttribute('href') !== '#') {
          directUrl = parentAnchor.getAttribute('href');
        }
      }
    }

    // 3. Fallback to inline onclick attribute if still present
    if (!directUrl) {
      var onclickAttr = btn.getAttribute('onclick');
      if (onclickAttr && onclickAttr.indexOf("window.open('") !== -1) {
        directUrl = onclickAttr.split("window.open('")[1].split("'")[0];
        btn.dataset.url = directUrl; 
        btn.removeAttribute('onclick');
      }
    }

    // 4. Dynamic downloadLinks take precedence over static dataset fallback
    var href = downloadLinks[lookupName] || downloadLinks[name] || directUrl;
    
    if (e) {
      e.preventDefault();
    }
    
    if (href && href !== '#' && href.trim() !== '') {
      fetch('/api/track/' + encodeURIComponent(name), { method: 'POST' }).catch(function(){});
      window.open(href, '_blank');
      showToast('Download Started', 'Opening ' + name + '...');
    } else {
      showToast('Notice', 'Download link not configured. Joining Discord support...');
      setTimeout(function() {
        window.open(DISCORD_URL, '_blank');
      }, 1200);
    }
  }

  function showToast(title, message) {
    if (!toast) return;
    toast.classList.remove('toast--exit');
    if (toastTitle) toastTitle.textContent = title;
    if (toastMessage) toastMessage.textContent = message;
    toast.removeAttribute('hidden');
    clearTimeout(toast._timer);
    toast._timer = setTimeout(function () {
      toast.classList.add('toast--exit');
      setTimeout(function () {
        toast.setAttribute('hidden', '');
        toast.classList.remove('toast--exit');
      }, 200);
    }, 3800);
  }

  function onScroll() {
    if (nav) nav.classList.toggle('nav--scrolled', window.scrollY > 20);
  }

  function setupImages(scope) {
    if (!scope) return;
    scope.querySelectorAll('.card__icon img').forEach(function (img) {
      if (!img.dataset.loaded) {
        img.dataset.loaded = 'false';
        img.addEventListener('load', function () { img.dataset.loaded = 'true'; }, { once: true });
        img.addEventListener('error', function () { img.dataset.loaded = 'true'; }, { once: true });
        if (img.complete) img.dataset.loaded = 'true';
      }
    });
  }

  function navigate(route) {
    route = sanitizeRoute(route);
    if (route === currentRoute) return;
    showPage(route);
    updateNav(route);
    history.pushState(null, '', '#' + route);
    if (nav) nav.classList.remove('nav--open');
    window.scrollTo({ top: 0, behavior: 'instant' });
    setupImages(document.getElementById(route));
    setTimeout(function () { staggerCards(); }, 50);
    if (route === 'home') setTimeout(animateStats, 100);
  }

  const optModal = document.getElementById('opt-modal');
  const optModalClose = document.getElementById('opt-modal-close');
  const tutorialModal = document.getElementById('tutorial-modal');
  const tutorialModalClose = document.getElementById('tutorial-modal-close');
  const bypassNoticeModal = document.getElementById('bypass-notice-modal');
  const bypassNoticeModalClose = document.getElementById('bypass-notice-modal-close');
  const bypassNoticeModalCancel = document.getElementById('bypass-notice-modal-cancel');

  function openBypassNoticeModal() {
    if (bypassNoticeModal) bypassNoticeModal.removeAttribute('hidden');
  }

  function closeBypassNoticeModal() {
    if (bypassNoticeModal) bypassNoticeModal.setAttribute('hidden', '');
  }


  function openOptimizationModal() {
    if (optModal) optModal.removeAttribute('hidden');
  }

  function closeOptimizationModal() {
    if (optModal) optModal.setAttribute('hidden', '');
  }



  function openTutorialModal() {
    if (tutorialModal) tutorialModal.removeAttribute('hidden');
  }

  function closeTutorialModal() {
    if (tutorialModal) {
      tutorialModal.setAttribute('hidden', '');
      var iframe = tutorialModal.querySelector('iframe');
      if (iframe) {
        var s = iframe.src;
        iframe.src = '';
        iframe.src = s;
      }
    }
  }

  if (optModalClose) {
    optModalClose.addEventListener('click', closeOptimizationModal);
  }

  if (optModal) {
    optModal.addEventListener('click', function (e) {
      if (e.target === optModal) {
        closeOptimizationModal();
      }
    });
  }



  if (tutorialModalClose) {
    tutorialModalClose.addEventListener('click', closeTutorialModal);
  }

  if (tutorialModal) {
    tutorialModal.addEventListener('click', function (e) {
      if (e.target === tutorialModal) {
        closeTutorialModal();
      }
    });
  }

  if (bypassNoticeModalClose) {
    bypassNoticeModalClose.addEventListener('click', closeBypassNoticeModal);
  }
  if (bypassNoticeModalCancel) {
    bypassNoticeModalCancel.addEventListener('click', closeBypassNoticeModal);
  }
  if (bypassNoticeModal) {
    bypassNoticeModal.addEventListener('click', function (e) {
      if (e.target === bypassNoticeModal) {
        closeBypassNoticeModal();
      }
    });
  }

  document.addEventListener('click', function (e) {
    var btn = e.target.closest('.btn--download');
    if (btn && !btn.closest('.hero__actions')) {
      if (btn.disabled || btn.hasAttribute('disabled') || btn.classList.contains('disabled')) {
        e.preventDefault();
        return;
      }
      var name = getDownloadName(btn);
      if (name === 'Free Bypass' || btn.dataset.name === 'Free Bypass' || btn.id === 'btn-free-bypass') {
        e.preventDefault();
        openBypassNoticeModal();
        showToast('Notice', 'Free Bypass will coming soon. Only Paid Bypass available for now.');
        return;
      }
      if (name.includes('Optimization') && btn.closest('#optimization')) {
        e.preventDefault();
        openOptimizationModal();
        return;
      }
      handleDownload(btn, e);
    }
  });

  if (navToggle && nav) {
    navToggle.addEventListener('click', function (e) {
      e.stopPropagation();
      var isOpen = nav.classList.toggle('nav--open');
      navToggle.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
    });
  }

  document.addEventListener('click', function (e) {
    if (nav && nav.classList.contains('nav--open') && !nav.contains(e.target)) {
      nav.classList.remove('nav--open');
      if (navToggle) navToggle.setAttribute('aria-expanded', 'false');
    }
  });

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') {
      if (nav && nav.classList.contains('nav--open')) {
        nav.classList.remove('nav--open');
        if (navToggle) {
          navToggle.setAttribute('aria-expanded', 'false');
          navToggle.focus();
        }
      }
      closeOptimizationModal();
      closeTutorialModal();
      closeBypassNoticeModal();
    }
  });

  document.addEventListener('click', function (e) {
    var link = e.target.closest('[data-link]');
    if (link) {
      e.preventDefault();
      var route = link.getAttribute('data-link');
      if (route) navigate(route);
      if (nav && nav.classList.contains('nav--open')) {
        nav.classList.remove('nav--open');
        if (navToggle) navToggle.setAttribute('aria-expanded', 'false');
      }
    }
  });

  window.addEventListener('popstate', function () { navigate(getRoute()); });
  window.addEventListener('scroll', onScroll, { passive: true });

  if (toast) {
    var toastClose = toast.querySelector('.toast__close');
    if (toastClose) {
      toastClose.addEventListener('click', function () {
        toast.classList.add('toast--exit');
        setTimeout(function () {
          toast.setAttribute('hidden', '');
          toast.classList.remove('toast--exit');
        }, 200);
      });
    }
  }

  document.addEventListener('mousemove', function (e) {
    var btn = e.target.closest('.btn');
    if (btn) {
      var rect = btn.getBoundingClientRect();
      var x = ((e.clientX - rect.left) / rect.width) * 100;
      var y = ((e.clientY - rect.top) / rect.height) * 100;
      btn.style.setProperty('--mx', x + '%');
      btn.style.setProperty('--my', y + '%');
    }
  });

  document.addEventListener('click', function (e) {
    var btn = e.target.closest('.btn');
    if (!btn) return;
    var rect = btn.getBoundingClientRect();
    var size = Math.max(rect.width, rect.height);
    var x = e.clientX - rect.left - size / 2;
    var y = e.clientY - rect.top - size / 2;
    var ripple = document.createElement('span');
    ripple.className = 'ripple';
    Object.assign(ripple.style, {
      width: size + 'px',
      height: size + 'px',
      left: x + 'px',
      top: y + 'px'
    });
    if (getComputedStyle(btn).position === 'static') {
      btn.style.position = 'relative';
    }
    btn.appendChild(ripple);
    setTimeout(function () { ripple.remove(); }, 600);
  });

  var route = getRoute();
  showPage(route);
  updateNav(route);
  onScroll();
  setupImages(document.getElementById(route));
  if (route === 'home') setTimeout(animateStats, 100);
  setTimeout(staggerCards, 50);
  var yearEl = document.getElementById('footer-year');
  if (yearEl) yearEl.textContent = new Date().getFullYear();

})();