document.addEventListener('DOMContentLoaded', () => {
  let csrfToken = '';
  let linksData = [];
  let cardsData = [];
  let pendingEdit = null;
  let searchTerm = '';
  let pendingDeleteId = null;
  let editingCardId = null;

  const loginOverlay = document.getElementById('loginOverlay');
  const appLayout = document.getElementById('appLayout');
  
  // Navigation
  document.querySelectorAll('.nav-item[data-view]').forEach(item => {
    item.addEventListener('click', () => {
      document.querySelectorAll('.nav-item').forEach(i => i.classList.remove('active'));
      document.querySelectorAll('.view-section').forEach(v => v.classList.remove('active'));
      
      item.classList.add('active');
      const viewId = item.getAttribute('data-view');
      document.getElementById('view-' + viewId).classList.add('active');
      
      // Update Title
      const titles = { dashboard: 'System Overview', links: 'Endpoint Management', activity: 'Audit Ledger', cards: 'Cards Management' };
      document.getElementById('pageTitle').textContent = titles[viewId] || 'APEX ELITE';

      if (viewId === 'links') loadLinks();
      else if (viewId === 'activity') loadActivity();
      else if (viewId === 'cards') loadCards();
      else loadDashboard();
    });
  });

  // Check auth state
  async function checkAuth() {
    try {
      const res = await fetch('/api/admin/check');
      const data = await res.json();
      if (data.loggedIn) {
        csrfToken = data.csrfToken;
        document.getElementById('currentUser').textContent = `OP_${data.username.toUpperCase()}`;
        loginOverlay.style.display = 'none';
        appLayout.style.display = 'flex';
        loadDashboard();
      }
    } catch (e) { console.error(e); }
  }
  
  checkAuth();

  // Login
  document.getElementById('loginBtn').addEventListener('click', async () => {
    const u = document.getElementById('adminUsername').value;
    const p = document.getElementById('adminPassword').value;
    
    const res = await fetch('/api/admin/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: u, password: p })
    });
    const data = await res.json();
    if (data.success) {
      csrfToken = data.csrfToken;
      document.getElementById('currentUser').textContent = `OP_${data.username.toUpperCase()}`;
      loginOverlay.style.display = 'none';
      appLayout.style.display = 'flex';
      loadDashboard();
    } else {
      document.getElementById('loginError').style.display = 'block';
    }
  });

  // Logout
  document.getElementById('logoutBtn').addEventListener('click', async () => {
    await fetch('/api/admin/logout', { method: 'POST' });
    location.reload();
  });

  async function api(url, method = 'GET', body = null) {
    const headers = { 'x-csrf-token': csrfToken };
    if (body) headers['Content-Type'] = 'application/json';
    const res = await fetch(url, { method, headers, body: body ? JSON.stringify(body) : null });
    if (res.status === 401 || res.status === 403) {
      location.reload();
    }
    return res.json();
  }

  // Dashboard
  let chartInstance = null;
  async function loadDashboard() {
    const data = await api('/api/admin/dashboard');
    document.getElementById('dash-total-clicks').textContent = data.totalClicks.toLocaleString();
    
    const tb = document.querySelector('#topLinksTable tbody');
    tb.innerHTML = data.topLinks.map(l => `
      <tr>
        <td style="font-family:'JetBrains Mono', monospace; font-size:0.9rem; color:var(--accent-primary);">${l.label}</td>
        <td style="text-align:right; font-weight:700;">${l.clicks}</td>
      </tr>
    `).join('');

    // Chart setup with gradient
    if (data.clickTrends && data.clickTrends.length > 0) {
      const ctx = document.getElementById('clicksChart').getContext('2d');
      if (chartInstance) chartInstance.destroy();
      
      const labels = data.clickTrends.map(t => t.date).reverse();
      const vals = data.clickTrends.map(t => t.count).reverse();
      
      let gradient = ctx.createLinearGradient(0, 0, 0, 400);
      gradient.addColorStop(0, 'rgba(37, 99, 235, 0.4)');
      gradient.addColorStop(1, 'rgba(37, 99, 235, 0.0)');

      chartInstance = new Chart(ctx, {
        type: 'line',
        data: {
          labels,
          datasets: [{
            label: 'Trajectories',
            data: vals,
            borderColor: '#2563eb',
            backgroundColor: gradient,
            borderWidth: 2,
            pointBackgroundColor: '#ffffff',
            pointBorderColor: '#2563eb',
            pointBorderWidth: 2,
            pointRadius: 4,
            fill: true,
            tension: 0.4
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { display: false } },
          scales: {
            y: { beginAtZero: true, grid: { color: 'rgba(0,0,0,0.05)' }, ticks: { color: '#888888' } },
            x: { grid: { display: false }, ticks: { color: '#888888', font: {family: 'JetBrains Mono'} } }
          }
        }
      });
    }
  }

  // Links
  async function loadLinks() {
    linksData = await api('/api/admin/links');
    renderLinksTable();
  }

  const searchInput = document.getElementById('searchLinks');
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      searchTerm = e.target.value;
      renderLinksTable();
    });
  }

  // Event delegation on table clicks to avoid CSP inline-handler restrictions
  const linksTable = document.getElementById('linksTable');
  if (linksTable) {
    linksTable.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-action]');
      if (!btn) return;
      
      const action = btn.getAttribute('data-action');
      const idVal = btn.getAttribute('data-id');
      const id = idVal ? Number(idVal) : null;
      const url = btn.getAttribute('data-url');
      
      if (action === 'save') {
        window.saveLink(id);
      } else if (action === 'cancel') {
        window.cancelEdit(id);
      } else if (action === 'copy') {
        window.copyUrl(url);
      } else if (action === 'edit') {
        window.editLink(id);
      } else if (action === 'delete') {
        window.promptDelete(id);
      }
    });
  }

  window.copyUrl = (url) => {
    navigator.clipboard.writeText(url).then(() => {
      // brief flash effect on the input or just fail silently.
    }).catch(e => console.error("Could not copy:", e));
  };

  function renderLinksTable() {
    const tb = document.querySelector('#linksTable tbody');
    let filteredLinks = linksData.filter(l => 
      l._editing || 
      (l.label && l.label.toLowerCase().includes(searchTerm.toLowerCase())) || 
      (l.url && l.url.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (l.category && l.category.toLowerCase().includes(searchTerm.toLowerCase()))
    );

    if (filteredLinks.length === 0) {
      tb.innerHTML = `<tr><td colspan="6" style="text-align:center; padding:2rem; color:var(--text-secondary);">No endpoints match your search.</td></tr>`;
      return;
    }

    tb.innerHTML = filteredLinks.map(l => {
      if (l._editing) {
        return `<tr>
          <td colspan="6" style="padding:0;">
            <div style="background:rgba(0,0,0,0.3); padding:1rem; border-left:3px solid #7ca8ff;">
              <div class="input-row">
                <input type="text" class="edit-input" id="edit-label-${l.id}" value="${l.label || ''}" placeholder="Label">
                <input type="text" class="edit-input" id="edit-url-${l.id}" value="${l.url || ''}" placeholder="https://">
                <select class="edit-input" style="max-width:150px;" id="edit-cat-${l.id}">
                  <option value="Uncategorized" ${l.category === 'Uncategorized' ? 'selected' : ''}>Uncategorized</option>
                  <option value="APK" ${l.category === 'APK' ? 'selected' : ''}>APK</option>
                  <option value="Emulator" ${l.category === 'Emulator' ? 'selected' : ''}>Emulator</option>
                  <option value="Driver" ${l.category === 'Driver' ? 'selected' : ''}>Driver</option>
                  <option value="Support" ${l.category === 'Support' ? 'selected' : ''}>Support</option>
                </select>
                <select class="edit-input" style="max-width:120px;" id="edit-active-${l.id}">
                  <option value="1" ${l.is_active?'selected':''}>Active</option>
                  <option value="0" ${!l.is_active?'selected':''}>Inactive</option>
                </select>
                <button class="btn btn-primary" data-action="save" data-id="${l.id}">Save</button>
                <button class="btn btn-icon" data-action="cancel" data-id="${l.id}"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg></button>
              </div>
            </div>
          </td>
        </tr>`;
      }

      return `<tr>
        <td style="font-weight:600; color:var(--text-primary);">${l.label}</td>
        <td style="font-family:'JetBrains Mono', monospace; font-size:0.85rem;">
          <div style="display:flex; align-items:center; gap:0.5rem;">
            <a href="${l.url}" target="_blank" style="color:var(--accent-primary); text-decoration:none;">
              ${l.url.length > 40 ? l.url.substring(0, 40) + '...' : (l.url || '—')}
            </a>
            ${l.url ? `<button class="btn-icon" data-action="copy" data-url="${l.url}" title="Copy URL" style="padding:0.2rem;"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg></button>` : ''}
          </div>
        </td>
        <td><span class="badge badge-neutral">${l.category}</span></td>
        <td><span class="badge ${l.is_active ? 'badge-success' : 'badge-danger'}">
          ${l.is_active ? '<span style="display:inline-block;width:6px;height:6px;background:currentColor;border-radius:50%;margin-right:4px;"></span> ACTIVE' : 'INACTIVE'}
        </span></td>
        <td>
          <div style="font-size:0.8rem; color:var(--text-secondary);">${new Date(l.updated_at).toLocaleDateString()}</div>
          <div style="font-size:0.75rem; font-family:'JetBrains Mono', monospace;">${l.updated_by_username ? `OP_${l.updated_by_username.toUpperCase()}` : 'SYS'}</div>
        </td>
        <td>
          <button class="btn-icon" data-action="edit" data-id="${l.id}" title="Edit Endpoint">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
          </button>
          <button class="btn-icon" style="color:var(--accent-danger);" data-action="delete" data-id="${l.id}" title="Delete Endpoint">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
          </button>
        </td>
      </tr>`;
    }).join('');
  }

  window.editLink = (id) => {
    linksData.forEach(x => x._editing = false); // only edit one at a time
    const l = linksData.find(x => x.id === id);
    l._editing = true;
    renderLinksTable();
  };

  window.cancelEdit = (id) => {
    if (id < 0) linksData = linksData.filter(x => x.id !== id);
    else {
      const l = linksData.find(x => x.id === id);
      l._editing = false;
    }
    renderLinksTable();
  };

  window.saveLink = (id) => {
    const label = document.getElementById(`edit-label-${id}`).value.trim();
    const url = document.getElementById(`edit-url-${id}`).value.trim();
    const category = document.getElementById(`edit-cat-${id}`).value.trim();
    const is_active = document.getElementById(`edit-active-${id}`).value === '1';

    if (url && url !== '#' && !url.startsWith('/')) {
      try { new URL(url); } catch (e) { alert("Invalid URL format."); return; }
    }

    const oldLink = linksData.find(x => x.id === id);
    pendingEdit = { id, label, url, category, is_active, isNew: id < 0 };

    if (!pendingEdit.isNew && oldLink.url !== url) {
      document.getElementById('diffLabel').textContent = label;
      document.getElementById('diffOldUrl').textContent = "- " + oldLink.url;
      document.getElementById('diffNewUrl').textContent = "+ " + url;
      document.getElementById('diffModal').classList.add('show');
    } else {
      executeSave();
    }
  };

  document.getElementById('btn-cancel-save').addEventListener('click', () => {
    document.getElementById('diffModal').classList.remove('show');
    pendingEdit = null;
  });

  document.getElementById('btn-confirm-save').addEventListener('click', () => {
    document.getElementById('diffModal').classList.remove('show');
    executeSave();
  });

  async function executeSave() {
    if (!pendingEdit) return;
    const { id, isNew, ...payload } = pendingEdit;
    
    let res = isNew ? await api('/api/admin/links', 'POST', payload) : await api(`/api/admin/links/${id}`, 'PUT', payload);

    if (res.error) alert(res.error);
    else await loadLinks();
    
    pendingEdit = null;
  }

  // Delete flow
  window.promptDelete = (id) => {
    const l = linksData.find(x => x.id === id);
    if (!l) return;
    pendingDeleteId = id;
    document.getElementById('deleteLabel').textContent = l.label;
    document.getElementById('deleteModal').classList.add('show');
  };

  document.getElementById('btn-cancel-delete').addEventListener('click', () => {
    document.getElementById('deleteModal').classList.remove('show');
    pendingDeleteId = null;
  });

  document.getElementById('btn-confirm-delete').addEventListener('click', async () => {
    if (!pendingDeleteId) return;
    document.getElementById('deleteModal').classList.remove('show');
    const res = await api(`/api/admin/links/${pendingDeleteId}`, 'DELETE');
    if (res.error) alert(res.error);
    else await loadLinks();
    pendingDeleteId = null;
  });

  document.getElementById('btn-add-link').addEventListener('click', () => {
    linksData.forEach(x => x._editing = false);
    linksData.unshift({
      id: -Date.now(),
      label: '', url: '', category: 'Uncategorized', is_active: 1, _editing: true
    });
    renderLinksTable();
  });

  // Activity Logs
  async function loadActivity() {
    const data = await api('/api/admin/activity');
    const tb = document.querySelector('#activityTable tbody');
    tb.innerHTML = data.map(a => {
      let details = '';
      if (a.target_type === 'link') {
        const o = a.old_value ? JSON.parse(a.old_value) : null;
        const n = a.new_value ? JSON.parse(a.new_value) : null;
        if (a.action === 'UPDATE' && o && n) {
          details = `Modified endpoint <span style="color:var(--text-primary);">${n.label}</span>. `;
          if (o.url !== n.url) details += `URL mutated. `;
          if (o.is_active !== n.is_active) details += `State -> ${n.is_active?'ACT':'INACT'}.`;
        } else if (a.action === 'CREATE') {
          details = `Deployed new endpoint: <span style="color:var(--text-primary);">${n.label}</span>`;
        } else if (a.action === 'DELETE') {
          details = `Permanently removed endpoint: <span style="color:var(--text-primary);">${o ? o.label : 'Unknown'}</span>`;
        }
      }
      
      let actionColor = a.action === 'DELETE' ? 'var(--accent-danger)' : a.action === 'CREATE' ? 'var(--accent-success)' : 'var(--accent-primary)';
      
      return `<tr>
        <td style="font-family:'JetBrains Mono', monospace; font-size:0.8rem; color:var(--text-secondary);">${new Date(a.created_at).toLocaleString()}</td>
        <td><span class="badge" style="background:rgba(255,255,255,0.05); color:var(--text-primary); font-family:'JetBrains Mono', monospace;">OP_${a.username?.toUpperCase()||'SYS'}</span></td>
        <td><strong style="color:${actionColor}">${a.action}</strong></td>
        <td><span class="badge badge-neutral">${a.target_type.toUpperCase()}</span></td>
        <td style="font-size:0.9rem; color:var(--text-secondary);">${details}</td>
      </tr>`;
    }).join('');
  }

  // --- CARDS MANAGEMENT ---
  async function loadCards() {
    cardsData = await api('/api/cards');
    renderCardsTable();
  }

  function renderCardsTable() {
    const tb = document.querySelector('#cardsTable tbody');
    if (cardsData.length === 0) {
      tb.innerHTML = `<tr><td colspan="5" style="text-align:center; padding:2rem; color:var(--text-secondary);">No cards configured.</td></tr>`;
      return;
    }

    tb.innerHTML = cardsData.map(c => `
      <tr>
        <td><span class="badge badge-neutral">${c.section_id}</span></td>
        <td style="font-weight:600; color:var(--text-primary);">${c.title}</td>
        <td style="font-family:'JetBrains Mono', monospace; font-size:0.85rem;">${c.logo_url ? c.logo_url.substring(0,20)+'...' : '—'}</td>
        <td><span class="badge" style="background:var(--accent-primary); color:#fff;">${c.badge_text || '—'}</span></td>
        <td>
          <button class="btn-icon" data-action="edit-card" data-id="${c.id}" title="Edit Card">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
          </button>
          <button class="btn-icon" style="color:var(--accent-danger);" data-action="delete-card" data-id="${c.id}" title="Delete Card">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
          </button>
        </td>
      </tr>
    `).join('');
  }

  const cardsTable = document.getElementById('cardsTable');
  if (cardsTable) {
    cardsTable.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-action]');
      if (!btn) return;
      const action = btn.getAttribute('data-action');
      const idVal = btn.getAttribute('data-id');
      const id = idVal ? Number(idVal) : null;
      if (action === 'edit-card') openCardModal(id);
      if (action === 'delete-card') promptDeleteCard(id);
    });
  }

  document.getElementById('btn-add-card').addEventListener('click', () => openCardModal());

  function openCardModal(id = null) {
    editingCardId = id;
    const modal = document.getElementById('cardModal');
    const titleEl = document.getElementById('cardModalTitle');
    
    if (id) {
      const c = cardsData.find(x => x.id === id);
      if (!c) return;
      titleEl.textContent = 'Edit Card';
      document.getElementById('cardSection').value = c.section_id;
      document.getElementById('cardAccent').value = c.accent_color;
      document.getElementById('cardTitle').value = c.title;
      document.getElementById('cardLogo').value = c.logo_url || '';
      document.getElementById('cardBadge').value = c.badge_text || '';
      document.getElementById('cardDesc').value = c.description || '';
      document.getElementById('cardLink').value = c.download_link || '';
      document.getElementById('cardBtnText').value = c.button_text || 'Download';
    } else {
      titleEl.textContent = 'Create New Card';
      document.getElementById('cardSection').value = 'emulator';
      document.getElementById('cardAccent').value = 'purple';
      document.getElementById('cardTitle').value = '';
      document.getElementById('cardLogo').value = '';
      document.getElementById('cardBadge').value = '';
      document.getElementById('cardDesc').value = '';
      document.getElementById('cardLink').value = '';
      document.getElementById('cardBtnText').value = 'Download';
    }
    modal.classList.add('show');
  }

  document.getElementById('btn-cancel-card').addEventListener('click', () => {
    document.getElementById('cardModal').classList.remove('show');
  });

  document.getElementById('btn-save-card').addEventListener('click', async () => {
    const payload = {
      section_id: document.getElementById('cardSection').value,
      accent_color: document.getElementById('cardAccent').value,
      title: document.getElementById('cardTitle').value.trim(),
      logo_url: document.getElementById('cardLogo').value.trim(),
      badge_text: document.getElementById('cardBadge').value.trim(),
      description: document.getElementById('cardDesc').value.trim(),
      download_link: document.getElementById('cardLink').value.trim(),
      button_text: document.getElementById('cardBtnText').value.trim()
    };
    
    if (!payload.title) { alert('Title is required'); return; }
    
    let res;
    if (editingCardId) {
      res = await api(`/api/admin/cards/${editingCardId}`, 'PUT', payload);
    } else {
      res = await api('/api/admin/cards', 'POST', payload);
    }
    
    if (res.error) alert(res.error);
    else {
      document.getElementById('cardModal').classList.remove('show');
      await loadCards();
    }
  });

  function promptDeleteCard(id) {
    const c = cardsData.find(x => x.id === id);
    if (!c) return;
    if (confirm(`Are you sure you want to delete the card: "${c.title}"?`)) {
      executeDeleteCard(id);
    }
  }

  async function executeDeleteCard(id) {
    const res = await api(`/api/admin/cards/${id}`, 'DELETE');
    if (res.error) alert(res.error);
    else await loadCards();
  }

  // --- IMAGE UPLOAD LOGIC ---
  const logoFileInput = document.getElementById('cardLogoFile');
  if (logoFileInput) {
    logoFileInput.addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (!file) return;

      const formData = new FormData();
      formData.append('logo', file);
      
      const statusEl = document.getElementById('uploadStatus');
      statusEl.textContent = 'Uploading...';
      statusEl.style.display = 'block';
      statusEl.style.color = 'var(--accent-primary)';

      try {
        const res = await fetch('/api/admin/upload', {
          method: 'POST',
          headers: { 'x-csrf-token': csrfToken },
          body: formData
        });
        const data = await res.json();
        
        if (data.success) {
          document.getElementById('cardLogo').value = data.url;
          statusEl.textContent = 'Upload successful!';
          statusEl.style.color = 'var(--accent-success)';
          setTimeout(() => statusEl.style.display = 'none', 3000);
        } else {
          statusEl.textContent = 'Upload failed: ' + data.error;
          statusEl.style.color = 'var(--accent-danger)';
        }
      } catch (err) {
        statusEl.textContent = 'Upload error: ' + err.message;
        statusEl.style.color = 'var(--accent-danger)';
      }
      
      // Reset input so the same file can be uploaded again if needed
      e.target.value = '';
    });
  }

});
