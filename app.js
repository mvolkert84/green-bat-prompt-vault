(() => {
  'use strict';
  const STORE = 'greenbat-prompt-vault-v2';
  const seed = window.GREEN_BAT_STARTER || {version:2,groups:[]};
  const clone = obj => JSON.parse(JSON.stringify(obj));
  const escapeHTML = value => String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  const color = c => /^#[0-9a-fA-F]{6}$/.test(c || '') ? c : '#97e7b6';
  const uid = () => (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

  const main = document.getElementById('mainContent');
  const modal = document.getElementById('modalScrim');
  const modalBody = document.getElementById('modalBody');
  const toastEl = document.getElementById('toast');
  const importInput = document.getElementById('importFile');
  let toastTimer;
  let deferredInstall;
  let data = getSaved();
  let page = 'home';
  let activeGroup = null;
  let query = '';
  let category = 'All';
  let groupSearchOpen = false;
  let homeSearchOpen = false;
  const expanded = new Set();

  function normalizePrompt(p) {
    return {
      id: String(p?.id || uid()).slice(0,100),
      title: String(p?.title || 'Untitled Prompt').slice(0,80),
      category: String(p?.category || 'Core').slice(0,30),
      text: String(p?.text || '').slice(0,1000),
      favorite: !!p?.favorite,
      origin: p?.origin === 'reconstructed' ? 'reconstructed' : 'user'
    };
  }

  function normalizeGroup(g) {
    const name = String(g?.name || 'Untitled Group').slice(0,60);
    const artwork = typeof g?.artwork === 'string' && g.artwork.startsWith('data:image/') && g.artwork.length < 3_500_000 ? g.artwork : '';
    return {
      id: String(g?.id || uid()).slice(0,100),
      name,
      genre: String(g?.genre || '').slice(0,90),
      description: String(g?.description || '').slice(0,160),
      monogram: String(g?.monogram || name[0] || 'G').slice(0,2).toUpperCase(),
      color: color(g?.color),
      artwork,
      prompts: Array.isArray(g?.prompts) ? g.prompts.map(normalizePrompt) : []
    };
  }

  function normalizeLibrary(raw) {
    return {
      version: 2,
      groups: Array.isArray(raw?.groups) ? raw.groups.map(normalizeGroup) : []
    };
  }

  function getSaved() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORE));
      if (saved && Array.isArray(saved.groups)) return normalizeLibrary(saved);
      const legacy = JSON.parse(localStorage.getItem('greenbat-prompt-vault-v1'));
      if (legacy && Array.isArray(legacy.groups)) return normalizeLibrary(legacy);
    } catch (e) { /* storage unavailable */ }
    return normalizeLibrary(seed);
  }

  function persist() {
    try { localStorage.setItem(STORE, JSON.stringify(normalizeLibrary(data))); }
    catch (e) { toast('Storage is full or unavailable — export a backup'); }
  }

  function allPrompts() {
    return data.groups.flatMap(g => g.prompts.map(p => ({...p, groupId: g.id, groupName: g.name, groupColor: g.color, groupArtwork: g.artwork || ''})));
  }

  function findGroup(id) { return data.groups.find(g => g.id === id); }
  function findPrompt(id) {
    for (const group of data.groups) {
      const prompt = group.prompts.find(p => p.id === id);
      if (prompt) return {group, prompt};
    }
    return null;
  }

  function statText() {
    const count = allPrompts().length;
    return `<div class="statline"><span class="stat"><strong>${data.groups.length}</strong> music groups</span><span class="stat"><strong>${count}</strong> style prompts</span><span class="stat">Offline ready · Desktop friendly · Local edits</span></div>`;
  }

  function searchMarkup(placeholder) {
    return `<label class="search-box"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="10.8" cy="10.8" r="7"/><path d="m16 16 5 5"/></svg><span class="sr-only">Search</span><input id="searchInput" type="search" value="${escapeHTML(query)}" placeholder="${escapeHTML(placeholder)}" autocomplete="off" aria-label="Search groups and prompts"></label>`;
  }


  const printedSleeves = new Map([
    ['vertigo', 'Vertigo'], ['state-of-tension', 'State of Tension'],
    ['enter-the-end', 'Enter the End'], ['4th-movement', '4th Movement'],
    ['after-dark', 'After Dark'], ['loose-change', 'Loose Change'],
    ['ever-after', 'Ever After Project'], ['pillars', 'Pillars']
  ]);

  const featuredSleeves = ['vertigo', 'state-of-tension', 'enter-the-end', '4th-movement'];
  function sleeveRank(id) {
    const index = featuredSleeves.indexOf(id);
    return index === -1 ? featuredSleeves.length : index;
  }

  function groupThumbMarkup(g, large = false) {
    const custom = Boolean(g.artwork);
    const printed = printedSleeves.has(g.id) && !custom;
    const sleeve = printed ? (large && g.id === 'vertigo' ? 'vertigo-crate' : g.id) : 'blank-sleeve';
    const artwork = g.artwork || './assets/vault/' + sleeve + '.webp';
    const showTitle = !printed || g.name.toLowerCase() !== printedSleeves.get(g.id).toLowerCase();
    return `<div class="sleeve-art mockup-sleeve ${custom ? 'custom-cover' : ''} ${sleeve === 'vertigo-crate' ? 'vertigo-crate-art' : ''}" style="--accent:${color(g.color)}">
      <img src="${escapeHTML(artwork)}" alt="" loading="${large ? 'eager' : 'lazy'}" decoding="async">
      ${showTitle ? `<span class="${custom || printed ? 'custom-sleeve-caption' : 'sleeve-art-title'}">${escapeHTML(g.name)}</span>` : ''}
    </div>`;
  }

  function groupCard(g) {
    const favs = g.prompts.filter(p => p.favorite).length;
    return '<button class="group-card record-sleeve mockup-group-card" type="button" data-group="' +
      escapeHTML(g.id) + '" style="--accent:' + color(g.color) + '" aria-label="Open ' +
      escapeHTML(g.name) + ', ' + g.prompts.length + ' style prompts">' +
      groupThumbMarkup(g) + '<span class="sleeve-favorite-indicator" title="' +
      favs + ' favorite prompts" aria-hidden="true">' + (favs ? '★' : '☆') +
      '</span></button>';
  }

  function featuredCard(p) {
    return `<div class="featured-card"><span class="mini">${escapeHTML(p.groupName)}</span><h3>${escapeHTML(p.title)}</h3><div class="minor">${escapeHTML(p.category)} · ${p.text.length} characters</div><button class="btn primary sm" type="button" data-copy="${escapeHTML(p.id)}">Copy prompt</button></div>`;
  }


