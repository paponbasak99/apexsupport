(function () {
  'use strict';

  const ALLOWED_ROUTES = Object.freeze([
    'home',
    'apk',
    'emulator',
    'panel-fix',
    'bypass-fix',
    'optimization',
    'other-issues',
    'faq'
  ]);
  const ROUTE_ALIASES = Object.freeze({
    'free-panel': 'apk',
    'free-panel-download': 'apk',
    'panel': 'panel-fix',
    'panel-issue': 'panel-fix',
    'panel-fix': 'panel-fix',
    'bypass-issue': 'bypass-fix',
    'uid-bypass-fix': 'bypass-fix',
    'uid-bypass': 'bypass-fix',
    'lib-bypass': 'bypass-fix',
    'lib-bypass-fix': 'bypass-fix',
    'internal-fix': 'panel-fix',
    'tutorial-video': 'other-issues',
    'tutorial-setup-video': 'other-issues',
    'tutorial-setup': 'other-issues',
    'tutorial': 'other-issues'
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

  function showPage(route, smooth) {
    var el = document.getElementById(route);
    if (el) {
      el.scrollIntoView({ behavior: smooth ? 'smooth' : 'auto', block: 'start' });
      el.querySelectorAll('.scroll-reveal').forEach(function (node) {
        node.classList.add('revealed');
      });
    }
    updateNav(route);
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
    showPage(route, true);
    history.pushState(null, '', '#' + route);
    if (nav) nav.classList.remove('nav--open');
    if (navToggle) navToggle.setAttribute('aria-expanded', 'false');
  }

  const optModal = document.getElementById('opt-modal');
  const optModalClose = document.getElementById('opt-modal-close');

  function openOptimizationModal() {
    if (optModal) optModal.removeAttribute('hidden');
  }

  function closeOptimizationModal() {
    if (optModal) optModal.setAttribute('hidden', '');
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

  document.addEventListener('click', function (e) {
    var btn = e.target.closest('.btn--download');
    if (btn && !btn.closest('.hero__actions')) {
      if (btn.disabled || btn.hasAttribute('disabled') || btn.classList.contains('disabled')) {
        e.preventDefault();
        return;
      }
      var name = getDownloadName(btn);
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
  updateNav(route || 'home');
  onScroll();
  setupImages(document);
  if (route && route !== 'home') {
    setTimeout(function () {
      showPage(route, false);
    }, 150);
  }

  // ScrollSpy: auto-detect active section as user scrolls and highlight navbar
  if ('IntersectionObserver' in window) {
    var spyObserver = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          var id = entry.target.id;
          updateNav(id);
          currentRoute = id;
        }
      });
    }, {
      rootMargin: '-20% 0px -55% 0px',
      threshold: 0
    });

    document.querySelectorAll('section[id]').forEach(function (sec) {
      spyObserver.observe(sec);
    });
  }

  // --- Scroll-Reveal Animations Engine (Hardware Accelerated 60FPS) ---
  function initScrollReveal() {
    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      return;
    }
    if (!('IntersectionObserver' in window)) {
      return;
    }

    document.documentElement.classList.add('has-scroll-anim');

    var revealSelectors = [
      '.section__header',
      '.card',
      '.faq-item',
      '.footer-pro'
    ];

    var targets = document.querySelectorAll(revealSelectors.join(', '));
    targets.forEach(function (el) {
      el.classList.add('scroll-reveal');
    });

    var revealObserver = new IntersectionObserver(function (entries, observer) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add('revealed');
          observer.unobserve(entry.target);
        }
      });
    }, {
      rootMargin: '0px 0px -40px 0px',
      threshold: 0.08
    });

    targets.forEach(function (el) {
      var rect = el.getBoundingClientRect();
      var viewportHeight = window.innerHeight || document.documentElement.clientHeight;
      if (rect.top < viewportHeight && rect.bottom > 0) {
        el.classList.add('revealed');
      } else {
        revealObserver.observe(el);
      }
    });
  }

  initScrollReveal();

  // --- 1. Global Instant Fix Search ---
  const searchInput = document.getElementById('global-search');
  const searchClear = document.getElementById('search-clear');
  const searchStats = document.getElementById('search-stats');

  function filterFixes(query) {
    const q = (query || '').trim().toLowerCase();
    if (!q) {
      document.querySelectorAll('.card').forEach(function (c) {
        c.style.display = '';
      });
      if (searchStats) searchStats.style.display = 'none';
      if (searchClear) searchClear.style.display = 'none';
      return;
    }

    if (searchClear) searchClear.style.display = 'block';
    let count = 0;

    document.querySelectorAll('.card').forEach(function (card) {
      const text = card.textContent.toLowerCase();
      const title = (card.querySelector('.card__title')?.textContent || '').toLowerCase();
      const badge = (card.querySelector('.card__badge')?.textContent || '').toLowerCase();
      const keywords = (card.getAttribute('data-keywords') || '').toLowerCase();
      let match = text.includes(q) || title.includes(q) || badge.includes(q) || keywords.includes(q);
      if (q === '0xc00007b' || q === 'c00007b') {
        if (title.includes('directx') || title.includes('runtime') || title.includes('c++')) match = true;
      }
      if (q.includes('fps')) {
        if (title.includes('fps') || title.includes('sensi') || title.includes('optimi')) match = true;
      }
      if (match) {
        card.style.display = '';
        card.classList.add('revealed');
        count++;
      } else {
        card.style.display = 'none';
      }
    });

    if (searchStats) {
      searchStats.style.display = 'block';
      searchStats.textContent = count === 0 ? 'No matching fixes found. Join Discord for live help!' : 'Found ' + count + ' matching fix' + (count > 1 ? 'es' : '');
    }
  }

  if (searchInput) {
    searchInput.addEventListener('input', function (e) {
      filterFixes(e.target.value);
    });
  }

  if (searchClear && searchInput) {
    searchClear.addEventListener('click', function () {
      searchInput.value = '';
      filterFixes('');
      searchInput.focus();
    });
  }

  // --- 2. Copy CMD Quick Fix Buttons ---
  document.addEventListener('click', function (e) {
    const btn = e.target.closest('.btn-copy-cmd');
    if (!btn) return;
    const cmd = btn.getAttribute('data-cmd');
    if (!cmd) return;

    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(cmd).then(function () {
        btn.classList.add('copied');
        const span = btn.querySelector('span');
        if (span) span.textContent = 'Copied!';
        showToast('Command Copied', 'Paste into Command Prompt (Run as Administrator)');
        setTimeout(function () {
          btn.classList.remove('copied');
          if (span) span.textContent = 'Copy';
        }, 2500);
      }).catch(function () {
        showToast('Notice', 'Manual command: ' + cmd);
      });
    } else {
      showToast('Notice', 'Manual command: ' + cmd);
    }
  });

  // --- 3. FAQ Accordion Toggle ---
  document.addEventListener('click', function (e) {
    const questionBtn = e.target.closest('.faq-question');
    if (!questionBtn) return;
    const item = questionBtn.closest('.faq-item');
    if (!item) return;

    const isOpen = item.classList.contains('faq-open');
    document.querySelectorAll('.faq-item.faq-open').forEach(function (other) {
      if (other !== item) {
        other.classList.remove('faq-open');
        other.querySelector('.faq-question')?.setAttribute('aria-expanded', 'false');
      }
    });

    item.classList.toggle('faq-open', !isOpen);
    questionBtn.setAttribute('aria-expanded', !isOpen ? 'true' : 'false');
  });

  // --- 4. Live Real-Time Screen & Hardware Intelligence ---
  function getAspect(w, h) {
    if (!w || !h) return '16:9';
    const ratio = w / h;
    if (Math.abs(ratio - 16 / 9) < 0.05) return '16:9';
    if (Math.abs(ratio - 16 / 10) < 0.05) return '16:10';
    if (Math.abs(ratio - 21 / 9) < 0.08 || ratio > 2.2) return '21:9 UW';
    if (Math.abs(ratio - 4 / 3) < 0.05) return '4:3';
    return ratio.toFixed(2) + ':1';
  }

  function applyRecommendations(preset, fps, w, h) {
    const resEl = document.getElementById('diag-res');
    const fpsEl = document.getElementById('diag-fps');
    const recEl = document.getElementById('diag-rec');
    if (!recEl) return;

    const realW = w || window.screen.width || 1920;
    const realH = h || window.screen.height || 1080;
    const aspect = getAspect(realW, realH);

    if (preset === '1080p-60') {
      if (resEl) resEl.textContent = '1920x1080 (16:9 FHD)';
      if (fpsEl) fpsEl.textContent = '60–90 Hz Esports';
      recEl.textContent = '90 FPS Unlocker + Smart Keymap';
      recEl.style.color = '#38bdf8';
    } else if (preset === '1080p-144') {
      if (resEl) resEl.textContent = '1920x1080 (16:9 FHD)';
      if (fpsEl) fpsEl.textContent = '144 Hz High-Refresh';
      recEl.textContent = '144 FPS Registry + DirectX 12';
      recEl.style.color = '#a855f7';
    } else if (preset === '1440p-165') {
      if (resEl) resEl.textContent = '2560x1440 (16:9 2K QHD)';
      if (fpsEl) fpsEl.textContent = '165 Hz Ultra Sharp';
      recEl.textContent = '2K High-DPI Patch + 165 FPS';
      recEl.style.color = '#38bdf8';
    } else if (preset === '1080p-240') {
      if (resEl) resEl.textContent = '1920x1080 (Competitive)';
      if (fpsEl) fpsEl.textContent = '240 Hz Apex Pro';
      recEl.textContent = 'Apex 240 FPS Ultra Engine';
      recEl.style.color = '#ec4899';
    } else if (preset === 'ultrawide') {
      if (resEl) resEl.textContent = '2560x1080 (21:9 UW)';
      if (fpsEl) fpsEl.textContent = 'Ultrawide High-FOV';
      recEl.textContent = '21:9 Aspect Ratio FOV Fix';
      recEl.style.color = '#eab308';
    } else {
      // Auto-Detect real screen
      if (resEl) resEl.textContent = realW + 'x' + realH + ' (' + aspect + ')';
      const measuredFps = fps || 60;
      if (measuredFps >= 140) {
        recEl.textContent = (measuredFps >= 200 ? '240 FPS Ultra Engine' : '144 FPS Registry Patch');
      } else {
        recEl.textContent = '90 FPS Unlocker + C++ Pack';
      }
      recEl.style.color = '#4ade80';
    }
  }

  function detectSystemSpecs() {
    const resEl = document.getElementById('diag-res');
    const fpsEl = document.getElementById('diag-fps');
    const gpuEl = document.getElementById('diag-gpu');
    const screenSelect = document.getElementById('screen-preset-select');

    // 1. Live Screen Detection
    const realW = window.screen.width || 1920;
    const realH = window.screen.height || 1080;
    const dpr = window.devicePixelRatio || 1;
    const aspect = getAspect(realW, realH);

    const savedPreset = localStorage.getItem('apex_selected_screen') || 'auto';
    if (screenSelect && screenSelect.value !== savedPreset) {
      screenSelect.value = savedPreset;
    }

    if (savedPreset === 'auto') {
      if (resEl) {
        resEl.textContent = realW + 'x' + realH + ' (' + aspect + ')';
        resEl.title = 'Real-Time Screen: ' + realW + 'x' + realH + ' | DPI: ' + Math.round(dpr * 100) + '%';
      }
    }

    // 2. Real-Time Display Refresh Detection
    if (fpsEl) {
      let frames = 0;
      let start = performance.now();
      function measure(now) {
        frames++;
        if (now - start >= 600) {
          const estimatedFps = Math.round((frames * 1000) / (now - start));
          let displayRate = '60 Hz';
          if (estimatedFps > 130 && estimatedFps <= 155) displayRate = '144 Hz';
          else if (estimatedFps > 155 && estimatedFps <= 180) displayRate = '165 Hz';
          else if (estimatedFps > 200) displayRate = '240 Hz';
          else if (estimatedFps > 70 && estimatedFps <= 130) displayRate = estimatedFps + ' Hz Live';
          else displayRate = estimatedFps + ' Hz';

          const currentPreset = screenSelect ? screenSelect.value : savedPreset;
          if (currentPreset === 'auto') {
            fpsEl.textContent = displayRate;
          }
          applyRecommendations(currentPreset, estimatedFps, realW, realH);
        } else {
          requestAnimationFrame(measure);
        }
      }
      requestAnimationFrame(measure);
    }

    // 3. GPU Hardware Engine Detection
    if (gpuEl) {
      try {
        const canvas = document.createElement('canvas');
        const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
        if (gl) {
          const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
          if (debugInfo) {
            const renderer = gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) || '';
            const dprText = Math.round(dpr * 100) + '% DPI';
            if (renderer.includes('NVIDIA')) gpuEl.textContent = 'NVIDIA GeForce (' + dprText + ')';
            else if (renderer.includes('AMD') || renderer.includes('Radeon')) gpuEl.textContent = 'AMD Radeon (' + dprText + ')';
            else if (renderer.includes('Intel')) gpuEl.textContent = 'Intel HD Graphics';
            else if (renderer.includes('Direct3D') || renderer.includes('ANGLE')) gpuEl.textContent = 'Direct3D Engine';
            else gpuEl.textContent = (renderer.slice(0, 14) || 'Hardware Accel') + ' (' + dprText + ')';
          } else {
            gpuEl.textContent = 'Hardware Accel';
          }
        } else {
          gpuEl.textContent = 'DirectX Standard';
        }
      } catch (err) {
        gpuEl.textContent = 'DirectX 11/12';
      }
    }
  }

  // Interactive Screen Selector & Live Detect Button
  const screenSelect = document.getElementById('screen-preset-select');
  const btnDetectScreen = document.getElementById('btn-detect-screen');

  if (screenSelect) {
    const saved = localStorage.getItem('apex_selected_screen');
    if (saved) {
      screenSelect.value = saved;
      applyRecommendations(saved);
    }

    screenSelect.addEventListener('change', function () {
      const val = screenSelect.value;
      localStorage.setItem('apex_selected_screen', val);
      applyRecommendations(val);
      const text = screenSelect.options[screenSelect.selectedIndex]?.textContent || val;
      showToast('Screen Selected', text);
    });
  }

  if (btnDetectScreen) {
    btnDetectScreen.addEventListener('click', function () {
      if (screenSelect) screenSelect.value = 'auto';
      localStorage.setItem('apex_selected_screen', 'auto');
      detectSystemSpecs();
      const realW = window.screen.width || 1920;
      const realH = window.screen.height || 1080;
      const dpr = window.devicePixelRatio || 1;
      showToast('Real-Time Screen Detected', realW + 'x' + realH + ' (' + getAspect(realW, realH) + ') @ ' + Math.round(dpr * 100) + '% Scale');
    });
  }

  setTimeout(detectSystemSpecs, 200);

  var yearEl = document.getElementById('footer-year');
  if (yearEl) yearEl.textContent = new Date().getFullYear();

})();