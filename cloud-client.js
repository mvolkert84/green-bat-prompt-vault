(() => {
  'use strict';
  const KEY = 'green-bat-cloud-admin-session';
  const empty = () => ({version: 1, updatedAt: '', tracks: [], albums: []});

  class CloudMusicClient {
    constructor(endpoint) {
      this.endpoint = typeof endpoint === 'string' && /^https:\/\/[^\s/]+/i.test(endpoint) ?
        endpoint.replace(/\/+$/, '') : '';
      this.enabled = Boolean(this.endpoint);
      this.token = this.enabled ? (sessionStorage.getItem(KEY) || '') : '';
      this.admin = false;
      this.library = empty();
      this.ready = false;
      this.error = '';
      this.onChange = null;
      this.refreshing = null;
    }
    url(path) { return this.endpoint + path; }
    async request(path, options = {}, admin = false) {
      if (!this.enabled) throw new Error('The cloud library is not configured');
      const headers = new Headers(options.headers || {});
      if (admin) {
        if (!this.token) throw new Error('Administrator sign-in required');
        headers.set('Authorization', 'Bearer ' + this.token);
      }
      const response = await fetch(this.url(path), {...options, headers, cache: 'no-store'});
      if (!response.ok) {
        if (response.status === 401) this.admin = false;
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.error || 'Cloud request failed (' + response.status + ')');
      }
      return response;
    }
    async signIn(token) {
      const candidate = String(token || '').trim();
      if (!candidate) throw new Error('Enter your administrator key');
      this.token = candidate;
      try {
        await this.request('/admin/session', {}, true);
        this.admin = true;
        sessionStorage.setItem(KEY, candidate);
      } catch (error) {
        this.token = '';
        this.admin = false;
        sessionStorage.removeItem(KEY);
        throw error;
      }
    }
    signOut() {
      this.admin = false;
      this.token = '';
      sessionStorage.removeItem(KEY);
      if (this.onChange) this.onChange();
    }
    async sync() {
      if (!this.enabled) return;
      if (this.refreshing) return this.refreshing;
      this.refreshing = (async () => {
        try {
          const response = await this.request('/library');
          const next = await response.json();
          if (!Array.isArray(next.tracks) || !Array.isArray(next.albums)) {
            throw new Error('The cloud catalog format is invalid');
          }
          const tracks = next.tracks.filter(item => item && typeof item.id === 'string' &&
            typeof item.groupId === 'string').map(item => ({
              ...item, remote: true, audioUrl: this.url('/audio/' + encodeURIComponent(item.id))
            }));
          const albums = next.albums.filter(item => item && typeof item.id === 'string' &&
            typeof item.groupId === 'string').map(item => ({...item, remote: true}));
          const wasChanged = !this.ready || next.updatedAt !== this.library.updatedAt;
          this.library = {version: 1, updatedAt: next.updatedAt || '', tracks, albums};
          this.ready = true;
          this.error = '';
          if (wasChanged && this.onChange) this.onChange();
        } catch (error) {
          this.error = error.message || 'Unable to reach the cloud';
          if (!this.ready && this.onChange) this.onChange();
        }
      })().finally(() => { this.refreshing = null; });
      return this.refreshing;
    }
    start(onChange) {
      this.onChange = onChange;
      if (!this.enabled) return;
      this.sync();
      window.setInterval(() => this.sync(), 90000);
      document.addEventListener('visibilitychange', () => {
        if (!document.hidden) this.sync();
      });
      window.addEventListener('online', () => this.sync());
    }
    async upload(file, metadata) {
      const body = new FormData();
      body.append('file', file, file.name);
      for (const [key, value] of Object.entries(metadata)) body.append(key, String(value ?? ''));
      const response = await this.request('/admin/tracks', {method: 'POST', body}, true);
      await this.sync();
      return response.json();
    }
    async saveAlbum(album) {
      await this.request('/admin/albums', {
        method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify(album)
      }, true);
      await this.sync();
    }
    async saveTrack(track) {
      await this.request('/admin/tracks/' + encodeURIComponent(track.id), {
        method: 'PATCH', headers: {'Content-Type':'application/json'}, body: JSON.stringify(track)
      }, true);
      await this.sync();
    }
    async deleteAlbum(id) {
      await this.request('/admin/albums/' + encodeURIComponent(id), {method: 'DELETE'}, true);
      await this.sync();
    }
    async deleteTrack(id) {
      await this.request('/admin/tracks/' + encodeURIComponent(id), {method: 'DELETE'}, true);
      await this.sync();
    }
  }

  window.GreenBatCloudClient = {
    create: () => new CloudMusicClient(window.GREEN_BAT_CLOUD_CONFIG?.endpoint || '')
  };
})();