function promptCard(p, showGroup = false) {
    const open = expanded.has(p.id);
    const pid = escapeHTML(p.id), accent = color(p.groupColor || '#96a96a');
    return '<article class="prompt-card mockup-preset" style="--track-accent:' + accent + '">' +
      '<div class="mockup-preset-row">' +
        '<button type="button" class="preset-reveal" data-expand="' + pid + '" aria-expanded="' + open +
          '" aria-label="' + (open ? 'Hide' : 'View') + ' full prompt: ' + escapeHTML(p.title) + '"><span aria-hidden="true"></span></button>' +
        '<div class="preset-name">' +
          '<h3>' + escapeHTML(p.title) + '</h3>' +
          '<span>' + (showGroup ? escapeHTML(p.groupName) + ' · ' : '') + escapeHTML(p.category) + '</span>' +
        '</div>' +
        '<button type="button" class="star preset-star ' + (p.favorite ? 'selected' : '') +
          '" data-favorite="' + pid + '" aria-label="' + (p.favorite ? 'Remove from' : 'Add to') +
          ' favorites">' + (p.favorite ? '★' : '☆') + '</button>' +
        '<button type="button" class="preset-copy" data-copy="' + pid + '" aria-label="Copy ' +
          escapeHTML(p.title) + ' to clipboard">Copy</button>' +
      '</div>' +
      (open ? '<div class="expanded-text mockup-expanded"><div class="preset-category">' +
        escapeHTML(p.category) + ' · ' + p.text.length +
        '/1000 characters</div>' + escapeHTML(p.text) +
        '<div class="preset-expanded-actions"><button type="button" class="btn ghost sm" data-edit-prompt="' +
        pid + '">Edit this preset</button></div></div>' : '') +
    '</article>';
  }

  function matchesPrompt(p, q) { return [p.title,p.category,p.text,p.groupName].join(' ').toLowerCase().includes(q); }


