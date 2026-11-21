(() => {
  'use strict';
  const icons = {
    play: '<path d="m9 5 11 7-11 7z" fill="currentColor" stroke="none"/>',
    pause: '<path d="M9 5v14m6-14v14" stroke-width="3"/>',
    prev: '<path d="M6 5v14m13-14L8 12l11 7z"/>',
    next: '<path d="M18 5v14M5 5l11 7-11 7z"/>',
    disc: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="2.5"/><path d="M6 12a6 6 0 0 1 6-6m6 6a6 6 0 0 1-6 6"/>',
    close: '<path d="m6 6 12 12M18 6 6 18"/>',
    more: '<circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>'
  };
  const icon = name => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name]}</svg>`;
  const button = (action, name, graphic, extra = '') =>
    `<button type="button" class="deck-button" data-music="${action}" aria-label="${name}" title="${name}" ${extra}>${icon(graphic)}</button>`;
  const time = seconds => Number.isFinite(seconds) ?
    `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}` : '0:00';
  const nameFromFile = file => file.name.replace(/\.[^.]+$/, '');
  const metadataNumber = value => Number.parseInt(value, 10) > 0 ? Number.parseInt(value, 10) : 0;
  const fileTypes = 'audio/*,.mp3,.wav,.flac,.m4a,.mp4,.aac,.ogg,.oga,.opus,.webm,.aif,.aiff';
  let opening;

  function database() {
    if (opening) return opening;
    opening = new Promise((resolve, reject) => {
      const request = indexedDB.open('greenbat-music-library', 1);
      request.onupgradeneeded = () => {
        const db = request.result;
        db.createObjectStore('tracks', {keyPath:'id'}).createIndex('group', 'groupId');
        db.createObjectStore('albums', {keyPath:'id'}).createIndex('group', 'groupId');
        db.createObjectStore('audio');
      };
      request.onsuccess = () => {
        const db = request.result;
        db.onversionchange = () => { db.close(); opening = undefined; };
        resolve(db);
      };
      request.onerror = () => reject(request.error);
    }).catch(error => { opening = undefined; throw error; });
    return opening;
  }

  async function transaction(stores, mode, work) {
    const db = await database();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(stores, mode);
      tx.oncomplete = () => resolve();
      tx.onabort = () => reject(tx.error || new Error('Storage transaction interrupted'));
      try { work(tx); } catch (error) { tx.abort(); reject(error); }
    });
  }

  async function read(stores, queries) {
    let requests;
    await transaction(stores, 'readonly', tx => { requests = queries(tx); });
    return requests.map(request => request.result);
  }

  function getGroupMusic(groupId) {
    return read(['tracks', 'albums'], tx => ['tracks', 'albums'].map(store =>
      tx.objectStore(store).index('group').getAll(groupId)));
  }

  function probe(file) {
    return new Promise((resolve, reject) => {
      const audio = new Audio();
      const url = URL.createObjectURL(file);
      const timeout = setTimeout(() => end(new Error('The file could not be read')), 12000);
      function end(error) {
        clearTimeout(timeout);
        const duration = audio.duration;
        audio.onloadedmetadata = audio.onerror = null;
        audio.removeAttribute('src');
        audio.load();
        URL.revokeObjectURL(url);
        if (error) reject(error);
        else resolve(duration);
      }
      audio.preload = 'metadata';
      audio.onloadedmetadata = () => end(Number.isFinite(audio.duration) && audio.duration > 0 ?
        null : new Error('The track has no playable duration'));
      audio.onerror = () => end(new Error('This browser cannot play the file'));
      audio.src = url;
    });
  }

  function attach({esc, uid, getGroup, cover, showModal, closeModal, toast, processArtwork}) {
    const dock = document.getElementById('musicDock');
    const deck = document.getElementById('musicDeck');
    const audio = new Audio();
    audio.preload = 'metadata';
    const cloud = window.GreenBatCloudClient?.create();
    const isCloud = () => Boolean(cloud?.enabled);
    const canEdit = () => !isCloud() || cloud.admin;
    let current = null;
    let currentAlbum = null;
    let currentGroup = null;
    let queue = [];
    let source = '';
    let playRequest = 0;
    let albumFilter = '';
    let musicGroup = '';
    let tracks = [];
    let albums = [];
    let uploadingGroup = '';
    let viewRequest = 0;
    let modalReturn = null;

    function libraryTools() {
      if (!isCloud()) return '<button type="button" class="btn primary" data-music="upload">Upload songs</button>' +
        '<button type="button" class="btn ghost" data-music="new-album">New album</button>';
      if (!cloud.admin) return '<button type="button" class="btn ghost sm" data-music="cloud-login">Admin sign-in</button>';
      return '<button type="button" class="btn primary" data-music="upload">Upload songs</button>' +
        '<button type="button" class="btn ghost" data-music="new-album">New album</button>' +
        '<button type="button" class="btn ghost sm" data-music="cloud-signout">Sign out</button>';
    }
    function cloudStatus() {
      if (!isCloud()) return '';
      const message = cloud.error ? 'Cloud unavailable · ' + cloud.error :
        cloud.ready ? 'Streaming library · automatically synced' : 'Connecting to cloud library…';
      return '<p class="music-cloud-status" role="status">' + esc(message) + '</p>';
    }
    function adminDialog(trigger) {
      showEditor('Cloud library administrator', '<form id="musicCloudLoginForm">' +
        '<label class="field"><span>Administrator key</span><input name="token" type="password" autocomplete="off" required></label>' +
        '<p class="music-form-note">Listeners do not need this key. It is never included in the APK.</p>' +
        '<p class="music-form-status" role="status"></p>' +
        '<button class="btn primary" type="submit">Sign in</button></form>', trigger);
    }
    async function login(form) {
      const button = form.querySelector('button[type="submit"]');
      const status = form.querySelector('[role="status"]');
      button.disabled = true;
      try {
        await cloud.signIn(form.elements.token.value);
        form.elements.token.value = '';
        finishEditor(form);
        refresh(musicGroup);
        toast('Administrator access enabled');
      } catch (error) { status.textContent = error.message; }
      finally { button.disabled = false; }
    }

    function report(error) {
      toast(error?.name === 'QuotaExceededError' ?
        'Device storage is full. Remove a track or free some space and try again.' :
        'The music library could not be updated. Try again.');
    }

    function sorted(items) {
      return [...items].sort((a, b) =>
        (a.number || Infinity) - (b.number || Infinity) || a.added - b.added || a.title.localeCompare(b.title));
    }

    function playlist() {
      if (albumFilter) return sorted(tracks.filter(track => track.albumId === albumFilter));
      return [...tracks].sort((a, b) => a.added - b.added || a.title.localeCompare(b.title));
    }

    function trackRow(track, index) {
      const album = albums.find(item => item.id === track.albumId);
      const subtitle = [track.artist, albumFilter ? '' : album?.title].filter(Boolean).join(' · ');
      return `<li class="music-track" data-track-row="${esc(track.id)}">
        <button type="button" class="music-track-play" data-music="track" data-id="${esc(track.id)}" aria-label="Play ${esc(track.title)}">
          <span class="music-track-number">${String(index + 1).padStart(2, '0')}</span>
          <span class="music-track-copy"><strong>${esc(track.title)}</strong>${subtitle ? `<small>${esc(subtitle)}</small>` : ''}</span>
          <span class="music-track-time">${time(track.duration)}</span>
        </button>
        ${canEdit() ? button('edit-track', 'Edit ' + esc(track.title), 'more', `data-id="${esc(track.id)}"`) : ''}
      </li>`;
    }

    function draw(panel, group) {
      const active = albums.find(album => album.id === albumFilter);
      const visible = playlist();
      panel.setAttribute('aria-busy', 'false');
      panel.innerHTML = `<div class="record-library-tools">${libraryTools()}</div>${cloudStatus()}
        ${albums.length ? `<div class="record-albums" aria-label="Albums">
          <button type="button" class="record-album-card all-tracks" data-music="album" data-id="" aria-pressed="${!active}">
            <span class="record-album-thumb">${icon('disc')}</span><span><strong>All tracks</strong><small>${tracks.length} songs</small></span>
          </button>
          ${albums.map(album => `<button type="button" class="record-album-card" data-music="album" data-id="${esc(album.id)}" aria-pressed="${album === active}">
            <span class="record-album-thumb"><img src="${esc(album.artwork || cover(group))}" alt=""></span>
            <span><strong>${esc(album.title)}</strong><small>${tracks.filter(track => track.albumId === album.id).length} songs</small></span>
          </button>`).join('')}
        </div>` : ''}
        <div class="record-playlist-head">
          <h2>${esc(active?.title || 'Playlist')} <small>${visible.length}</small></h2>
          <div>${active && canEdit() ? `<button type="button" class="btn ghost sm" data-music="edit-album" data-id="${esc(active.id)}">Edit album</button>` : ''}
          ${visible.length ? '<button type="button" class="btn sm" data-music="play-list">Play all</button>' : ''}</div>
        </div>
        ${visible.length ? `<ol class="record-playlist">${visible.map(trackRow).join('')}</ol>` :
          `<p class="record-empty">${active ? 'Upload songs to this album or move tracks here from their edit menu.' : 'Upload songs to start this group’s playlist.'}</p>`}`;
      markTrack();
    }

    async function render(panel, group) {
      if (musicGroup !== group.id) {
        musicGroup = group.id;
        albumFilter = '';
      }
      const request = ++viewRequest;
      panel.setAttribute('aria-busy', 'true');
      try {
        const [localTracks, localAlbums] = await getGroupMusic(group.id);
        const nextTracks = [...localTracks, ...(cloud?.library.tracks || []).filter(track => track.groupId === group.id)];
        const nextAlbums = [...localAlbums, ...(cloud?.library.albums || []).filter(album => album.groupId === group.id)];
        if (request !== viewRequest || !panel.isConnected) return;
        tracks = nextTracks;
        albums = nextAlbums.sort((a, b) => a.added - b.added);
        if (!albums.some(album => album.id === albumFilter)) albumFilter = '';
        draw(panel, group);
      } catch (error) {
        if (request !== viewRequest || !panel.isConnected) return;
        panel.setAttribute('aria-busy', 'false');
        panel.innerHTML = '<p class="record-empty">The browser could not open local music storage.</p>';
      }
    }

    function refresh(groupId) {
      const panel = document.getElementById('musicLibrary');
      const group = getGroup(groupId);
      if (group && panel && groupId === musicGroup) render(panel, group);
    }

    function albumOptions(selected, remote = isCloud()) {
      const matching = albums.filter(album => !isCloud() || Boolean(album.remote) === remote);
      return '<option value="">No album</option>' + matching.map(album =>
        `<option value="${esc(album.id)}" ${album.id === selected ? 'selected' : ''}>${esc(album.title)}</option>`).join('');
    }

    function showEditor(title, html, trigger) {
      modalReturn = trigger;
      showModal(title, html);
      document.querySelector('#modalBody form :is(input,select)')?.focus();
    }

    function uploadDialog(trigger) {
      if (!canEdit()) { toast('Administrator access required to upload music'); return; }
      if (uploadingGroup) { toast('A song upload is already in progress.'); return; }
      showEditor('Upload songs', `<form id="musicUploadForm">
        <label class="field"><span>Audio files</span><input type="file" name="files" accept="${fileTypes}" multiple required></label>
        <label class="field"><span>Album</span><select name="album">${albumOptions(albumFilter)}</select></label>
        <p class="music-form-note">${isCloud() ? 'Music will stream to everyone with the player. MP3 or M4A recommended; 50 MB maximum per song.' : 'Songs are saved on this device only until cloud storage is connected.'}</p>
        <p class="music-form-status" role="status"></p>
        <button class="btn primary" type="submit">Add to library</button>
      </form>`, trigger);
    }

    function albumDialog(album, trigger) {
      showEditor(album ? 'Edit album' : 'New album', `<form id="musicAlbumForm" data-id="${esc(album?.id || '')}">
        <label class="field"><span>Album name</span><input name="title" required maxlength="100" value="${esc(album?.title || '')}" placeholder="Live set, holiday special…"></label>
        <label class="field"><span>Cover image (optional)</span><input type="file" name="artwork" accept="image/*"></label>
        ${album?.artwork ? '<label class="music-check"><input type="checkbox" name="removeArtwork"> Use group sleeve</label>' : ''}
        <div class="music-form-actions"><button class="btn primary" type="submit">${album ? 'Save album' : 'Create album'}</button>
        ${album ? `<button class="btn danger" type="button" data-music="delete-album" data-id="${esc(album.id)}">Delete album</button>` : ''}</div>
      </form>`, trigger);
    }

    function trackDialog(track, trigger) {
      if (!track) return;
      showEditor('Edit track', `<form id="musicTrackForm" data-id="${esc(track.id)}">
        <label class="field"><span>Title</span><input name="title" required maxlength="180" value="${esc(track.title)}"></label>
        <label class="field"><span>Artist</span><input name="artist" maxlength="180" value="${esc(track.artist)}"></label>
        <label class="field"><span>Album</span><select name="album">${albumOptions(track.albumId, Boolean(track.remote))}</select></label>
        <label class="field"><span>Track number</span><input type="number" name="number" min="1" max="9999" value="${track.number || ''}"></label>
        <div class="music-form-actions"><button class="btn primary" type="submit">Save track</button>
        <button class="btn danger" type="button" data-music="delete-track" data-id="${esc(track.id)}">Remove song</button></div>
      </form>`, trigger);
    }

    async function saveUploads(form, groupId) {
      if (uploadingGroup) return;
      const files = Array.from(form.elements.files.files);
      if (!files.length) return;
      uploadingGroup = groupId;
      const status = form.querySelector('[role="status"]');
      const submit = form.querySelector('button[type="submit"]');
      submit.disabled = true;
      const selectedAlbum = form.elements.album.value;
      const failed = [];
      const completed = [];
      try {
        for (const [index, file] of files.entries()) {
          status.textContent = `Adding ${index + 1} of ${files.length} · ${file.name}`;
          try {
            const duration = await probe(file);
            const tags = await window.readAudioTags(file).catch(() => ({}));
            const track = {
              id: uid(), groupId, albumId: selectedAlbum, duration, added: Date.now(),
              title: tags.title || nameFromFile(file).slice(0, 180) || 'Untitled',
              artist: tags.artist || '', lyrics: tags.lyrics || '',
              number: Math.min(metadataNumber(tags.number), 9999)
            };
            if (isCloud()) {
              if (!cloud.admin) throw new Error('Administrator sign-in required');
              await cloud.upload(file, track);
            } else {
              await transaction(['tracks', 'audio', 'albums'], 'readwrite', tx => {
                const write = () => {
                  tx.objectStore('tracks').put(track);
                  tx.objectStore('audio').put(file, track.id);
                };
                if (!track.albumId) { write(); return; }
                const request = tx.objectStore('albums').get(track.albumId);
                request.onsuccess = () => {
                  if (request.result?.groupId !== groupId) track.albumId = '';
                  write();
                };
              });
              }
            completed.push(file);
          } catch (error) {
            failed.push(`${file.name} (${error.name === 'QuotaExceededError' ? 'device storage full' : error.message})`);
          }
        }
        if (completed.length) refresh(groupId);
        if (failed.length) {
          status.textContent = `${completed.length} added. Could not add ${failed.join(', ')}. Select files again to retry.`;
          if (!form.isConnected) toast(`${completed.length} added, ${failed.length} could not be read`);
        } else {
          finishEditor(form);
          toast(`${completed.length} ${completed.length === 1 ? 'song' : 'songs'} added`);
        }
      } finally {
        uploadingGroup = '';
        submit.disabled = false;
        form.elements.files.value = '';
      }
    }

    function finishEditor(form) {
      if (!form.isConnected) return;
      closeModal();
      if (modalReturn?.isConnected) modalReturn.focus();
    }

    async function saveEdit(form, groupId) {
      const id = form.dataset.id;
      const title = form.elements.title.value.trim();
      if (!title) { form.elements.title.focus(); return; }
      const submit = form.querySelector('button[type="submit"]');
      submit.disabled = true;
      try {
        if (form.id === 'musicAlbumForm') {
          const existing = albums.find(album => album.id === id);
          if (id && !existing) return;
          const artworkFile = form.elements.artwork.files[0];
          const artwork = artworkFile ? await processArtwork(artworkFile) :
            form.elements.removeArtwork?.checked ? '' : existing?.artwork || '';
          const album = {id: id || uid(), groupId, title, artwork, added: existing?.added || Date.now()};
          if (isCloud() && (!existing || existing.remote)) await cloud.saveAlbum(album);
          else await transaction(['albums'], 'readwrite', tx => tx.objectStore('albums').put(album));
          if (groupId === musicGroup) albumFilter = album.id;
          if (current?.albumId === album.id) { currentAlbum = album; updatePlayerInfo(); }
        } else {
          const existing = tracks.find(track => track.id === id);
          if (!existing) return;
          const track = {...existing, title, artist: form.elements.artist.value.trim(),
            albumId: form.elements.album.value, number: metadataNumber(form.elements.number.value)};
          if (existing.remote) await cloud.saveTrack(track);
          else await transaction(['tracks', 'albums'], 'readwrite', tx => {
            const put = () => tx.objectStore('tracks').put(track);
            if (!track.albumId) { put(); return; }
            const request = tx.objectStore('albums').get(track.albumId);
            request.onsuccess = () => {
              if (request.result?.groupId !== groupId) track.albumId = '';
              put();
            };
          });
          queue = queue.map(item => item.id === id ? track : item);
          if (current?.id === id) {
            current = track;
            currentAlbum = albums.find(album => album.id === track.albumId);
            updatePlayerInfo();
          }
        }
        finishEditor(form);
        refresh(groupId);
      } catch (error) { report(error); }
      finally { submit.disabled = false; }
    }

    async function remove(action, id, trigger) {
      const isAlbum = action === 'delete-album';
      const item = (isAlbum ? albums : tracks).find(item => item.id === id);
      if (!item || !confirm(isAlbum ? `Delete “${item.title}”? Its songs will stay in the group playlist.` :
        `Remove “${item.title}” from this device’s music library?`)) return;
      trigger.disabled = true;
      try {
        if (isAlbum) {
          if (item.remote) await cloud.deleteAlbum(id);
          else await transaction(['tracks', 'albums'], 'readwrite', tx => {
            const store = tx.objectStore('tracks');
            const cursor = store.index('group').openCursor(item.groupId);
            cursor.onsuccess = () => {
              const row = cursor.result;
              if (!row) return;
              if (row.value.albumId === id) row.update({...row.value, albumId: ''});
              row.continue();
            };
            tx.objectStore('albums').delete(id);
          });
          queue = queue.map(track => track.albumId === id ? {...track, albumId: ''} : track);
          if (current?.albumId === id) {
            current = {...current, albumId: ''};
            currentAlbum = null;
            updatePlayerInfo();
          }
        } else {
          if (item.remote) await cloud.deleteTrack(id);
          else await transaction(['tracks', 'audio'], 'readwrite', tx => {
            tx.objectStore('tracks').delete(id);
            tx.objectStore('audio').delete(id);
          });
          queue = queue.filter(track => track.id !== id);
          if (current?.id === id) stop();
        }
        finishEditor(trigger);
        refresh(item.groupId);
      } catch (error) { report(error); }
      finally { trigger.disabled = false; }
    }

    async function deleteGroup(groupId) {
      if (uploadingGroup === groupId) throw new Error('Wait for the song upload to finish before deleting the group.');
      await transaction(['tracks', 'audio', 'albums'], 'readwrite', tx => {
        for (const store of ['tracks', 'albums']) {
          const cursor = tx.objectStore(store).index('group').openCursor(groupId);
          cursor.onsuccess = () => {
            const row = cursor.result;
            if (!row) return;
            if (store === 'tracks') tx.objectStore('audio').delete(row.primaryKey);
            row.delete();
            row.continue();
          };
        }
      });
      queue = queue.filter(track => track.groupId !== groupId);
      if (current?.groupId === groupId) stop();
    }

    dock.innerHTML = `<div class="dock-face">
      <button type="button" class="deck-track" data-music="open-player" aria-label="Open now playing">
        <img class="deck-cover" alt=""><span><strong data-player-title></strong><small data-player-artist></small></span>
      </button>
      <div class="deck-controls" aria-label="Playback controls">
        ${button('previous', 'Previous track', 'prev')}${button('toggle', 'Play', 'play')}${button('next', 'Next track', 'next')}
      </div>
      <label class="deck-timeline"><span data-player-time></span><input type="range" min="0" max="0" step="0.1" value="0" aria-label="Playback position"><span data-player-duration></span></label>
    </div>`;
    deck.innerHTML = `<div class="turntable">
      <div class="turntable-head"><h2 id="musicDeckTitle">Now playing</h2>${button('close-player', 'Close now playing', 'close')}</div>
      <div class="turntable-stage" aria-hidden="true">
        <img class="turntable-sleeve deck-cover" alt="">
        <div class="turntable-record"><div class="turntable-label"><img class="deck-cover" alt=""></div></div>
        <div class="tonearm"></div>
      </div>
      <div class="turntable-title"><strong data-player-title></strong><small data-player-artist></small></div>
      <label class="deck-timeline"><span data-player-time></span><input type="range" min="0" max="0" step="0.1" value="0" aria-label="Playback position"><span data-player-duration></span></label>
      <div class="deck-controls" aria-label="Playback controls">
        ${button('previous', 'Previous track', 'prev')}${button('toggle', 'Play', 'play')}${button('next', 'Next track', 'next')}
      </div>
      <details class="turntable-lyrics" hidden><summary>Lyrics</summary><div tabindex="0" class="lyrics-sheet" aria-label="Track lyrics"></div></details>
    </div>`;
    const surfaces = [dock, deck];
    const lyricDetails = deck.querySelector('.turntable-lyrics');
    const lyricSheet = lyricDetails.querySelector('.lyrics-sheet');

    function markTrack() {
      document.querySelectorAll('[data-track-row]').forEach((row, index) => {
        const active = row.dataset.trackRow === current?.id;
        const playing = active && !audio.paused;
        row.classList.toggle('is-current', active);
        const control = row.querySelector('.music-track-play');
        const title = row.querySelector('strong').textContent;
        control.setAttribute('aria-label', `${playing ? 'Pause' : 'Play'} ${title}`);
        row.querySelector('.music-track-number').textContent = active ?
          (playing ? 'Ⅱ' : '▶') : String(index + 1).padStart(2, '0');
      });
    }

    function updatePlayerInfo(trackChanged = false) {
      dock.hidden = !current;
      document.body.classList.toggle('music-dock-visible', Boolean(current));
      if (!current) {
        if (deck.open) deck.close();
        if ('mediaSession' in navigator) navigator.mediaSession.metadata = null;
        markTrack();
        return;
      }
      const group = getGroup(current.groupId) || currentGroup;
      const artist = current.artist || group?.name || '';
      const artwork = currentAlbum?.artwork || (group ? cover(group) : './assets/vault/blank-sleeve.webp');
      for (const surface of surfaces) {
        surface.querySelector('[data-player-title]').textContent = current.title;
        surface.querySelector('[data-player-artist]').textContent = [artist, currentAlbum?.title].filter(Boolean).join(' · ');
        for (const image of surface.querySelectorAll('.deck-cover')) image.src = artwork;
      }
      if (trackChanged && !current.lyrics) lyricDetails.open = false;
      lyricDetails.hidden = !current.lyrics;
      if (trackChanged) {
        lyricSheet.textContent = current.lyrics;
        lyricSheet.scrollTop = 0;
      }
      if ('mediaSession' in navigator && typeof MediaMetadata === 'function') {
        navigator.mediaSession.metadata = new MediaMetadata({title: current.title, artist,
          album: currentAlbum?.title || '', artwork: [{src: new URL(artwork, document.baseURI).href}]});
      }
      updateControls();
      updateTime();
    }

    function updateControls() {
      const playing = Boolean(current && !audio.paused);
      deck.classList.toggle('is-playing', playing);
      const adjacent = queue.findIndex(track => track.id === current?.id);
      for (const surface of surfaces) {
        const toggle = surface.querySelector('[data-music="toggle"]');
        const label = playing ? 'Pause' : 'Play';
        toggle.innerHTML = icon(playing ? 'pause' : 'play');
        toggle.setAttribute('aria-label', label);
        toggle.title = label;
        surface.querySelector('[data-music="next"]').disabled = adjacent < 0 || adjacent >= queue.length - 1;
        surface.querySelector('[data-music="previous"]').disabled = adjacent <= 0 && audio.currentTime < 3;
      }
      markTrack();
    }

    function updateTime() {
      const duration = Number.isFinite(audio.duration) ? audio.duration : current?.duration || 0;
      for (const surface of surfaces) {
        const slider = surface.querySelector('input[type="range"]');
        slider.max = duration;
        slider.value = Math.min(audio.currentTime, duration);
        slider.disabled = !source;
        slider.style.setProperty('--progress', `${duration ? audio.currentTime / duration * 100 : 0}%`);
        surface.querySelector('[data-player-time]').textContent = time(audio.currentTime);
        surface.querySelector('[data-player-duration]').textContent = time(duration);
        surface.querySelector('[data-music="previous"]').disabled =
          queue.findIndex(track => track.id === current?.id) <= 0 && audio.currentTime < 3;
      }
    }

    async function playAudio(request) {
      try { await audio.play(); }
      catch (error) {
        if (request === playRequest && error.name !== 'AbortError') {
          updateControls();
          toast('Playback could not start. Tap Play to try again.');
        }
      }
    }

    async function play(track, nextQueue) {
      if (!track) return;
      const request = ++playRequest;
      try {
        let file = null;
        let album = null;
        if (track.remote && isCloud()) {
          album = (cloud.library.albums || []).find(item => item.id === track.albumId) || null;
          if (!track.audioUrl || !track.audioUrl.startsWith(cloud.endpoint + '/audio/')) {
            toast('This streaming URL is invalid.'); return;
          }
        } else {
          [file, album] = await read(['audio', 'albums'], tx =>
            [tx.objectStore('audio').get(track.id), tx.objectStore('albums').get(track.albumId || '')]);
          if (!file) { toast('This audio file is unavailable on this device.'); return; }
        }
        if (request !== playRequest) return;
        audio.pause();
        if (source && source.startsWith('blob:')) URL.revokeObjectURL(source);
        current = track;
        currentAlbum = album;
        currentGroup = getGroup(track.groupId);
        queue = nextQueue;
        source = track.remote ? track.audioUrl : URL.createObjectURL(file);
        audio.src = source;
        updatePlayerInfo(true);
        await playAudio(request);
      } catch (error) { if (request === playRequest) report(error); }
    }

    function stop() {
      playRequest++;
      audio.pause();
      audio.removeAttribute('src');
      audio.load();
      if (source && source.startsWith('blob:')) URL.revokeObjectURL(source);
      source = '';
      current = null;
      currentAlbum = null;
      currentGroup = null;
      queue = [];
      updatePlayerInfo();
    }

    function step(direction) {
      if (!current) return;
      if (direction < 0 && audio.currentTime >= 3) { audio.currentTime = 0; return; }
      const index = queue.findIndex(track => track.id === current.id);
      if (index >= 0) play(queue[index + direction], queue);
    }

    function toggle() {
      if (!current) return;
      if (audio.paused) playAudio(playRequest);
      else { playRequest++; audio.pause(); }
    }

    for (const event of ['play', 'pause', 'ended']) audio.addEventListener(event, updateControls);
    for (const event of ['loadedmetadata', 'timeupdate', 'durationchange']) audio.addEventListener(event, updateTime);
    audio.addEventListener('ended', () => step(1));
    audio.addEventListener('error', () => { if (source) toast('The browser could not play this file.'); });

    if ('mediaSession' in navigator) {
      const actions = {play: () => { if (current) playAudio(playRequest); }, pause: () => audio.pause(),
        previoustrack: () => step(-1), nexttrack: () => step(1),
        seekto: event => { if (source) audio.currentTime = event.seekTime; }};
      for (const [action, handler] of Object.entries(actions)) {
        try { navigator.mediaSession.setActionHandler(action, handler); } catch { /* Browser lacks this action. */ }
      }
      for (const event of ['play', 'pause', 'ended']) {
        audio.addEventListener(event, () => {
          navigator.mediaSession.playbackState = audio.paused ? 'paused' : 'playing';
        });
      }
    }

    document.addEventListener('click', event => {
      const control = event.target.closest('[data-music]');
      if (!control) return;
      const {music: action, id} = control.dataset;
      const group = getGroup(musicGroup);
      switch (action) {
        case 'open-player': if (current && !deck.open) deck.showModal(); break;
        case 'close-player': deck.close(); break;
        case 'toggle': toggle(); break;
        case 'previous': step(-1); break;
        case 'next': step(1); break;
        case 'play-list': {
          const nextQueue = playlist();
          play(nextQueue[0], nextQueue);
          break;
        }
        case 'track': {
          const nextQueue = playlist();
          if (current?.id === id) {
            queue = nextQueue;
            updateControls();
            toggle();
          } else play(nextQueue.find(item => item.id === id), nextQueue);
          break;
        }
        case 'album': {
          albumFilter = id;
          const panel = document.getElementById('musicLibrary');
          if (!panel || !group) break;
          draw(panel, group);
          Array.from(panel.querySelectorAll('[data-music="album"]')).find(item => item.dataset.id === id)?.focus();
          break;
        }
        case 'cloud-login': if (isCloud()) adminDialog(control); break;
        case 'cloud-signout': if (isCloud()) { cloud.signOut(); refresh(musicGroup); } break;
        case 'upload': uploadDialog(control); break;
        case 'new-album': albumDialog(null, control); break;
        case 'edit-album': albumDialog(albums.find(album => album.id === id), control); break;
        case 'edit-track': trackDialog(tracks.find(track => track.id === id), control); break;
        case 'delete-album':
        case 'delete-track': remove(action, id, control); break;
      }
    });

    document.addEventListener('submit', event => {
      const form = event.target;
      if (form.id === 'musicCloudLoginForm') { event.preventDefault(); login(form); }
      if (form.id === 'musicUploadForm') { event.preventDefault(); saveUploads(form, musicGroup); }
      if (['musicAlbumForm', 'musicTrackForm'].includes(form.id)) { event.preventDefault(); saveEdit(form, musicGroup); }
    });

    for (const surface of surfaces) surface.querySelector('input[type="range"]').addEventListener('input', event => {
      if (source) audio.currentTime = Number(event.target.value);
    });
    deck.addEventListener('click', event => { if (event.target === deck) deck.close(); });
    cloud?.start(() => { if (musicGroup) refresh(musicGroup); });
    return {render, deleteGroup, updatePlayerInfo};
  }

  window.GreenBatMusicLibrary = {attach};
})();
