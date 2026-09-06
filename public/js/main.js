document.addEventListener('DOMContentLoaded', async () => {
  try {
    const res = await fetch('/api/cards');
    if (!res.ok) throw new Error('Failed to fetch cards');
    const cards = await res.json();
    
    cards.forEach(card => {
      // Find the target container for this section
      let container = document.querySelector(`#${card.section_id} .grid`);
      if (!container) container = document.querySelector(`#${card.section_id} .modal-grid`); // fallback for paid sensi modal
      
      if (container) {
        // Prevent duplicate cards if card already exists statically in the section
        const existingTitles = Array.from(container.querySelectorAll('.card__title')).map(el => el.textContent.trim().toLowerCase());
        const cardTitle = (card.title || '').trim().toLowerCase();
        const existingUrls = Array.from(container.querySelectorAll('.btn--download')).map(el => (el.dataset.url || el.getAttribute('href') || '').trim());
        const cardUrl = (card.download_link || '').trim();

        const isDuplicateTitle = existingTitles.includes(cardTitle) || 
          (cardTitle.includes('grabb') && existingTitles.some(t => t.includes('grabb')));
        const isDuplicateUrl = cardUrl && existingUrls.includes(cardUrl);

        if (isDuplicateTitle || isDuplicateUrl) {
          return;
        }

        // Construct the dynamic card HTML
        const accent = card.accent_color || 'purple';
        const isPrimaryBtn = card.button_type === 'primary';
        
        const cardHTML = `
          <div class="card" data-accent="${accent}">
            <div class="card__head">
              <div class="card__icon">
                <img src="${card.logo_url || 'assets/msi.logo.png'}" alt="${card.title}" width="40" height="40" loading="lazy" style="width: 40px; height: 40px; object-fit: contain; border-radius: 8px;">
              </div>
              <h3 class="card__title">${card.title}</h3>
              ${card.badge_text ? `<span class="card__badge">${card.badge_text}</span>` : ''}
            </div>
            <div class="card__body" style="padding: 1rem 1.5rem; color: var(--text-secondary); font-size: 0.95rem; line-height: 1.5;">
              ${card.description ? card.description.replace(/\n/g, '<br/>') : ''}
            </div>
            <a href="${card.download_link || '#'}" data-url="${card.download_link || ''}" target="_blank" rel="noopener noreferrer" class="btn ${isPrimaryBtn ? 'btn--primary' : 'btn--secondary'} btn--download" style="width: 100%; text-decoration: none; margin-top: auto;">
              <svg class="btn__icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
              ${card.button_text || 'Download'}
            </a>
          </div>
        `;
        
        container.insertAdjacentHTML('beforeend', cardHTML);
      }
    });
  } catch (e) {
    console.error("Failed to load dynamic cards:", e);
  }

  // Dynamic cards are handled by main.js, page navigation and toggle are handled by script.js
});