function renderHome() {
    const q = query.toLowerCase().trim();
    const matched = data.groups.filter(g => [g.name,g.genre,g.description,...g.prompts.map(p=>p.title+' '+p.text)]
      .join(' ').toLowerCase().includes(q))
      .sort((a, b) => sleeveRank(a.id) - sleeveRank(b.id));
    const favs = allPrompts().filter(p=>p.favorite).slice(0,6);
    main.innerHTML =
      '<section class="hero vault-masthead mockup-masthead">' +
        '<h1 class="vault-title">Green Bat<br>Prompt Vault</h1>' +
        '<p class="vault-tagline">Every sound. One vault.</p>' +
        '<nav class="vault-tabs" aria-label="Vault sections">' +
          '<button type="button" class="vault-tab active" data-action="show-groups">◉ &nbsp;Music Groups</button>' +
          '<button type="button" class="vault-tab" data-go="favorites">☆ &nbsp;Favorites</button>' +
        '</nav>' +
      '</section>' +
      (homeSearchOpen ? '<div class="vault-compact-toolbar">' + searchMarkup('Search records or Suno styles...') +
        '<button type="button" class="vault-small-add" data-action="add-group" title="Add group" aria-label="Add music group">+</button></div>' : '') +
      '<div class="section-bar mockup-section-bar" id="musicGroupsHeading">' +
        '<h2>Music Groups</h2><span class="section-note">' + matched.length + ' sleeves</span></div>' +
      '<section class="group-grid mockup-sleeve-grid" aria-label="Music group sleeves">' +
        matched.map(groupCard).join('') + '</section>' +
      (matched.length ? '' : '<div class="empty-state"><h3>No matching records</h3><p>Try a different search.</p></div>') +
      (q ? '' : '<section class="featured-section"><div class="section-bar"><h2>Favorite Presets</h2>' +
          '<button type="button" class="btn ghost sm" data-go="favorites">See all</button></div>' +
          (favs.length ? '<div class="featured-row">' + favs.map(featuredCard).join('') + '</div>' :
            '<div class="section-note">Tap a star on a style prompt to save it here.</div>') +
          '</section>') +
      '<p class="footer-note">GREEN BAT MUSIC · PERSONAL RECORD ARCHIVE. Covers and edits remain on this device until exported as a backup.</p>';
  }

  function renderGroup() {
    const g = findGroup(activeGroup);
    if (!g) {page='home';renderHome();return;}
    const q = query.toLowerCase().trim();
    const categories = ['All',...new Set(g.prompts.map(p=>p.category))];
    if(!categories.includes(category)) category='All';
    const matched = g.prompts.filter(p=>(category==='All'||p.category===category)&&matchesPrompt({...p,groupName:g.name},q));
    const tags = [...new Set(g.prompts.map(p=>p.category))].slice(0,3);
    main.innerHTML =
      '<div class="group-layout">' +
      '<section class="mockup-crate-shell" style="--accent:' + color(g.color) + '">' +
        '<div class="crate-stage">' +
          '<div class="crate-main-cover">' + groupThumbMarkup(g,true) + '</div>' +
          '<div class="crate-front-wood" aria-hidden="true"></div>' +
        '</div>' +
        '<div class="crate-details">' +
          '<h1>' + escapeHTML(g.name) + '</h1>' +
          '<div class="crate-tags">' + tags.map(t=>'<span class="crate-tag">'+escapeHTML(t)+'</span>').join('') + '</div>' +
          '<p>' + escapeHTML(g.description || g.genre) + '</p>' +
          '<div class="crate-meta-bar"><span>' + escapeHTML(g.description ? g.genre : '') + '</span>' +
            '<button type="button" class="crate-edit-button" data-edit-group="' + escapeHTML(g.id) + '" aria-label="Edit ' + escapeHTML(g.name) + ' artwork and details">Edit sleeve</button></div>' +
        '</div>' +
      '</section>' +
      '<section class="group-soundboard" aria-label="Saved prompts">' +
      '<div class="mockup-prompts-heading">' +
        '<h2>Prompts <span>(' + g.prompts.length + ')</span></h2>' +
        '<button type="button" class="preset-search-toggle" data-action="toggle-group-search" aria-expanded="' + groupSearchOpen + '">⌕ &nbsp;Search / Filters</button>' +
      '</div>' +
      (groupSearchOpen ? '<div class="mockup-search-panel"><div class="toolbar">' + searchMarkup('Search this group...') + '</div>' +
      '<div class="filter-row" aria-label="Prompt category filters">' +
      categories.map(cat=>'<button type="button" class="filter-chip ' + (cat===category?'active':'') +
        '" data-category="' + escapeHTML(cat) + '">' + escapeHTML(cat) + '</button>').join('') + '</div></div>' : '') +
      '<section class="prompt-stack mockup-track-list" aria-label="Style prompt soundboard">' +
        matched.map(p=>promptCard({...p,groupColor:g.color})).join('') +
      '</section>' +
      (matched.length?'':'<div class="empty-state"><h3>No prompts found</h3><p>Change the search or filters.</p></div>') +
      '<button type="button" class="mockup-add-prompt" data-action="add-prompt">＋ &nbsp; Add Prompt</button></section></div>';
  }

