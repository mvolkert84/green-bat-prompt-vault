(() => {
  'use strict';
  const STORE = 'greenbat-prompt-vault-v1';
  const seed = window.GREEN_BAT_STARTER;
  const clone = obj => JSON.parse(JSON.stringify(obj));
  const escapeHTML = value => String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  const color = c => /^#[0-9a-fA-F]{6}$/.test(c || '') ? c : '#97e7b6';
  const uid = () => (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const main = document.getElementById('mainContent');
  const modal = document.getElementById('modalScrim');
  const modalBody = document.getElementById('modalBody');
  const toastEl = document.getElementById('toast');
  let toastTimer;
  let deferredInstall;
  let data = getSaved();
  let page = 'home';
  let activeGroup = null;
  let query = '';
  let category = 'All';
  const expanded = new Set();

  function getSaved() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORE));
      if (saved && Array.isArray(saved.groups)) return saved;
    } catch (e) { /* Storage can be disabled */ }
    return clone(seed);
  }
  function persist() {
    try { localStorage.setItem(STORE, JSON.stringify(data)); }
    catch (e) { toast('Storage is full or unavailable — export a backup'); }
  }
  function allPrompts() { return data.groups.flatMap(g => g.prompts.map(p => ({...p, groupId: g.id, groupName: g.name, groupColor: g.color}))); }
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
    return `<div class="statline"><span class="stat"><strong>${data.groups.length}</strong> music groups</span><span class="stat"><strong>${count}</strong> style prompts</span><span class="stat">Offline ready · Local edits</span></div>`;
  }
  function searchMarkup(placeholder) {
    return `<label class="search-box"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="10.8" cy="10.8" r="7"/><path d="m16 16 5 5"/></svg><span class="sr-only">Search</span><input id="searchInput" type="search" value="${escapeHTML(query)}" placeholder="${escapeHTML(placeholder)}" autocomplete="off" aria-label="Search groups and prompts"></label>`;
  }
  function groupCard(g) {
    return `<button class="group-card" style="--accent:${color(g.color)}" data-group="${escapeHTML(g.id)}"><span class="monogram" aria-hidden="true">${escapeHTML(g.monogram || g.name.slice(0,1))}</span><span class="group-icon" aria-hidden="true">${escapeHTML(g.monogram || g.name.slice(0,1))}</span><h3>${escapeHTML(g.name)}</h3><p>${escapeHTML(g.genre)}</p><span class="smallcount">${g.prompts.length} prompts ↗</span></button>`;
  }
  function featuredCard(p) {
    return `<div class="featured-card"><span class="mini">${escapeHTML(p.groupName)}</span><h3>${escapeHTML(p.title)}</h3><div class="minor">${escapeHTML(p.category)} · ${p.text.length} characters</div><button class="btn primary sm" type="button" data-copy="${escapeHTML(p.id)}">Copy prompt</button></div>`;
  }
  function promptCard(p, showGroup = false) {
    const isOpen = expanded.has(p.id);
    return `<article class="prompt-card"><div class="prompt-main"><div class="prompt-top"><div class="prompt-heading"><span class="micro">${showGroup ? escapeHTML(p.groupName)+' · ' : ''}${escapeHTML(p.category || 'Style')}</span><h3>${escapeHTML(p.title)}</h3></div><div class="prompt-tools"><button class="star ${p.favorite ? 'selected' : ''}" aria-label="${p.favorite ? 'Remove from' : 'Add to'} favorites" title="Favorite" type="button" data-favorite="${escapeHTML(p.id)}">${p.favorite ? '★' : '☆'}</button></div></div><div class="excerpt">${escapeHTML(p.text)}</div><div class="prompt-actions"><button type="button" class="btn primary sm" data-copy="${escapeHTML(p.id)}">⧉ &nbsp; Copy</button><button type="button" class="btn sm" data-expand="${escapeHTML(p.id)}">${isOpen ? 'Hide text' : 'View text'}</button><button type="button" class="btn ghost sm" data-edit-prompt="${escapeHTML(p.id)}">Edit</button><span class="char-count">${p.text.length}/1000</span></div>${p.origin === 'reconstructed' ? '<div class="origin-note">Starter preset · editable</div>' : ''}</div>${isOpen ? `<div class="expanded-text">${escapeHTML(p.text)}</div>` : ''}</article>`;
  }
  function matches(p, q) { return [p.title,p.category,p.text,p.groupName].join(' ').toLowerCase().includes(q); }
  function renderHome() {
    const q = query.toLowerCase().trim();
    const matched = data.groups.filter(g => [g.name,g.genre,g.description,...g.prompts.map(p=>p.title+' '+p.text)].join(' ').toLowerCase().includes(q));
    const favs = allPrompts().filter(p=>p.favorite).slice(0,6);
    main.innerHTML = `<section class="hero"><span class="kicker">Your Sound · One Tap Away</span><h1>Every sound. One vault.</h1><p>Keep your Green Bat projects organized. Choose a group, find a Suno style, and copy it instantly.</p>${statText()}</section><div class="toolbar">${searchMarkup('Search music groups or styles...')}<button class="btn" data-action="add-group">+ New Group</button></div><div class="section-bar"><h2>Music groups</h2><span class="section-note">${matched.length} groups</span></div><section class="group-grid">${matched.map(groupCard).join('')}</section>${matched.length ? '' : '<div class="empty-state"><h3>No matching groups</h3><p>Try a different search.</p></div>'}${q ? '' : `<section class="featured-section"><div class="section-bar"><h2>Favorites · Quick Copy</h2><button class="btn ghost sm" data-go="favorites">See all</button></div>${favs.length ? `<div class="featured-row">${favs.map(featuredCard).join('')}</div>` : '<div class="section-note">Tap a star on any prompt to add it here.</div>'}</section><div class="info-strip"><strong>Made for Suno:</strong> Each prompt is kept under 1,000 characters. Your edits and new prompts are saved on this device. Use Library &amp; Backups to move them to another phone.</div>`}<p class="footer-note">GREEN BAT MUSIC / PROMPT VAULT · Local-first tool. Not affiliated with Suno.</p>`;
  }
  function renderGroup() {
    const g = findGroup(activeGroup);
    if (!g) { page='home';renderHome();return; }
    const q = query.toLowerCase().trim();
    const categories = ['All', ...new Set(g.prompts.map(p=>p.category))];
    if (!categories.includes(category)) category = 'All';
    const matched = g.prompts.filter(p=>(category==='All' || p.category===category) && matches({...p,groupName:g.name},q));
    main.innerHTML = `<button type="button" class="back" data-go="home">← All music groups</button><section class="group-banner" style="--accent:${color(g.color)}"><div class="large-mark">${escapeHTML(g.monogram || g.name.slice(0,1))}</div><div><div class="genre">${escapeHTML(g.genre)}</div><h1>${escapeHTML(g.name)}</h1><p>${escapeHTML(g.description)}</p><p style="margin-top:7px">${g.prompts.length} saved styles</p></div></section><div class="toolbar">${searchMarkup('Find a style or sound...')}<button class="btn primary" data-action="add-prompt">+ New</button></div><div class="filter-row" aria-label="Style category filters">${categories.map(cat => `<button type="button" data-category="${escapeHTML(cat)}" class="filter-chip ${cat===category?'active':''}">${escapeHTML(cat)}</button>`).join('')}</div><div class="section-bar"><h2>Style prompts</h2><span class="section-note">${matched.length} results</span></div><section class="prompt-stack">${matched.map(p=>promptCard(p)).join('')}</section>${matched.length?'':'<div class="empty-state"><h3>No styles found</h3><p>Change the search or add a new style prompt.</p></div>'}<div class="footer-note"><button class="btn ghost sm" data-edit-group="${escapeHTML(g.id)}">Edit group details</button></div>`;
  }
  function renderFavorites() {
    const q=query.toLowerCase().trim();const favs=allPrompts().filter(p=>p.favorite && matches(p,q));
    main.innerHTML=`<section class="hero"><span class="kicker">Instant Access</span><h1>Your favorites.</h1><p>Your most-used Suno styles, ready to copy without searching through a group.</p></section><div class="toolbar">${searchMarkup('Search favorite prompts...')}</div><div class="section-bar"><h2>Starred prompts</h2><span class="section-note">${favs.length} favorites</span></div><section class="prompt-stack">${favs.map(p=>promptCard(p,true)).join('')}</section>${favs.length?'':'<div class="empty-state"><h3>No favorites found</h3><p>Star a style prompt to keep it one tap away.</p></div>'}`;
  }
  function render() {
    document.getElementById('nav-home').classList.toggle('active',page==='home'||page==='group');
    document.getElementById('nav-favorites').classList.toggle('active',page==='favorites');
    if (page==='group') renderGroup();else if(page==='favorites')renderFavorites();else renderHome();
  }
  function navigate(to,group) {
    if (to==='group') activeGroup=group;
    page=to;query='';category='All';expanded.clear();render();window.scrollTo({top:0,behavior:'instant'});
  }
  function toast(message) {
    toastEl.textContent=message;toastEl.classList.add('visible');
    clearTimeout(toastTimer);toastTimer=setTimeout(()=>toastEl.classList.remove('visible'),2300);
  }
  async function copyPrompt(id) {
    const found=findPrompt(id);if(!found)return;
    const text=found.prompt.text;let worked=false;
    try { if(navigator.clipboard && window.isSecureContext){await navigator.clipboard.writeText(text);worked=true;} }catch(e){}
    if(!worked){const box=document.createElement('textarea');box.value=text;box.style.position='fixed';box.style.opacity='0';document.body.appendChild(box);box.focus();box.select();try{worked=document.execCommand('copy');}catch(e){}box.remove();}
    if(worked)toast('Copied — paste into Suno');
    else { expanded.add(id);render();toast('Copy blocked here; open the text and select it'); }
  }
  function toggleFavorite(id) {const f=findPrompt(id);if(!f)return;f.prompt.favorite=!f.prompt.favorite;persist();render();toast(f.prompt.favorite?'Added to favorites':'Removed from favorites');}
  function modalFrame(title,body) {
    modalBody.innerHTML=`<div class="modal-head"><h2 id="modalTitle">${escapeHTML(title)}</h2><button class="close-btn" aria-label="Close" data-action="close-modal" type="button">×</button></div>${body}`;
    modal.hidden=false;document.body.style.overflow='hidden';
    const focus=modalBody.querySelector('input:not([type=hidden]),textarea,button');if(focus)focus.focus();
  }
  function closeModal(){modal.hidden=true;modalBody.innerHTML='';document.body.style.overflow='';}
  function promptForm(id) {
    const existing=id?findPrompt(id):null;
    const groupId=existing?.group.id || activeGroup || data.groups[0]?.id;
    if(!data.groups.length){toast('Create a group first');return groupForm();}
    const p=existing?.prompt;
    modalFrame(p?'Edit Suno prompt':'Add Suno style',`<form id="promptForm"><input type="hidden" name="promptId" value="${escapeHTML(p?.id || '')}"><label class="field"><span>Music group</span><select name="groupId" required>${data.groups.map(g=>`<option value="${escapeHTML(g.id)}" ${groupId===g.id?'selected':''}>${escapeHTML(g.name)}</option>`).join('')}</select></label><label class="field"><span>Style name</span><input name="title" maxlength="80" required placeholder="e.g. Heavy nu-metal" value="${escapeHTML(p?.title || '')}"></label><label class="field"><span>Category</span><input name="category" maxlength="30" value="${escapeHTML(p?.category || 'Core')}" required placeholder="Core / Heavy / Slow Burn / EDM"></label><label class="field"><span>Suno style prompt</span><textarea name="text" maxlength="1000" required placeholder="Describe the genre, instrumentation, vocals, mood and production...">${escapeHTML(p?.text || '')}</textarea></label><p class="field-note"><span id="editorCount">${p?.text.length || 0}</span>/1000 characters · Saves to this device</p><div class="form-foot">${p?`<button type="button" class="btn danger" data-delete-prompt="${escapeHTML(p.id)}">Delete</button>`:'<span></span>'}<button type="submit" class="btn primary">Save style prompt</button></div></form>`);
  }
  function groupForm(id) {
    const g=id?findGroup(id):null;
    modalFrame(g?'Edit music group':'Add music group',`<form id="groupForm"><input type="hidden" name="groupId" value="${escapeHTML(g?.id || '')}"><label class="field"><span>Group name</span><input name="name" maxlength="60" required placeholder="Band or project name" value="${escapeHTML(g?.name || '')}"></label><label class="field"><span>Genre subtitle</span><input name="genre" maxlength="90" value="${escapeHTML(g?.genre || '')}" placeholder="e.g. Hip-hop · Metal"></label><label class="field"><span>Short description</span><input name="description" maxlength="160" value="${escapeHTML(g?.description || '')}"></label><label class="field"><span>Accent color</span><input name="color" type="color" value="${color(g?.color || '#97e7b6')}"></label><div class="form-foot">${g?`<button class="btn danger" type="button" data-delete-group="${escapeHTML(g.id)}">Delete group</button>`:'<span></span>'}<button class="btn primary" type="submit">Save group</button></div></form>`);
  }
  function settings() {
    modalFrame('Library & backups',`<div class="setting-card"><h3>Your data stays on your phone</h3><p>Changes are stored in this browser. They do not automatically sync between devices, and clearing browser data can erase them. Export a backup regularly.</p><button type="button" class="btn primary" data-action="export">↓ Export JSON backup</button><button type="button" class="btn" data-action="import">↑ Import backup</button></div><div class="setting-card"><h3>Install Green Bat Prompt Vault</h3><p>Once hosted on an HTTPS website, open it in Chrome on Android and choose <strong>Add to Home screen</strong> or <strong>Install app</strong> from the browser menu. It can then open offline like a regular app.</p><button type="button" class="btn" data-action="install-help">Installation tips</button></div><div class="setting-card"><h3>Starting library</h3><p>Built-in prompts are editable starter presets based on your established group sound directions. They are not guaranteed to reproduce earlier chat prompts word-for-word.</p><button type="button" class="btn danger" data-action="restore-starter">Restore starter library</button></div>`);
  }
  function exportBackup() {
    const payload={...data,exportedAt:new Date().toISOString(),app:'Green Bat Prompt Vault'};
    const blob=new Blob([JSON.stringify(payload,null,2)],{type:'application/json'});
    const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=`green-bat-prompts-${new Date().toISOString().slice(0,10)}.json`;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),2000);toast('Backup file saved');
  }
  function validateImport(obj) {
    if(!obj || !Array.isArray(obj.groups) || obj.groups.length>200)throw Error('Invalid backup format');
    const ids=new Set();
    for(const g of obj.groups){
      if(!g||typeof g.name!=='string'||g.name.length>60||!Array.isArray(g.prompts)||g.prompts.length>300||typeof g.id!=='string'||ids.has(g.id))throw Error('Invalid group data');
      ids.add(g.id);
      for(const p of g.prompts)if(!p || typeof p.id!=='string'||typeof p.title!=='string'||typeof p.text!=='string'||p.text.length>1000)throw Error('Invalid prompt data');
    }
    return {version:1,groups:obj.groups.map(g=>({id:g.id.slice(0,100),name:g.name.slice(0,60),genre:String(g.genre||'').slice(0,90),description:String(g.description||'').slice(0,160),monogram:String(g.monogram||g.name[0]||'G').slice(0,2),color:color(g.color),prompts:g.prompts.map(p=>({id:p.id.slice(0,100),title:p.title.slice(0,80),category:String(p.category||'Core').slice(0,30),text:p.text,favorite:!!p.favorite,origin:p.origin==='reconstructed'?'reconstructed':'user'}))}))};
  }
  document.addEventListener('click',e=>{
    const t=e.target.closest('[data-action],[data-go],[data-group],[data-copy],[data-favorite],[data-expand],[data-edit-prompt],[data-edit-group],[data-delete-prompt],[data-delete-group],[data-category]');if(!t)return;
    if(t.dataset.copy){copyPrompt(t.dataset.copy);return;}
    if(t.dataset.favorite){toggleFavorite(t.dataset.favorite);return;}
    if(t.dataset.expand){const id=t.dataset.expand;expanded.has(id)?expanded.delete(id):expanded.add(id);render();return;}
    if(t.dataset.category){category=t.dataset.category;render();return;}
    if(t.dataset.group){navigate('group',t.dataset.group);return;}
    if(t.dataset.go){navigate(t.dataset.go);return;}
    if(t.dataset.editPrompt){promptForm(t.dataset.editPrompt);return;}
    if(t.dataset.editGroup){groupForm(t.dataset.editGroup);return;}
    if(t.dataset.deletePrompt){const found=findPrompt(t.dataset.deletePrompt);if(found&&confirm(`Delete “${found.prompt.title}”?`)){found.group.prompts=found.group.prompts.filter(p=>p.id!==found.prompt.id);persist();closeModal();render();toast('Prompt deleted');}return;}
    if(t.dataset.deleteGroup){const g=findGroup(t.dataset.deleteGroup);if(g&&confirm(`Delete “${g.name}” and all ${g.prompts.length} prompts?`)){data.groups=data.groups.filter(x=>x.id!==g.id);persist();closeModal();navigate('home');toast('Group deleted');}return;}
    switch(t.dataset.action){
      case 'close-modal':closeModal();break;
      case 'add-prompt':promptForm();break;
      case 'add-group':groupForm();break;
      case 'open-settings':settings();break;
      case 'export':exportBackup();break;
      case 'import':document.getElementById('importFile').click();break;
      case 'install-help':toast('Chrome menu · Add to Home screen (after hosting)');break;
      case 'restore-starter':if(confirm('Replace your current library with starter presets? Export a backup first.')){data=clone(seed);persist();closeModal();navigate('home');toast('Starter library restored');}break;
    }
  });
  document.addEventListener('input',e=>{
    if(e.target.id==='searchInput'){
      const i=e.target.selectionStart;query=e.target.value;
      // Preserve the focused search field and cursor when re-rendering.
      render();const field=document.getElementById('searchInput');if(field){field.focus();try{field.setSelectionRange(i,i);}catch(err){}}
    }
    if(e.target.name==='text' && e.target.closest('#promptForm')){
      const count=document.getElementById('editorCount');if(count)count.textContent=e.target.value.length;
    }
  });
  document.addEventListener('submit',e=>{
    if(e.target.id==='promptForm'){
      e.preventDefault();const f=new FormData(e.target),id=String(f.get('promptId')),target=findGroup(String(f.get('groupId')));
      if(!target){toast('Select a valid group');return;}
      const title=String(f.get('title')).trim(),cat=String(f.get('category')).trim(),txt=String(f.get('text')).trim();
      if(!title||!txt||txt.length>1000){toast('Enter a title and a prompt under 1,000 characters');return;}
      if(id){const existing=findPrompt(id);if(!existing)return;if(existing.group.id!==target.id)existing.group.prompts=existing.group.prompts.filter(p=>p.id!==id);Object.assign(existing.prompt,{title,category:cat||'Core',text:txt,origin:'user'});if(existing.group.id!==target.id)target.prompts.push(existing.prompt);} 
      else target.prompts.unshift({id:uid(),title,category:cat||'Core',text:txt,favorite:false,origin:'user'});
      persist();closeModal();if(page!=='group')navigate('group',target.id);else{activeGroup=target.id;category='All';query='';render();}toast('Style prompt saved');
    }
    if(e.target.id==='groupForm'){
      e.preventDefault();const f=new FormData(e.target),id=String(f.get('groupId'));
      const name=String(f.get('name')).trim();if(!name)return;
      const values={name,genre:String(f.get('genre')).trim(),description:String(f.get('description')).trim(),color:color(String(f.get('color')))};
      if(id){const g=findGroup(id);if(!g)return;Object.assign(g,values);}
      else {const g={id:uid(),...values,monogram:name[0].toUpperCase(),prompts:[]};data.groups.push(g);}
      persist();closeModal();render();toast('Music group saved');
    }
  });
  document.getElementById('importFile').addEventListener('change',async e=>{
    const file=e.target.files[0];if(!file)return;
    try{const obj=validateImport(JSON.parse(await file.text()));if(!confirm('Import will replace the current library. Continue?'))return;data=obj;persist();closeModal();navigate('home');toast('Library imported');}
    catch(err){alert(`Could not import backup: ${err.message}`);}finally{e.target.value='';}
  });
  modal.addEventListener('click',e=>{if(e.target===modal)closeModal();});
  document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!modal.hidden)closeModal();if((e.key==='Enter'||e.key===' ')&&e.target.matches('.brand')){e.preventDefault();navigate('home');}});
  window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();deferredInstall=e;document.getElementById('installButton').hidden=false;});
  document.getElementById('installButton').addEventListener('click',async()=>{if(!deferredInstall)return;deferredInstall.prompt();await deferredInstall.userChoice;deferredInstall=undefined;document.getElementById('installButton').hidden=true;});
  window.addEventListener('appinstalled',()=>{toast('Prompt Vault installed');document.getElementById('installButton').hidden=true;});
  if('serviceWorker' in navigator && location.protocol.startsWith('http'))window.addEventListener('load',()=>navigator.serviceWorker.register('./service-worker.js').catch(()=>{}));
  render();
})();
