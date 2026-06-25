(function () {
  'use strict';

  const ALLOWED_ROUTES = Object.freeze(['home', 'emulator', 'optimization', 'bypass-issue', 'panel-issue', 'internal-fix', 'other-issues']);
  const DISCORD_URL = 'https://discord.gg/CPaEMTHtJd';

  const nav = document.getElementById('nav');
  const navToggle = document.getElementById('nav-toggle');
  const navLinks = document.getElementById('nav-links');
  const content = document.getElementById('content');
  const toast = document.getElementById('toast');
  const toastTitle = toast.querySelector('.toast__title');
  const toastMessage = toast.querySelector('.toast__message');

  const pages = document.querySelectorAll('.page');
  let currentRoute = '';
  let downloadLinks = {};
  // Fetch dynamic links on load
  fetch('/api/links')
    .then(res => res.json())
    .then(data => { downloadLinks = data; })
    .catch(err => console.error('Failed to load links:', err));

  function sanitizeRoute(input) {
    if (typeof input !== 'string') return 'home';
    const trimmed = input.replace(/[^a-z0-9-]/g, '');
    return ALLOWED_ROUTES.includes(trimmed) ? trimmed : 'home';
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
  if (!btn || btn.dataset.downloading === 'true') return;
  var name = getDownloadName(btn);
  var isLink = btn.tagName === 'A' || btn.tagName === 'BUTTON';
  var lookupName = name;
  if (name === 'Optimization Settings') lookupName = 'Paid Sensi Settings';
  if (name === 'Optimization File') lookupName = 'Paid Sensi File';

  // Extract URL from inline onclick if available, and cache it to prevent second-click bugs!
  var fallbackUrl = btn.dataset.url || null;
  if (!fallbackUrl) {
    var onclickAttr = btn.getAttribute('onclick');
    if (onclickAttr && onclickAttr.indexOf("window.open('") !== -1) {
      fallbackUrl = onclickAttr.split("window.open('")[1].split("'")[0];
      btn.dataset.url = fallbackUrl; // Cache it for future clicks
      btn.removeAttribute('onclick'); // Remove it so it doesn't fire instantly bypassing the animation
    }
  }

  var href = downloadLinks[lookupName] || fallbackUrl || (btn.tagName === 'A' ? btn.getAttribute('href') : null);
  
  if (e) {
    e.preventDefault();
  }
  
  // Synchronously open a loading window to avoid popup blockers, but make it look nice!
  var newWin = null;
  if (href && href !== '#' && href.trim() !== '') {
    newWin = window.open('about:blank', '_blank');
    if (newWin) {
      newWin.document.write('<body style="display:flex;justify-content:center;align-items:center;height:100vh;margin:0;background-color:#0d0e15;color:#fff;font-family:system-ui,sans-serif;"><div style="text-align:center;"><div style="width:40px;height:40px;border:3px solid rgba(255,255,255,0.2);border-top-color:#7ecf8a;border-radius:50%;animation:spin 1s linear infinite;margin:0 auto 15px;"></div><h2 style="margin:0;font-size:18px;font-weight:500;">Securing Connection...</h2></div><style>@keyframes spin { 100% { transform: rotate(360deg); } }</style></body>');
      newWin.document.title = 'Connecting...';
    }
  }
  
  btn.dataset.downloading = 'true';

  var originalHTML = btn.innerHTML;
  var savedAttributes = [];
  for (var j = 0; j < btn.attributes.length; j++) {
    if (btn.attributes[j].name !== 'data-downloading') {
      savedAttributes.push({ name: btn.attributes[j].name, value: btn.attributes[j].value });
    }
  }

  btn.classList.add('connecting');
  btn.innerHTML = '<span class="loader__spinner" style="width:16px;height:16px;border-width:2px;display:inline-block;vertical-align:middle;margin-right:8px;border-top-color:#fff;"></span> Connecting...';

  setTimeout(function() {
    btn.classList.remove('connecting');
    btn.classList.add('downloading');
    btn.innerHTML = originalHTML;

    var bar = document.createElement('span');
    bar.className = 'btn__progress';
    btn.appendChild(bar);

    var progress = 0;
    var startTime = performance.now();
    var duration = 500;
    var animationFrameId;
    
    function animate(timestamp) {
      var elapsed = timestamp - startTime;
      var progressPercent = Math.min(elapsed / duration, 1);
      
      var easeOutCubic = 1 - Math.pow(1 - progressPercent, 3);
      progress = easeOutCubic * 100;
      
      bar.style.width = progress + '%';
      
      if (progressPercent < 1) {
        animationFrameId = requestAnimationFrame(animate);
      } else {
        completeDownload(btn, name, isLink, href, originalHTML, savedAttributes, newWin);
      }
    }
    
    animationFrameId = requestAnimationFrame(animate);
    showToast('Download Starting', 'Opening download for ' + name + '.');
  }, 200);
}

function triggerButtonHalo(btn) {
  var rect = btn.getBoundingClientRect();
  var centerX = rect.left + rect.width / 2 + window.scrollX;
  var centerY = rect.top + rect.height / 2 + window.scrollY;

  var ring = document.createElement('span');
  Object.assign(ring.style, {
    position: 'absolute',
    left: centerX + 'px',
    top: centerY + 'px',
    width: '10px',
    height: '10px',
    borderRadius: '50%',
    border: '2px solid #7ecf8a',
    boxShadow: '0 0 15px rgba(126, 207, 138, 0.4)',
    pointerEvents: 'none',
    zIndex: '3000',
    transform: 'translate(-50%, -50%) scale(1)',
    opacity: '1',
    transition: 'transform 0.5s cubic-bezier(0.1, 0.8, 0.3, 1), opacity 0.5s ease'
  });
  
  document.body.appendChild(ring);
  
  // Force reflow
  void ring.offsetHeight;
  
  // Animate: expand size and fade out
  ring.style.transform = 'translate(-50%, -50%) scale(12)';
  ring.style.opacity = '0';
  
  setTimeout(function() {
    ring.remove();
  }, 500);
}

function completeDownload(btn, name, isLink, href, originalHTML, savedAttributes, newWin) {
  var bar = btn.querySelector('.btn__progress');
  if (bar) {
    bar.style.width = '100%';
  }
  btn.classList.remove('downloading');
  btn.classList.add('complete');

  btn.innerHTML = '';
  btn.appendChild(createCheckmarkIcon());
  btn.appendChild(document.createTextNode(' Done!'));

  // Trigger high-end expand halo ripple
  triggerButtonHalo(btn);

  if (href && href !== '#' && href.trim() !== '') {
    fetch('/api/track/' + encodeURIComponent(name), { method: 'POST' }).catch(function(){});
    if (newWin) {
      newWin.location.href = href;
    } else {
      window.open(href, '_blank');
    }
  } else if (newWin) {
    newWin.close(); // Close blank window if no href found
  }

  setTimeout(function () {
    btn.innerHTML = originalHTML;
    btn.classList.remove('complete');
    delete btn.dataset.downloading;
    
    var oldBar = btn.querySelector('.btn__progress');
    if (oldBar) oldBar.remove();
  }, 800);
}

  function showToast(title, message) {
    toast.classList.remove('toast--exit');
    toastTitle.textContent = title;
    toastMessage.textContent = message;
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
    nav.classList.toggle('nav--scrolled', window.scrollY > 20);
  }

  function setupImages(scope) {
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
    nav.classList.remove('nav--open');
    window.scrollTo({ top: 0, behavior: 'instant' });
    setupImages(document.getElementById(route));
    setTimeout(function () { staggerCards(); }, 50);
    if (route === 'home') setTimeout(animateStats, 100);
  }

  const optModal = document.getElementById('opt-modal');
  const optModalClose = document.getElementById('opt-modal-close');
  const sensiModal = document.getElementById('sensi-modal');
  const sensiModalClose = document.getElementById('sensi-modal-close');

  function openOptimizationModal() {
    if (optModal) optModal.removeAttribute('hidden');
  }

  function closeOptimizationModal() {
    if (optModal) optModal.setAttribute('hidden', '');
  }

  function openSensiModal() {
    if (sensiModal) sensiModal.removeAttribute('hidden');
  }

  function closeSensiModal() {
    if (sensiModal) sensiModal.setAttribute('hidden', '');
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

  if (sensiModalClose) {
    sensiModalClose.addEventListener('click', closeSensiModal);
  }

  if (sensiModal) {
    sensiModal.addEventListener('click', function (e) {
      if (e.target === sensiModal) {
        closeSensiModal();
      }
    });
  }

  document.addEventListener('click', function (e) {
    var btn = e.target.closest('.btn--download');
    if (btn && !btn.closest('.hero__actions')) {
      var name = getDownloadName(btn);
      if (name === 'Optimization File' && btn.closest('#optimization')) {
        e.preventDefault();
        openOptimizationModal();
        return;
      }
      if (name === 'Paid Sensi' || name === 'Optimization') {
        e.preventDefault();
        openSensiModal();
        return;
      }
      handleDownload(btn, e);
    }
  });

  navToggle.addEventListener('click', function () {
    nav.classList.toggle('nav--open');
  });

  document.addEventListener('click', function (e) {
    if (nav.classList.contains('nav--open') && !nav.contains(e.target)) {
      nav.classList.remove('nav--open');
    }
  });

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') {
      nav.classList.remove('nav--open');
      closeOptimizationModal();
      closeSensiModal();
    }
  });

  navLinks.addEventListener('click', function (e) {
    var link = e.target.closest('[data-link]');
    if (link) {
      e.preventDefault();
      var route = link.getAttribute('data-link');
      if (route) navigate(route);
    }
  });

  window.addEventListener('popstate', function () { navigate(getRoute()); });
  window.addEventListener('scroll', onScroll, { passive: true });

  toast.querySelector('.toast__close').addEventListener('click', function () {
    toast.classList.add('toast--exit');
    setTimeout(function () {
      toast.setAttribute('hidden', '');
      toast.classList.remove('toast--exit');
    }, 200);
  });

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


})();