function renderFavorites() {
    const q=query.toLowerCase().trim(), favs=allPrompts().filter(p=>p.favorite&&matchesPrompt(p,q));
    main.innerHTML='<section class="hero vault-masthead mockup-masthead">' +
      '<span class="vault-eyebrow">YOUR MOST-PLAYED IDEAS</span>' +
      '<h1 class="vault-title">Favorite<br>Presets</h1>' +
      '<p class="vault-tagline">Your personal crate of go-to sounds.</p>' +
      '<nav class="vault-tabs"><button type="button" class="vault-tab" data-go="home">◉ Music Groups</button>' +
      '<button type="button" class="vault-tab active" data-go="favorites">★ Favorites</button></nav></section>' +
      '<div class="vault-compact-toolbar">'+searchMarkup('Find a favorite preset...')+'</div>' +
      '<div class="section-bar"><h2>Favorite Soundboard</h2><span class="section-note">'+favs.length+' saved</span></div>' +
      '<section class="prompt-stack mockup-track-list">'+favs.map(p=>promptCard(p,true)).join('')+'</section>' +
      (favs.length?'':'<div class="empty-state"><h3>No favorite presets yet</h3><p>Star a prompt to keep it here.</p></div>');
  }

  function setActiveNav() {
    document.querySelectorAll('.bottom-nav button').forEach(btn => btn.classList.remove('active'));
    document.getElementById(page === 'favorites' ? 'nav-favorites' : 'nav-home')?.classList.add('active');
  }

  function render() {
    if (document.body) document.body.dataset.vaultPage = page;
    if (page === 'group') renderGroup();
    else if (page === 'favorites') renderFavorites();
    else renderHome();
    setActiveNav();
  }

  function navigate(to, id = null) {
    page = to;
    groupSearchOpen = false;
    homeSearchOpen = false;
    query = '';
    category = 'All';
    expanded.clear();
    if (to === 'group') activeGroup = id;
    render();
    window.scrollTo({top:0, behavior:'instant'});
    main.focus();
  }

  function toast(message) {
    clearTimeout(toastTimer);
    toastEl.textContent = message;
    toastEl.classList.add('visible');
    toastTimer = setTimeout(() => toastEl.classList.remove('visible'), 1800);
  }

  function modalFrame(title, inner) {
    modalBody.innerHTML = `<div class="modal-head"><h2 id="modalTitle">${escapeHTML(title)}</h2><button class="close-btn" type="button" data-action="close-modal" aria-label="Close">×</button></div>${inner}`;
    modal.hidden = false;
  }
  function closeModal() { modal.hidden = true; modalBody.innerHTML = ''; }

  async function copyPrompt(id) {
    const found = findPrompt(id);
    if (!found) return;
    try {
      await navigator.clipboard.writeText(found.prompt.text);
      toast(`Copied “${found.prompt.title}”`);
    } catch (e) {
      expanded.add(id);
      render();
      toast('Copy blocked here; open the text and select it');
    }
  }

  function toggleFavorite(id) {
    const f = findPrompt(id);
    if (!f) return;
    f.prompt.favorite = !f.prompt.favorite;
    persist();
    render();
    toast(f.prompt.favorite ? 'Added to favorites' : 'Removed from favorites');
  }

  function promptForm(id) {
    const groups = data.groups;
    const found = id ? findPrompt(id) : null;
    const p = found?.prompt;
    const groupId = found?.group.id || activeGroup || groups[0]?.id || '';
    modalFrame(p ? 'Edit style prompt' : 'Add style prompt', `<form id="promptForm"><input type="hidden" name="promptId" value="${escapeHTML(p?.id || '')}"><label class="field"><span>Music group</span><select name="groupId">${groups.map(g => `<option value="${escapeHTML(g.id)}" ${g.id===groupId?'selected':''}>${escapeHTML(g.name)}</option>`).join('')}</select></label><label class="field"><span>Prompt title</span><input name="title" maxlength="80" required placeholder="e.g. Core, Heavy, Slow Burn" value="${escapeHTML(p?.title || '')}"></label><label class="field"><span>Category</span><input name="category" maxlength="30" placeholder="Core" value="${escapeHTML(p?.category || '')}"></label><label class="field"><span>Prompt text</span><textarea name="text" maxlength="1000" required placeholder="Describe the genre, instrumentation, vocals, mood and production...">${escapeHTML(p?.text || '')}</textarea></label><p class="field-note"><span id="editorCount">${p?.text.length || 0}</span>/1000 characters · Saves to this device</p><div class="form-foot">${p ? `<button type="button" class="btn danger" data-delete-prompt="${escapeHTML(p.id)}">Delete</button>` : '<span></span>'}<button type="submit" class="btn primary">Save style prompt</button></div></form>`);
  }

  function groupForm(id) {
    const g = id ? findGroup(id) : null;
    modalFrame(g ? 'Edit music group' : 'Add music group', `<form id="groupForm"><input type="hidden" name="groupId" value="${escapeHTML(g?.id || '')}"><label class="field"><span>Group name</span><input name="name" maxlength="60" required placeholder="Band or project name" value="${escapeHTML(g?.name || '')}"></label><label class="field"><span>Genre subtitle</span><input name="genre" maxlength="90" value="${escapeHTML(g?.genre || '')}" placeholder="e.g. Hip-hop · Metal"></label><label class="field"><span>Short description</span><input name="description" maxlength="160" value="${escapeHTML(g?.description || '')}"></label><label class="field"><span>Accent color</span><input name="color" type="color" value="${color(g?.color || '#97e7b6')}"></label><div class="artwork-editor"><div class="artwork-preview" id="artworkPreview">${g?.artwork ? `<img src="${g.artwork}" alt="${escapeHTML(g.name)} artwork">` : '<div class="artwork-placeholder">No artwork thumbnail selected yet</div>'}</div><label class="field"><span>Group artwork thumbnail</span><input name="artwork" type="file" accept="image/*"></label><p class="field-note">Optional. Upload cover art or a visual for this group. It will be used on group cards and the group page, and saved locally on this device.</p>${g?.artwork ? '<label class="checkbox-line"><input type="checkbox" name="removeArtwork"> Remove current artwork</label>' : ''}</div><div class="form-foot">${g ? `<button class="btn danger" type="button" data-delete-group="${escapeHTML(g.id)}">Delete group</button>` : '<span></span>'}<button class="btn primary" type="submit">Save group</button></div></form>`);
  }

  function settings() {
    modalFrame('Library & backups', `<div class="setting-card"><h3>Your data stays on your device</h3><p>Changes are stored in this browser. They do not automatically sync between devices, and clearing browser data can erase them. Export a backup regularly. Group artwork thumbnails are included in that backup.</p><button type="button" class="btn primary" data-action="export">↓ Export JSON backup</button><button type="button" class="btn" data-action="import">↑ Import backup</button></div><div class="setting-card"><h3>Phone, desktop, and Chromebook</h3><p>This layout is designed to work across mobile and larger screens. On Android Chrome, use <strong>Add to Home screen</strong> or <strong>Install app</strong> after hosting.</p><button type="button" class="btn" data-action="install-help">Installation tips</button></div><div class="setting-card"><h3>Starting library</h3><p>Built-in prompts are editable starter presets based on your established group sound directions. They are not guaranteed to reproduce earlier chat prompts word-for-word.</p><button type="button" class="btn danger" data-action="restore-starter">Restore starter library</button></div>`);
  }

  function exportBackup() {
    const payload = {...normalizeLibrary(data), exportedAt:new Date().toISOString(), app:'Green Bat Prompt Vault'};
    const blob = new Blob([JSON.stringify(payload, null, 2)], {type:'application/json'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `green-bat-prompts-${new Date().toISOString().slice(0,10)}.json`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    toast('Backup file saved');
  }

  function validateImport(obj) {
    if (!obj || !Array.isArray(obj.groups) || obj.groups.length > 200) throw Error('Invalid backup format');
    const normalized = normalizeLibrary(obj);
    const ids = new Set();
    for (const g of normalized.groups) {
      if (ids.has(g.id)) throw Error('Duplicate group id detected');
      ids.add(g.id);
      for (const p of g.prompts) if (!p.title || !p.text || p.text.length > 1000) throw Error('Invalid prompt data');
    }
    return normalized;
  }

  function processArtworkFile(file) {
    return new Promise((resolve, reject) => {
      if (!file) return resolve('');
      const reader = new FileReader();
      reader.onerror = () => reject(Error('Could not read the image file'));
      reader.onload = () => {
        const img = new Image();
        img.onerror = () => reject(Error('Could not process the image file'));
        img.onload = () => {
          const maxSide = 900;
          const scale = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
          const canvas = document.createElement('canvas');
          canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
          canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          const dataUrl = canvas.toDataURL('image/jpeg', 0.86);
          resolve(dataUrl);
        };
        img.src = reader.result;
      };
      reader.readAsDataURL(file);
    });
  }

  document.addEventListener('click', e => {
    const t = e.target.closest('[data-action],[data-go],[data-group],[data-copy],[data-favorite],[data-expand],[data-edit-prompt],[data-edit-group],[data-delete-prompt],[data-delete-group],[data-category]');
    if (!t) return;
    if (t.dataset.copy) { copyPrompt(t.dataset.copy); return; }
    if (t.dataset.favorite) { toggleFavorite(t.dataset.favorite); return; }
    if (t.dataset.expand) { const id = t.dataset.expand; expanded.has(id) ? expanded.delete(id) : expanded.add(id); render(); return; }
    if (t.dataset.category) { category = t.dataset.category; render(); return; }
    if (t.dataset.group) { navigate('group', t.dataset.group); return; }
    if (t.dataset.go) { if (!modal.hidden) closeModal(); navigate(t.dataset.go); return; }
    if (t.dataset.editPrompt) { promptForm(t.dataset.editPrompt); return; }
    if (t.dataset.editGroup) { groupForm(t.dataset.editGroup); return; }
    if (t.dataset.deletePrompt) {
      const found = findPrompt(t.dataset.deletePrompt);
      if (found && confirm(`Delete “${found.prompt.title}”?`)) {
        found.group.prompts = found.group.prompts.filter(p => p.id !== found.prompt.id);
        persist(); closeModal(); render(); toast('Prompt deleted');
      }
      return;
    }
    if (t.dataset.deleteGroup) {
      const g = findGroup(t.dataset.deleteGroup);
      if (g && confirm(`Delete “${g.name}” and all ${g.prompts.length} prompts?`)) {
        data.groups = data.groups.filter(x => x.id !== g.id);
        persist(); closeModal(); navigate('home'); toast('Group deleted');
      }
      return;
    }
    switch (t.dataset.action) {
      case 'open-vault-menu':
        modalFrame('Underground Record Vault', '<div class="vault-menu-options"><button type="button" class="btn" data-go="home">⌂ &nbsp; Home / Records</button><button type="button" class="btn" data-action="show-groups">▦ &nbsp; Music Groups</button><button type="button" class="btn" data-go="favorites">☆ &nbsp; Favorites</button><button type="button" class="btn" data-action="add-prompt">＋ &nbsp; Add Prompt</button><button type="button" class="btn" data-action="add-group">▣ &nbsp; Add Music Group</button><button type="button" class="btn" data-action="open-settings">⚙ &nbsp; Library & Backups</button></div>');
        break;
      case 'focus-vault-search':
        if(page==='group'&&!groupSearchOpen){groupSearchOpen=true;render();}
        if(page==='home'&&!homeSearchOpen){homeSearchOpen=true;render();}
        document.getElementById('searchInput')?.focus();
        break;
      case 'show-groups':
        if(!modal.hidden)closeModal();
        if(page!=='home')navigate('home');
        document.getElementById('musicGroupsHeading')?.scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth',block:'start'});
        document.querySelectorAll('.bottom-nav button').forEach(btn=>btn.classList.remove('active'));
        document.getElementById('nav-groups')?.classList.add('active');
        break;
      case 'toggle-group-search':
        groupSearchOpen=!groupSearchOpen;
        render();
        if(groupSearchOpen)document.getElementById('searchInput')?.focus();
        break;
      case 'close-modal': closeModal(); break;
      case 'add-prompt': promptForm(); break;
      case 'add-group': groupForm(); break;
      case 'open-settings': settings(); break;
      case 'export': exportBackup(); break;
      case 'import': importInput.click(); break;
      case 'install-help': toast('Chrome menu · Add to Home screen or Install app'); break;
      case 'restore-starter':
        if (confirm('Replace your current library with starter presets? Export a backup first.')) {
          data = normalizeLibrary(seed); persist(); closeModal(); navigate('home'); toast('Starter library restored');
        }
        break;
    }
  });

  document.addEventListener('input', e => {
    if (e.target.id === 'searchInput') {
      const i = e.target.selectionStart;
      query = e.target.value;
      render();
      const field = document.getElementById('searchInput');
      if (field) { field.focus(); try { field.setSelectionRange(i, i); } catch (err) {} }
    }
    if (e.target.name === 'text' && e.target.closest('#promptForm')) {
      const count = document.getElementById('editorCount');
      if (count) count.textContent = e.target.value.length;
    }
  });

  document.addEventListener('change', async e => {
    if (e.target.name === 'artwork' && e.target.closest('#groupForm')) {
      const file = e.target.files?.[0];
      if (!file) return;
      try {
        const preview = document.getElementById('artworkPreview');
        const src = await processArtworkFile(file);
        if (preview) preview.innerHTML = `<img src="${src}" alt="Artwork preview">`;
      } catch (err) {
        alert(`Could not process artwork: ${err.message}`);
      }
    }
  });

  document.addEventListener('submit', async e => {
    if (e.target.id === 'promptForm') {
      e.preventDefault();
      const f = new FormData(e.target), id = String(f.get('promptId')), target = findGroup(String(f.get('groupId')));
      if (!target) { toast('Select a valid group'); return; }
      const title = String(f.get('title')).trim(), cat = String(f.get('category')).trim(), txt = String(f.get('text')).trim();
      if (!title || !txt || txt.length > 1000) { toast('Enter a title and a prompt under 1,000 characters'); return; }
      if (id) {
        const existing = findPrompt(id); if (!existing) return;
        if (existing.group.id !== target.id) existing.group.prompts = existing.group.prompts.filter(p => p.id !== id);
        Object.assign(existing.prompt, {title, category:cat || 'Core', text:txt, origin:'user'});
        if (existing.group.id !== target.id) target.prompts.push(existing.prompt);
      } else {
        target.prompts.unshift({id:uid(), title, category:cat || 'Core', text:txt, favorite:false, origin:'user'});
      }
      persist(); closeModal();
      if (page !== 'group') navigate('group', target.id);
      else { activeGroup = target.id; category = 'All'; query = ''; render(); }
      toast('Style prompt saved');
      return;
    }

    if (e.target.id === 'groupForm') {
      e.preventDefault();
      const f = new FormData(e.target), id = String(f.get('groupId'));
      const name = String(f.get('name')).trim();
      if (!name) return;
      const existing = id ? findGroup(id) : null;
      let artwork = existing?.artwork || '';
      const removeArtwork = !!e.target.querySelector('input[name="removeArtwork"]')?.checked;
      const artFile = e.target.querySelector('input[name="artwork"]')?.files?.[0];
      if (removeArtwork) artwork = '';
      if (artFile) {
        try { artwork = await processArtworkFile(artFile); }
        catch (err) { alert(`Could not save artwork: ${err.message}`); return; }
      }
      const values = {
        name,
        genre: String(f.get('genre')).trim(),
        description: String(f.get('description')).trim(),
        color: color(String(f.get('color'))),
        artwork,
        monogram: String((existing?.monogram || name[0] || 'G')).slice(0,2).toUpperCase()
      };
      if (existing) Object.assign(existing, values);
      else data.groups.push({id:uid(), ...values, prompts:[]});
      persist(); closeModal(); render(); toast('Music group saved');
    }
  });

  importInput.addEventListener('change', async e => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const obj = validateImport(JSON.parse(await file.text()));
      if (!confirm('Import will replace the current library. Continue?')) return;
      data = obj; persist(); closeModal(); navigate('home'); toast('Library imported');
    } catch (err) {
      alert(`Could not import backup: ${err.message}`);
    } finally {
      e.target.value = '';
    }
  });

  modal.addEventListener('click', e => { if (e.target === modal) closeModal(); });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && !modal.hidden) closeModal();
    if ((e.key === 'Enter' || e.key === ' ') && e.target.matches('.brand')) { e.preventDefault(); navigate('home'); }
  });
  window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); deferredInstall = e; document.getElementById('installButton').hidden = false; });
  document.getElementById('installButton').addEventListener('click', async () => { if (!deferredInstall) return; deferredInstall.prompt(); await deferredInstall.userChoice; deferredInstall = undefined; document.getElementById('installButton').hidden = true; });
  window.addEventListener('appinstalled', () => { toast('Prompt Vault installed'); document.getElementById('installButton').hidden = true; });
  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) window.addEventListener('load', () => navigator.serviceWorker.register('./service-worker.js').catch(() => {}));

  render();
})();
