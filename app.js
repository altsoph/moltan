/**
 * Moltbook Analysis Console - Static Version (Oldschool Green Theme)
 * Pure HTML + JavaScript, state stored in URL hash
 */

// ============================================================================
// DATA SERVICE
// ============================================================================
const DataService = {
  posts: [],
  submolts: [],
  postTags: [],
  postClassNotes: [],
  tagEdges: [],
  submoltUmap: [],
  postEmbeddings: [],
  schema: null,

  postById: new Map(),
  submoltByName: new Map(),
  tagsByPostId: new Map(),
  classNotesByPostId: new Map(),
  embeddingByPostId: new Map(),
  postsBySubmolt: new Map(),
  postsByAuthor: new Map(),

  async loadAll(onProgress) {
    const progress = onProgress || console.log;
    const basePath = './data';

    progress('Loading schema...');
    this.schema = await this.loadJson(`${basePath}/schema.json`);

    progress('Loading posts...');
    this.posts = await this.loadJson(`${basePath}/posts.json`);

    progress('Loading submolts...');
    this.submolts = await this.loadJson(`${basePath}/submolts.json`);

    progress('Loading tags...');
    this.postTags = await this.loadJson(`${basePath}/post_tags.json`);

    progress('Loading class notes...');
    this.postClassNotes = await this.loadJson(`${basePath}/post_class_notes.json`);

    progress('Loading tag edges...');
    this.tagEdges = await this.loadJson(`${basePath}/tag_edges.json`);

    progress('Loading submolt UMAP...');
    this.submoltUmap = await this.loadJson(`${basePath}/submolt_umap.json`);

    progress('Loading post embeddings...');
    this.postEmbeddings = await this.loadJson(`${basePath}/post_embeddings.json`);

    progress('Building indexes...');
    this.buildIndexes();

    progress('Ready!');
  },

  async loadJson(url) {
    const CACHE_NAME = 'moltbook-data-v1';
    const CACHE_DURATION = 24 * 60 * 60 * 1000; // 24 hours
    
    // Try to use Cache API for better caching
    if ('caches' in window) {
      try {
        const cache = await caches.open(CACHE_NAME);
        const cachedResponse = await cache.match(url);
        
        if (cachedResponse) {
          const cachedTime = cachedResponse.headers.get('x-cached-time');
          if (cachedTime && (Date.now() - parseInt(cachedTime)) < CACHE_DURATION) {
            console.log(`Using cached: ${url}`);
            return cachedResponse.json();
          }
        }
        
        // Fetch fresh data
        const response = await fetch(url);
        if (!response.ok) throw new Error(`Failed to load ${url}`);
        
        // Clone response and add cache timestamp
        const responseData = await response.json();
        const cacheResponse = new Response(JSON.stringify(responseData), {
          headers: {
            'Content-Type': 'application/json',
            'x-cached-time': Date.now().toString()
          }
        });
        await cache.put(url, cacheResponse);
        console.log(`Cached: ${url}`);
        return responseData;
      } catch (e) {
        console.warn('Cache API failed, falling back to direct fetch:', e);
      }
    }
    
    // Fallback to direct fetch
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Failed to load ${url}`);
    return response.json();
  },

  buildIndexes() {
    this.postById = new Map(this.posts.map(p => [p.post_id, p]));
    this.submoltByName = new Map(this.submolts.map(s => [s.submolt_name, s]));
    
    this.tagsByPostId = new Map();
    for (const tag of this.postTags) {
      const arr = this.tagsByPostId.get(tag.post_id) || [];
      arr.push(tag);
      this.tagsByPostId.set(tag.post_id, arr);
    }

    this.classNotesByPostId = new Map();
    for (const note of this.postClassNotes) {
      const arr = this.classNotesByPostId.get(note.post_id) || [];
      arr.push(note);
      this.classNotesByPostId.set(note.post_id, arr);
    }

    this.embeddingByPostId = new Map(this.postEmbeddings.map(e => [e.post_id, e]));

    this.postsBySubmolt = new Map();
    this.postsByAuthor = new Map();
    for (const p of this.posts) {
      let arr = this.postsBySubmolt.get(p.submolt_name) || [];
      arr.push(p);
      this.postsBySubmolt.set(p.submolt_name, arr);

      arr = this.postsByAuthor.get(p.author_name) || [];
      arr.push(p);
      this.postsByAuthor.set(p.author_name, arr);
    }
  },

  filterPosts(filters) {
    let result = this.posts;

    if (filters.submolts.length > 0) {
      const set = new Set(filters.submolts);
      result = result.filter(p => set.has(p.submolt_name));
    }
    if (filters.authors.length > 0) {
      const set = new Set(filters.authors);
      result = result.filter(p => set.has(p.author_name));
    }
    if (filters.tags.length > 0) {
      const set = new Set(filters.tags);
      result = result.filter(p => {
        const tags = this.tagsByPostId.get(p.post_id) || [];
        return tags.some(t => set.has(t.tag));
      });
    }
    if (filters.classNotes.length > 0) {
      const set = new Set(filters.classNotes);
      result = result.filter(p => {
        const notes = this.classNotesByPostId.get(p.post_id) || [];
        return notes.some(n => set.has(n.class_note));
      });
    }
    if (filters.engagement.minUpvotes > 0) {
      result = result.filter(p => p.upvotes >= filters.engagement.minUpvotes);
    }
    if (filters.engagement.minComments > 0) {
      result = result.filter(p => p.comment_count >= filters.engagement.minComments);
    }
    if (filters.search) {
      const q = filters.search.toLowerCase();
      result = result.filter(p =>
        p.title.toLowerCase().includes(q) ||
        p.content.toLowerCase().includes(q) ||
        p.author_name.toLowerCase().includes(q)
      );
    }
    if (filters.postIds && filters.postIds.length > 0) {
      const set = new Set(filters.postIds);
      result = result.filter(p => set.has(p.post_id));
    }

    return result;
  },

  getTopItems(posts, field, limit = 10, displayField = null) {
    const counts = new Map();
    const displays = new Map();
    for (const p of posts) {
      counts.set(p[field], (counts.get(p[field]) || 0) + 1);
      if (displayField) displays.set(p[field], p[displayField]);
    }
    return Array.from(counts.entries())
      .map(([name, count]) => ({ name, count, displayName: displays.get(name) || name }))
      .sort((a, b) => b.count - a.count)
      .slice(0, limit);
  },

  getTopTags(posts, limit = 10) {
    const counts = new Map();
    for (const p of posts) {
      const tags = this.tagsByPostId.get(p.post_id) || [];
      for (const t of tags) counts.set(t.tag, (counts.get(t.tag) || 0) + 1);
    }
    return Array.from(counts.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, limit);
  },

  getTopClassNotes(posts, limit = 10) {
    const counts = new Map();
    for (const p of posts) {
      const notes = this.classNotesByPostId.get(p.post_id) || [];
      for (const n of notes) counts.set(n.class_note, (counts.get(n.class_note) || 0) + 1);
    }
    return Array.from(counts.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, limit);
  },

  getAllTagsGrouped() {
    const groups = new Map();
    for (const tag of this.postTags) {
      const parts = tag.tag.split(':');
      const prefix = parts.length > 1 ? parts[0] : 'other';
      if (!groups.has(prefix)) groups.set(prefix, new Map());
      const tagMap = groups.get(prefix);
      tagMap.set(tag.tag, (tagMap.get(tag.tag) || 0) + 1);
    }
    const result = [];
    for (const [prefix, tagMap] of groups.entries()) {
      const tags = Array.from(tagMap.entries())
        .map(([name, count]) => ({ name, count }))
        .sort((a, b) => b.count - a.count);
      result.push({ prefix, tags });
    }
    return result.sort((a, b) => a.prefix.localeCompare(b.prefix));
  },

  getHistogram(posts, field, bins = 10) {
    if (posts.length === 0) return [];
    const values = posts.map(p => p[field]);
    const min = Math.min(...values);
    const max = Math.max(...values);
    if (max === min) return [{ min, max: min + 1, count: posts.length, label: `${min}` }];
    const binSize = (max - min) / bins;
    const hist = [];
    for (let i = 0; i < bins; i++) {
      const lo = min + i * binSize;
      const hi = min + (i + 1) * binSize;
      const count = values.filter(v => v >= lo && (i === bins - 1 ? v <= hi : v < hi)).length;
      hist.push({ min: Math.floor(lo), max: Math.floor(hi), count, label: `${Math.floor(lo)}-${Math.floor(hi)}` });
    }
    return hist;
  },

  sortPosts(posts, field, asc = false) {
    const sorted = [...posts];
    sorted.sort((a, b) => {
      let cmp = 0;
      if (field === 'created_at') cmp = a.created_at.localeCompare(b.created_at);
      else cmp = a[field] - b[field];
      return asc ? cmp : -cmp;
    });
    return sorted;
  },

  findSimilarPosts(postId, limit = 10) {
    const target = this.embeddingByPostId.get(postId);
    if (!target) return [];
    const dists = [];
    for (const [id, emb] of this.embeddingByPostId.entries()) {
      if (id === postId) continue;
      const d = Math.sqrt((emb.x - target.x) ** 2 + (emb.y - target.y) ** 2);
      dists.push({ id, d });
    }
    dists.sort((a, b) => a.d - b.d);
    return dists.slice(0, limit).map(x => this.postById.get(x.id)).filter(Boolean);
  },

  findDuplicates(posts) {
    const groups = new Map();
    for (const p of posts) {
      const key = p.title.toLowerCase().trim();
      if (key.length < 10) continue;
      const arr = groups.get(key) || [];
      arr.push(p);
      groups.set(key, arr);
    }
    return Array.from(groups.entries())
      .filter(([, arr]) => arr.length > 1)
      .map(([title, arr]) => ({ title, count: arr.length, posts: arr }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 20);
  },

  findOutliers(posts) {
    const out = [];
    const byUp = [...posts].sort((a, b) => b.upvotes - a.upvotes);
    for (const p of byUp.slice(0, 10)) {
      if (p.upvotes > 10) out.push({ type: 'High Upvotes', post: p, value: p.upvotes });
    }
    const byLen = [...posts].sort((a, b) => b.content_len - a.content_len);
    for (const p of byLen.slice(0, 5)) {
      if (p.content_len > 5000) out.push({ type: 'Long Content', post: p, value: p.content_len });
    }
    return out;
  }
};

// ============================================================================
// STATE SERVICE - URL HASH BASED
// ============================================================================
const StateService = {
  filters: {
    submolts: [],
    authors: [],
    tags: [],
    classNotes: [],
    engagement: { minUpvotes: 0, minComments: 0 },
    search: '',
    postIds: null,
    selectedPost: null,
    tab: 'overview'
  },
  selection: { type: null, id: null },
  listeners: [],

  getFilters() { return { ...this.filters }; },

  setFilters(f) {
    Object.assign(this.filters, f);
    this.notify();
    this.saveToHash();
  },

  clearFilters() {
    const currentTab = this.filters.tab;
    this.filters = {
      submolts: [],
      authors: [],
      tags: [],
      classNotes: [],
      engagement: { minUpvotes: 0, minComments: 0 },
      search: '',
      postIds: null,
      selectedPost: null,
      tab: currentTab
    };
    this.notify();
    this.saveToHash();
  },

  setTab(tab) {
    this.filters.tab = tab;
    this.saveToHash();
  },

  toggleSubmoltFilter(s) {
    const idx = this.filters.submolts.indexOf(s);
    if (idx >= 0) this.filters.submolts.splice(idx, 1);
    else this.filters.submolts.push(s);
    this.notify();
    this.saveToHash();
  },

  toggleTagFilter(t) {
    const idx = this.filters.tags.indexOf(t);
    if (idx >= 0) this.filters.tags.splice(idx, 1);
    else this.filters.tags.push(t);
    this.notify();
    this.saveToHash();
  },

  toggleClassNoteFilter(n) {
    const idx = this.filters.classNotes.indexOf(n);
    if (idx >= 0) this.filters.classNotes.splice(idx, 1);
    else this.filters.classNotes.push(n);
    this.notify();
    this.saveToHash();
  },

  toggleAuthorFilter(a) {
    const idx = this.filters.authors.indexOf(a);
    if (idx >= 0) this.filters.authors.splice(idx, 1);
    else this.filters.authors.push(a);
    this.notify();
    this.saveToHash();
  },

  setEngagement(field, val) {
    this.filters.engagement[field] = val;
    this.notify();
    this.saveToHash();
  },

  setSearch(q) {
    this.filters.search = q;
    this.notify();
    this.saveToHash();
  },

  setPostIds(ids) {
    this.filters.postIds = ids;
    this.notify();
  },

  setSelectedPost(postId) {
    this.filters.selectedPost = postId;
    this.saveToHash();
  },

  setSelection(type, id) {
    this.selection = { type, id };
  },

  clearSelection() {
    this.selection = { type: null, id: null };
  },

  onChange(fn) { this.listeners.push(fn); },
  notify() { this.listeners.forEach(fn => fn(this.filters)); },

  saveToHash() {
    const state = {};
    if (this.filters.submolts.length) state.s = this.filters.submolts;
    if (this.filters.authors.length) state.a = this.filters.authors;
    if (this.filters.tags.length) state.t = this.filters.tags;
    if (this.filters.classNotes.length) state.n = this.filters.classNotes;
    if (this.filters.engagement.minUpvotes > 0) state.u = this.filters.engagement.minUpvotes;
    if (this.filters.engagement.minComments > 0) state.c = this.filters.engagement.minComments;
    if (this.filters.search) state.q = this.filters.search;
    if (this.filters.selectedPost) state.p = this.filters.selectedPost;
    if (this.filters.tab && this.filters.tab !== 'overview') state.tab = this.filters.tab;
    
    const hash = Object.keys(state).length > 0 ? '#' + encodeURIComponent(JSON.stringify(state)) : '';
    history.replaceState(null, '', location.pathname + location.search + hash);
  },

  loadFromHash() {
    if (!location.hash || location.hash.length < 2) return;
    try {
      const state = JSON.parse(decodeURIComponent(location.hash.slice(1)));
      if (state.s) this.filters.submolts = state.s;
      if (state.a) this.filters.authors = state.a;
      if (state.t) this.filters.tags = state.t;
      if (state.n) this.filters.classNotes = state.n;
      if (state.u) this.filters.engagement.minUpvotes = state.u;
      if (state.c) this.filters.engagement.minComments = state.c;
      if (state.q) this.filters.search = state.q;
      if (state.p) this.filters.selectedPost = state.p;
      if (state.tab) this.filters.tab = state.tab;
    } catch (e) {
      console.warn('Failed to parse hash state:', e);
    }
  }
};

// ============================================================================
// UI HELPERS
// ============================================================================
function escapeHtml(t) {
  if (!t) return '';
  const d = document.createElement('div');
  d.textContent = t;
  return d.innerHTML;
}

function formatDate(s) {
  if (!s) return '';
  try {
    return new Date(s).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  } catch { return s.slice(0, 10); }
}

// ============================================================================
// OVERVIEW MODULE
// ============================================================================
function renderOverview(posts) {
  renderHistogram('upvotes-histogram', posts, 'upvotes', 'Upvotes');
  renderHistogram('comments-histogram', posts, 'comment_count', 'Comments');
  renderBarChart('top-submolts-chart', DataService.getTopItems(posts, 'submolt_name', 10, 'submolt_display_name'), n => StateService.toggleSubmoltFilter(n));
  renderBarChart('top-authors-chart', DataService.getTopItems(posts, 'author_name', 10), n => StateService.toggleAuthorFilter(n));
  renderBarChart('top-tags-chart', DataService.getTopTags(posts, 10), n => StateService.toggleTagFilter(n));
  renderBarChart('class-notes-chart', DataService.getTopClassNotes(posts, 10), n => StateService.toggleClassNoteFilter(n));
}

function renderHistogram(containerId, posts, field, xLabel) {
  const container = document.querySelector(`#${containerId} .chart`);
  container.innerHTML = '';
  const hist = DataService.getHistogram(posts, field, 10);
  if (hist.length === 0) return;

  const margin = { top: 10, right: 10, bottom: 35, left: 40 };
  const width = container.clientWidth - margin.left - margin.right;
  const height = 120 - margin.top - margin.bottom;

  const svg = d3.select(container).append('svg')
    .attr('width', width + margin.left + margin.right)
    .attr('height', height + margin.top + margin.bottom)
    .append('g').attr('transform', `translate(${margin.left},${margin.top})`);

  const x = d3.scaleBand().domain(hist.map((_, i) => i)).range([0, width]).padding(0.1);
  const y = d3.scaleLinear().domain([0, d3.max(hist, d => d.count)]).range([height, 0]);

  svg.selectAll('.bar').data(hist).join('rect').attr('class', 'bar')
    .attr('x', (_, i) => x(i)).attr('y', d => y(d.count))
    .attr('width', x.bandwidth()).attr('height', d => height - y(d.count))
    .attr('fill', '#00ff00').attr('opacity', 0.8);

  // X axis with labels
  const xAxis = svg.append('g').attr('class', 'axis').attr('transform', `translate(0,${height})`);
  xAxis.selectAll('.tick-label').data(hist).join('text')
    .attr('class', 'tick-label')
    .attr('x', (_, i) => x(i) + x.bandwidth() / 2)
    .attr('y', 12)
    .attr('text-anchor', 'middle')
    .attr('fill', 'var(--text-muted)')
    .attr('font-size', '8px')
    .text((d, i) => i % 2 === 0 ? d.min : '');

  // X axis label
  svg.append('text')
    .attr('x', width / 2)
    .attr('y', height + 28)
    .attr('text-anchor', 'middle')
    .attr('fill', 'var(--text-muted)')
    .attr('font-size', '9px')
    .text(xLabel);

  svg.append('g').attr('class', 'axis').call(d3.axisLeft(y).ticks(3));
}

function renderBarChart(containerId, data, onClick) {
  const container = document.getElementById(containerId);
  if (!container) return;
  if (data.length === 0) { container.innerHTML = '<p style="color:var(--text-muted);">No data</p>'; return; }
  const max = Math.max(...data.map(d => d.count));
  container.innerHTML = data.map(d => `
    <div class="bar-item" data-name="${escapeHtml(d.name)}">
      <span class="bar-label" title="${escapeHtml(d.displayName || d.name)}">${escapeHtml(d.displayName || d.name)}</span>
      <div class="bar-track"><div class="bar-fill" style="width:${(d.count / max) * 100}%"></div></div>
      <span class="bar-value">${d.count}</span>
    </div>
  `).join('');
  container.querySelectorAll('.bar-item').forEach(el => {
    el.addEventListener('click', () => onClick(el.dataset.name));
  });
}

// ============================================================================
// SPACES MODULE - WITH RECTANGLE SELECTION + ZOOM/PAN
// ============================================================================
let spacesZoom = null;

function renderSpaces(posts) {
  const container = document.getElementById('submolt-map');
  container.innerHTML = '';
  const umap = DataService.submoltUmap;
  if (umap.length === 0) { container.innerHTML = '<p style="color:var(--text-muted);padding:40px;text-align:center;">No UMAP data</p>'; return; }

  const submoltCounts = new Map();
  for (const p of posts) submoltCounts.set(p.submolt_name, (submoltCounts.get(p.submolt_name) || 0) + 1);
  const totalCounts = new Map();
  for (const p of DataService.posts) totalCounts.set(p.submolt_name, (totalCounts.get(p.submolt_name) || 0) + 1);

  const width = container.clientWidth;
  const height = container.clientHeight || 400;

  const svg = d3.select(container).append('svg')
    .attr('width', width)
    .attr('height', height)
    .style('cursor', 'crosshair');

  const g = svg.append('g');

  const xExt = d3.extent(umap, d => d.x);
  const yExt = d3.extent(umap, d => d.y);
  const xScale = d3.scaleLinear().domain([xExt[0] - 5, xExt[1] + 5]).range([40, width - 20]);
  const yScale = d3.scaleLinear().domain([yExt[0] - 5, yExt[1] + 5]).range([height - 20, 20]);

  const maxCount = Math.max(...Array.from(totalCounts.values())) || 1;
  const sizeScale = d3.scaleSqrt().domain([0, maxCount]).range([3, 20]);
  const inFilter = new Set(posts.map(p => p.submolt_name));

  // Zoom behavior (pan only with CTRL)
  spacesZoom = d3.zoom()
    .scaleExtent([0.5, 10])
    .filter((e) => e.type === 'wheel' || e.ctrlKey)
    .on('zoom', (e) => g.attr('transform', e.transform));
  svg.call(spacesZoom);

  // Draw points
  const points = g.selectAll('.submolt-point').data(umap).join('circle')
    .attr('class', 'submolt-point')
    .attr('cx', d => xScale(d.x))
    .attr('cy', d => yScale(d.y))
    .attr('r', d => sizeScale(totalCounts.get(d.submolt_name) || 0))
    .attr('fill', d => inFilter.has(d.submolt_name) ? '#00ff00' : '#003300')
    .attr('stroke', '#00ff00')
    .attr('stroke-width', 0.5)
    .attr('opacity', d => inFilter.has(d.submolt_name) ? 0.9 : 0.4)
    .style('cursor', 'pointer');

  // Tooltip
  const tooltip = d3.select('body').selectAll('.map-tooltip').data([0]).join('div').attr('class', 'tooltip map-tooltip').style('opacity', 0);

  points.on('mouseover', (e, d) => {
    const sub = DataService.submoltByName.get(d.submolt_name);
    tooltip.transition().duration(100).style('opacity', 1);
    tooltip.html(`<div class="tooltip-title">${d.submolt_name}</div><div class="tooltip-meta">${totalCounts.get(d.submolt_name) || 0} posts</div>`)
      .style('left', (e.pageX + 10) + 'px').style('top', (e.pageY - 10) + 'px');
  }).on('mouseout', () => tooltip.transition().duration(200).style('opacity', 0));

  points.on('click', (e, d) => {
    e.stopPropagation();
    StateService.setFilters({ ...StateService.getFilters(), submolts: [d.submolt_name] });
    showSubmoltProfile(d.submolt_name, posts);
    showSubmoltInReader(d.submolt_name);
  });

  // Rectangle selection
  let selRect = null, selStart = null;

  svg.on('mousedown', function(e) {
    if (e.shiftKey || e.button === 0) {
      const [mx, my] = d3.pointer(e, g.node());
      selStart = { x: mx, y: my };
      selRect = g.append('rect').attr('class', 'selection-rect').attr('x', mx).attr('y', my).attr('width', 0).attr('height', 0);
      svg.on('mousemove.select', function(e2) {
        const [mx2, my2] = d3.pointer(e2, g.node());
        const x = Math.min(selStart.x, mx2), y = Math.min(selStart.y, my2);
        const w = Math.abs(mx2 - selStart.x), h = Math.abs(my2 - selStart.y);
        selRect.attr('x', x).attr('y', y).attr('width', w).attr('height', h);
      });
    }
  });

  svg.on('mouseup', function(e) {
    svg.on('mousemove.select', null);
    if (selRect && selStart) {
      const [mx, my] = d3.pointer(e, g.node());
      const x0 = Math.min(selStart.x, mx), y0 = Math.min(selStart.y, my);
      const x1 = Math.max(selStart.x, mx), y1 = Math.max(selStart.y, my);
      
      if (x1 - x0 > 5 && y1 - y0 > 5) {
        const selected = umap.filter(d => {
          const px = xScale(d.x), py = yScale(d.y);
          return px >= x0 && px <= x1 && py >= y0 && py <= y1;
        }).map(d => d.submolt_name);
        
        if (selected.length > 0) {
          StateService.setFilters({ ...StateService.getFilters(), submolts: selected });
        }
      }
      selRect.remove();
      selRect = null;
      selStart = null;
    }
  });

  // Zoom info
  svg.append('text').attr('class', 'zoom-info')
    .attr('x', width - 10).attr('y', height - 10)
    .attr('text-anchor', 'end')
    .attr('fill', 'var(--text-muted)')
    .attr('font-size', '11px')
    .text('Scroll: zoom | CTRL+drag: pan | Drag: select');
}

function showSubmoltProfile(name, posts) {
  const container = document.getElementById('submolt-profile');
  const sub = DataService.submoltByName.get(name);
  if (!sub) { container.innerHTML = '<p style="color:var(--text-muted);">Not found</p>'; return; }
  const subPosts = DataService.postsBySubmolt.get(name) || [];
  const topAuthors = DataService.getTopItems(subPosts, 'author_name', 5);
  const topTags = DataService.getTopTags(subPosts, 8);
  container.innerHTML = `
    <h3 style="color:var(--accent-primary);">&gt; ${escapeHtml(sub.display_name)}</h3>
    <p style="color:var(--text-muted);font-size:10px;">m/${escapeHtml(sub.submolt_name)}</p>
    <p style="margin:10px 0;color:var(--text-secondary);font-size:11px;">${escapeHtml(sub.description)}</p>
    <div style="display:flex;gap:12px;margin-bottom:12px;font-size:10px;">
      <span style="color:var(--accent-primary);">${sub.subscriber_count} subscribers</span>
      <span style="color:var(--accent-primary);">${subPosts.length} posts</span>
    </div>
    <h4 style="font-size:10px;color:var(--text-muted);margin:12px 0 6px;text-transform:uppercase;">Top Authors</h4>
    <div class="context-list">${topAuthors.map(a => `<div class="context-item" data-author="${escapeHtml(a.name)}" style="padding:6px;"><span style="font-size:10px;">${escapeHtml(a.name)}</span><span style="color:var(--text-muted);font-size:9px;margin-left:auto;">${a.count}</span></div>`).join('')}</div>
    <h4 style="font-size:10px;color:var(--text-muted);margin:12px 0 6px;text-transform:uppercase;">Top Tags</h4>
    <div class="post-tags">${topTags.map(t => `<span class="tag-badge">${escapeHtml(t.name)}</span>`).join('')}</div>
  `;
  container.querySelectorAll('[data-author]').forEach(el => {
    el.addEventListener('click', () => showAuthorInReader(el.dataset.author));
  });
}

// ============================================================================
// NETWORKS MODULE - ZOOMABLE/PANNABLE + NORMALIZED WEIGHTS
// ============================================================================
let currentNetworkType = 'tag-cooccurrence';
let edgeThresholdPercent = 10;

function renderNetworks(posts) {
  const container = document.getElementById('network-container');
  container.innerHTML = '';
  if (currentNetworkType === 'tag-cooccurrence') renderTagNetwork(container);
  else renderAuthorSubmoltNetwork(container, posts);
}

function renderTagNetwork(container) {
  const allEdges = DataService.tagEdges;
  if (allEdges.length === 0) { container.innerHTML = '<p style="color:var(--text-muted);text-align:center;padding:40px;">No edges</p>'; return; }

  // Calculate node weights (total edge weight for each tag)
  const nodeWeights = new Map();
  for (const e of allEdges) {
    nodeWeights.set(e.tag_a, (nodeWeights.get(e.tag_a) || 0) + e.weight);
    nodeWeights.set(e.tag_b, (nodeWeights.get(e.tag_b) || 0) + e.weight);
  }

  // Normalize edges by max node weight
  const maxNodeWeight = Math.max(...nodeWeights.values());
  const normalizedEdges = allEdges.map(e => {
    const maxPairWeight = Math.max(nodeWeights.get(e.tag_a), nodeWeights.get(e.tag_b));
    return { ...e, normalizedWeight: (e.weight / maxPairWeight) * 100 };
  });

  // Filter by threshold percent
  const edges = normalizedEdges.filter(e => e.normalizedWeight >= edgeThresholdPercent);
  
  if (edges.length === 0) { container.innerHTML = '<p style="color:var(--text-muted);text-align:center;padding:40px;">No edges above threshold</p>'; return; }

  const nodeSet = new Set();
  edges.forEach(e => { nodeSet.add(e.tag_a); nodeSet.add(e.tag_b); });
  const nodes = Array.from(nodeSet).map(id => {
    const ns = id.includes(':') ? id.split(':')[0] : 'other';
    return { id, label: id.split(':').pop(), group: ns, size: Math.sqrt(nodeWeights.get(id) || 1) * 0.5 + 4 };
  });
  const links = edges.map(e => ({ source: e.tag_a, target: e.tag_b, weight: e.normalizedWeight }));

  renderForceGraph(container, nodes, links, id => StateService.toggleTagFilter(id));
}

function renderAuthorSubmoltNetwork(container, posts) {
  const authorSubs = new Map();
  for (const p of posts) {
    let map = authorSubs.get(p.author_name);
    if (!map) { map = new Map(); authorSubs.set(p.author_name, map); }
    map.set(p.submolt_name, (map.get(p.submolt_name) || 0) + 1);
  }
  const bridges = Array.from(authorSubs.entries()).filter(([, m]) => m.size >= 2).sort((a, b) => b[1].size - a[1].size).slice(0, 20);
  if (bridges.length === 0) { container.innerHTML = '<p style="color:var(--text-muted);text-align:center;padding:40px;">No bridge authors</p>'; return; }

  const nodes = [];
  const links = [];
  const addedSubs = new Set();
  
  // Calculate max for normalization
  let maxEdgeWeight = 1;
  for (const [, subs] of bridges) {
    for (const [, cnt] of subs.entries()) {
      if (cnt > maxEdgeWeight) maxEdgeWeight = cnt;
    }
  }

  for (const [author, subs] of bridges) {
    nodes.push({ id: `a:${author}`, label: author, group: 'author', size: 10 });
    for (const [sub, cnt] of subs.entries()) {
      if (!addedSubs.has(sub)) { nodes.push({ id: `s:${sub}`, label: sub, group: 'submolt', size: 6 }); addedSubs.add(sub); }
      const normalizedWeight = (cnt / maxEdgeWeight) * 100;
      if (normalizedWeight >= edgeThresholdPercent) {
        links.push({ source: `a:${author}`, target: `s:${sub}`, weight: normalizedWeight });
      }
    }
  }
  
  if (links.length === 0) { container.innerHTML = '<p style="color:var(--text-muted);text-align:center;padding:40px;">No edges above threshold</p>'; return; }
  
  renderForceGraph(container, nodes, links, id => {
    if (id.startsWith('a:')) StateService.toggleAuthorFilter(id.slice(2));
    else if (id.startsWith('s:')) StateService.toggleSubmoltFilter(id.slice(2));
  });
}

function renderForceGraph(container, nodes, links, onClick) {
  const width = container.clientWidth || 800;
  const height = container.clientHeight || 500;
  
  const svg = d3.select(container).append('svg')
    .attr('width', width)
    .attr('height', height);

  const g = svg.append('g');

  // Zoom behavior (pan only with CTRL)
  const zoom = d3.zoom()
    .scaleExtent([0.2, 5])
    .filter((e) => e.type === 'wheel' || e.ctrlKey)
    .on('zoom', (e) => g.attr('transform', e.transform));
  svg.call(zoom);

  const colorScale = d3.scaleOrdinal()
    .domain(['emotion', 'style', 'intent', 'other', 'author', 'submolt'])
    .range(['#00ff00', '#00cc00', '#ffff00', '#008800', '#00ffff', '#00ff66']);

  const sim = d3.forceSimulation(nodes)
    .force('link', d3.forceLink(links).id(d => d.id).distance(60))
    .force('charge', d3.forceManyBody().strength(-100))
    .force('center', d3.forceCenter(width / 2, height / 2))
    .force('collision', d3.forceCollide().radius(d => d.size + 3));

  const link = g.append('g').selectAll('line').data(links).join('line')
    .attr('stroke', '#003300')
    .attr('stroke-opacity', d => d.weight / 100)
    .attr('stroke-width', d => Math.sqrt(d.weight) * 0.3 + 0.5);

  const node = g.append('g').selectAll('circle').data(nodes).join('circle')
    .attr('r', d => d.size)
    .attr('fill', d => colorScale(d.group))
    .attr('stroke', '#00ff00')
    .attr('stroke-width', 0.5)
    .attr('opacity', 0.9)
    .style('cursor', 'pointer')
    .call(d3.drag().on('start', dragstart).on('drag', dragging).on('end', dragend));

  const label = g.append('g').selectAll('text').data(nodes).join('text')
    .text(d => d.label.length > 10 ? d.label.slice(0, 10) + '..' : d.label)
    .attr('font-size', '8px')
    .attr('fill', '#00ff00')
    .attr('dx', d => d.size + 2)
    .attr('dy', 3)
    .attr('font-family', 'Courier New, monospace');

  const tooltip = d3.select('body').selectAll('.net-tooltip').data([0]).join('div').attr('class', 'tooltip net-tooltip').style('opacity', 0);

  node.on('mouseover', (e, d) => {
    tooltip.transition().duration(100).style('opacity', 1);
    tooltip.html(`<div class="tooltip-title">${d.id}</div>`)
      .style('left', (e.pageX + 10) + 'px').style('top', (e.pageY - 10) + 'px');
  }).on('mouseout', () => tooltip.transition().duration(200).style('opacity', 0));

  node.on('click', (_, d) => onClick(d.id));

  sim.on('tick', () => {
    link.attr('x1', d => d.source.x).attr('y1', d => d.source.y).attr('x2', d => d.target.x).attr('y2', d => d.target.y);
    node.attr('cx', d => d.x).attr('cy', d => d.y);
    label.attr('x', d => d.x).attr('y', d => d.y);
  });

  function dragstart(e, d) { if (!e.active) sim.alphaTarget(0.3).restart(); d.fx = d.x; d.fy = d.y; }
  function dragging(e, d) { d.fx = e.x; d.fy = e.y; }
  function dragend(e, d) { if (!e.active) sim.alphaTarget(0); d.fx = null; d.fy = null; }

  // Zoom info
  svg.append('text')
    .attr('x', width - 10).attr('y', height - 10)
    .attr('text-anchor', 'end')
    .attr('fill', 'var(--text-muted)')
    .attr('font-size', '11px')
    .text('Scroll: zoom | CTRL+drag: pan | Drag nodes to move');
}

// ============================================================================
// EMBEDDINGS MODULE - ZOOMABLE/PANNABLE + ALWAYS COLOR BY SUBMOLT
// ============================================================================
let selectedPostId = null;
let embeddingsTransform = d3.zoomIdentity;

function renderEmbeddings(posts) {
  const container = document.getElementById('embeddings-container');
  container.innerHTML = '';
  
  const embs = DataService.postEmbeddings;
  if (embs.length === 0) { container.innerHTML = '<p style="color:var(--text-muted);text-align:center;padding:40px;">No embeddings</p>'; return; }

  const width = container.clientWidth;
  const height = container.clientHeight || 400;

  const svg = d3.select(container).append('svg')
    .attr('width', width)
    .attr('height', height)
    .style('background', '#000');

  const g = svg.append('g');

  const pad = 40;
  const xs = embs.map(e => e.x), ys = embs.map(e => e.y);
  const xMin = Math.min(...xs) - 5, xMax = Math.max(...xs) + 5;
  const yMin = Math.min(...ys) - 5, yMax = Math.max(...ys) + 5;
  const xScale = d3.scaleLinear().domain([xMin, xMax]).range([pad, width - pad]);
  const yScale = d3.scaleLinear().domain([yMin, yMax]).range([height - pad, pad]);

  const filteredIds = new Set(posts.map(p => p.post_id));
  const postMap = new Map(DataService.posts.map(p => [p.post_id, p]));

  // Color by submolt
  const submolts = [...new Set(DataService.posts.map(p => p.submolt_name))];
  const colorScale = d3.scaleOrdinal()
    .domain(submolts)
    .range(d3.quantize(t => d3.interpolateGreens(0.3 + t * 0.7), submolts.length));

  // Draw points
  const points = g.selectAll('.emb-point').data(embs).join('circle')
    .attr('class', 'emb-point')
    .attr('cx', d => xScale(d.x))
    .attr('cy', d => yScale(d.y))
    .attr('r', d => {
      if (d.post_id === selectedPostId) return 8;
      if (filteredIds.has(d.post_id)) return 4;
      return 1.5;
    })
    .attr('fill', d => {
      if (d.post_id === selectedPostId) return '#ffff00';
      const post = postMap.get(d.post_id);
      if (filteredIds.has(d.post_id) && post) return colorScale(post.submolt_name);
      return '#002200';
    })
    .attr('stroke', d => d.post_id === selectedPostId ? '#ffff00' : 'none')
    .attr('stroke-width', d => d.post_id === selectedPostId ? 2 : 0)
    .attr('opacity', d => filteredIds.has(d.post_id) ? 0.85 : 0.3)
    .style('cursor', 'pointer');

  // Zoom behavior (pan only with CTRL)
  const zoom = d3.zoom()
    .scaleExtent([0.5, 20])
    .filter((e) => e.type === 'wheel' || e.ctrlKey)
    .on('zoom', (e) => {
      embeddingsTransform = e.transform;
      g.attr('transform', e.transform);
    });
  svg.call(zoom);

  // Restore previous transform
  svg.call(zoom.transform, embeddingsTransform);

  // Tooltip
  const tooltip = d3.select('body').selectAll('.emb-tooltip').data([0]).join('div').attr('class', 'tooltip emb-tooltip').style('opacity', 0);

  points.on('mouseover', (e, d) => {
    const post = postMap.get(d.post_id);
    if (post) {
      tooltip.transition().duration(100).style('opacity', 1);
      tooltip.html(`<div class="tooltip-title">${escapeHtml(post.title?.slice(0, 50) || '(No title)')}</div><div class="tooltip-meta">m/${post.submolt_name}</div>`)
        .style('left', (e.pageX + 10) + 'px').style('top', (e.pageY - 10) + 'px');
    }
  }).on('mouseout', () => tooltip.transition().duration(200).style('opacity', 0));

  points.on('click', (e, d) => {
    e.stopPropagation();
    selectedPostId = d.post_id;
    document.getElementById('find-similar-btn').disabled = false;
    document.getElementById('clear-selection-btn').style.display = 'inline-block';
    showPostInReader(d.post_id);
    renderEmbeddings(currentPosts); // Re-render to highlight
  });

  // Selection rectangle with shift
  let selRect = null, selStart = null;

  svg.on('mousedown', function(e) {
    if (e.shiftKey) {
      const [mx, my] = d3.pointer(e, g.node());
      selStart = { x: mx, y: my };
      selRect = g.append('rect').attr('class', 'selection-rect').attr('x', mx).attr('y', my).attr('width', 0).attr('height', 0);
      svg.on('mousemove.select', function(e2) {
        const [mx2, my2] = d3.pointer(e2, g.node());
        const x = Math.min(selStart.x, mx2), y = Math.min(selStart.y, my2);
        const w = Math.abs(mx2 - selStart.x), h = Math.abs(my2 - selStart.y);
        selRect.attr('x', x).attr('y', y).attr('width', w).attr('height', h);
      });
    }
  });

  svg.on('mouseup', function(e) {
    svg.on('mousemove.select', null);
    if (selRect && selStart) {
      const [mx, my] = d3.pointer(e, g.node());
      const x0 = Math.min(selStart.x, mx), y0 = Math.min(selStart.y, my);
      const x1 = Math.max(selStart.x, mx), y1 = Math.max(selStart.y, my);
      
      if (x1 - x0 > 5 && y1 - y0 > 5) {
        const selected = embs.filter(d => {
          const px = xScale(d.x), py = yScale(d.y);
          return px >= x0 && px <= x1 && py >= y0 && py <= y1;
        }).map(d => d.post_id);
        
        if (selected.length > 0) {
          StateService.setPostIds(selected);
          document.getElementById('embeddings-info').innerHTML = `<p>&gt; Selected ${selected.length} posts</p>`;
          document.getElementById('clear-selection-btn').style.display = 'inline-block';
        }
      }
      selRect.remove();
      selRect = null;
      selStart = null;
    }
  });
}

function initEmbeddingsEvents() {
  document.getElementById('find-similar-btn').addEventListener('click', () => {
    if (!selectedPostId) return;
    const similar = DataService.findSimilarPosts(selectedPostId, 10);
    const ids = [selectedPostId, ...similar.map(p => p.post_id)];
    StateService.setPostIds(ids);
    document.getElementById('embeddings-info').innerHTML = `<p>&gt; Showing ${ids.length} similar posts</p>`;
  });

  document.getElementById('clear-selection-btn').addEventListener('click', () => {
    selectedPostId = null;
    StateService.setPostIds(null);
    document.getElementById('find-similar-btn').disabled = true;
    document.getElementById('clear-selection-btn').style.display = 'none';
    document.getElementById('embeddings-info').innerHTML = '&gt; Click to view. Shift+drag to select. CTRL+drag to pan. Scroll to zoom.';
    renderEmbeddings(currentPosts);
  });
}

// ============================================================================
// INTEGRITY MODULE
// ============================================================================
function renderIntegrity(posts) {
  const all = DataService.posts;

  const missing = (f, check) => { const n = all.filter(check).length; return { val: `${n} (${(n / all.length * 100).toFixed(1)}%)`, status: n / all.length < 0.05 ? 'good' : n / all.length < 0.2 ? 'warning' : 'bad' }; };
  const metrics = {
    'Total Posts': { val: all.length, status: 'good' },
    'Missing Content': missing('content', p => !p.content || p.content.trim().length === 0),
    'Empty Titles': missing('title', p => p.is_empty_title),
    'Unique Authors': { val: new Set(all.map(p => p.author_id)).size, status: 'good' },
    'Unique Submolts': { val: new Set(all.map(p => p.submolt_name)).size, status: 'good' }
  };
  document.getElementById('quality-metrics').innerHTML = Object.entries(metrics).map(([k, v]) => `<div class="quality-metric"><span class="metric-label">${k}</span><span class="metric-value ${v.status}">${v.val}</span></div>`).join('');

  const fields = [
    { name: 'title', check: p => !p.title || p.title.trim().length === 0 },
    { name: 'content', check: p => !p.content || p.content.trim().length === 0 },
    { name: 'created_date', check: p => !p.created_date }
  ];
  const missData = fields.map(f => ({ field: f.name, missing: all.filter(f.check).length }));
  const maxMiss = Math.max(...missData.map(d => d.missing), 1);
  document.getElementById('missingness-chart').innerHTML = missData.map(d => `
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;">
      <span style="width:80px;font-size:10px;color:var(--text-secondary);">${d.field}</span>
      <div style="flex:1;height:12px;background:var(--bg-tertiary);border:1px solid var(--border-color);border-radius:2px;overflow:hidden;">
        <div style="width:${(d.missing / maxMiss) * 100}%;height:100%;background:${d.missing > 0 ? '#ffff00' : '#00ff00'};"></div>
      </div>
      <span style="width:60px;font-size:10px;color:var(--text-muted);">${d.missing}</span>
    </div>
  `).join('');

  const dups = DataService.findDuplicates(all);
  document.getElementById('duplicates-list').innerHTML = dups.length === 0
    ? '<p style="color:var(--text-muted);font-size:10px;">No duplicates found</p>'
    : dups.slice(0, 8).map(d => `
      <div style="padding:6px;background:var(--bg-tertiary);border:1px solid var(--border-color);border-radius:2px;margin-bottom:6px;">
        <div style="font-size:10px;margin-bottom:2px;color:var(--text-secondary);">"${escapeHtml(d.title.slice(0, 40))}..."</div>
        <div style="font-size:9px;color:var(--text-muted);">${d.count} copies</div>
      </div>
    `).join('');

  const outliers = DataService.findOutliers(all);
  document.getElementById('outliers-list').innerHTML = outliers.length === 0
    ? '<p style="color:var(--text-muted);font-size:10px;">No outliers found</p>'
    : outliers.slice(0, 8).map(o => `
      <div class="context-item" data-post-id="${o.post.post_id}" style="display:flex;justify-content:space-between;padding:6px;">
        <span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:10px;color:var(--text-secondary);">${escapeHtml(o.post.title || '(No title)')}</span>
        <span style="color:var(--accent-warning);font-size:9px;">${o.type}: ${o.value}</span>
      </div>
    `).join('');
  document.querySelectorAll('#outliers-list .context-item').forEach(el => {
    el.addEventListener('click', () => showPostInReader(el.dataset.postId));
  });
}

// ============================================================================
// READER
// ============================================================================
function showPostInReader(postId, saveToState = true) {
  const post = DataService.postById.get(postId);
  if (!post) return;
  if (saveToState) {
    StateService.setSelectedPost(postId);
    selectedPostId = postId; // Update embeddings selection
  }
  const tags = DataService.tagsByPostId.get(postId) || [];
  const notes = DataService.classNotesByPostId.get(postId) || [];
  const similar = DataService.findSimilarPosts(postId, 5);
  const content = document.getElementById('reader-content');
  content.innerHTML = `
    <div class="post-card">
      <h3 class="post-card-title">&gt; ${escapeHtml(post.title || '(No title)')}</h3>
      <div class="post-card-meta">
        <span>by <a data-author="${escapeHtml(post.author_name)}">${escapeHtml(post.author_name)}</a></span>
        <span>in <a data-submolt="${escapeHtml(post.submolt_name)}">${escapeHtml(post.submolt_display_name)}</a></span>
        <span>${formatDate(post.created_at)}</span>
      </div>
      <div class="post-card-content">${escapeHtml(post.content).replace(/\n/g, '<br>')}</div>
      <div class="post-tags">${tags.map(t => `<span class="tag-badge ${t.tag_namespace}">${escapeHtml(t.tag)}</span>`).join('')}</div>
      ${notes.length ? `<div class="post-tags" style="margin-top:6px;">${notes.map(n => `<span class="tag-badge">${escapeHtml(n.class_note)}</span>`).join('')}</div>` : ''}
      <div class="post-card-stats">
        <span class="stat-badge upvote">+${post.upvotes}</span>
        <span class="stat-badge downvote">-${post.downvotes}</span>
        <span class="stat-badge">${post.comment_count} comments</span>
      </div>
    </div>
    ${similar.length ? `
      <div class="context-section">
        <h4>&gt; Similar Posts</h4>
        <div class="context-list">${similar.map(p => `<div class="context-item" data-post-id="${p.post_id}"><span class="context-item-title">${escapeHtml(p.title || '(No title)')}</span><span class="context-item-meta">${formatDate(p.created_at)}</span></div>`).join('')}</div>
      </div>
    ` : ''}
  `;
  content.querySelectorAll('[data-author]').forEach(el => el.addEventListener('click', () => showAuthorInReader(el.dataset.author)));
  content.querySelectorAll('[data-submolt]').forEach(el => el.addEventListener('click', () => showSubmoltInReader(el.dataset.submolt)));
  content.querySelectorAll('[data-post-id]').forEach(el => el.addEventListener('click', () => showPostInReader(el.dataset.postId)));
}

function showSubmoltInReader(name) {
  const sub = DataService.submoltByName.get(name);
  if (!sub) return;
  const posts = DataService.postsBySubmolt.get(name) || [];
  const content = document.getElementById('reader-content');
  content.innerHTML = `
    <div class="post-card">
      <h3 class="post-card-title">&gt; ${escapeHtml(sub.display_name)}</h3>
      <p style="color:var(--text-muted);font-size:10px;">m/${escapeHtml(sub.submolt_name)}</p>
      <p style="margin:10px 0;color:var(--text-secondary);font-size:11px;">${escapeHtml(sub.description)}</p>
      <div class="post-card-stats">
        <span class="stat-badge">${sub.subscriber_count} subscribers</span>
        <span class="stat-badge">${posts.length} posts</span>
      </div>
    </div>
    <div class="context-section">
      <h4>&gt; Recent Posts</h4>
      <div class="context-list">${posts.slice(0, 10).map(p => `<div class="context-item" data-post-id="${p.post_id}"><span class="context-item-title">${escapeHtml(p.title || '(No title)')}</span><span class="context-item-meta">${formatDate(p.created_at)}</span></div>`).join('')}</div>
    </div>
  `;
  content.querySelectorAll('[data-post-id]').forEach(el => el.addEventListener('click', () => showPostInReader(el.dataset.postId)));
}

function showAuthorInReader(name) {
  const posts = DataService.postsByAuthor.get(name) || [];
  if (posts.length === 0) return;
  const content = document.getElementById('reader-content');
  const submoltCounts = new Map();
  let totalUp = 0, totalDown = 0, totalComm = 0;
  for (const p of posts) {
    submoltCounts.set(p.submolt_name, (submoltCounts.get(p.submolt_name) || 0) + 1);
    totalUp += p.upvotes; totalDown += p.downvotes; totalComm += p.comment_count;
  }
  const topSubs = Array.from(submoltCounts.entries()).sort((a, b) => b[1] - a[1]).slice(0, 5);
  content.innerHTML = `
    <div class="post-card">
      <h3 class="post-card-title">&gt; ${escapeHtml(name)}</h3>
      <div class="post-card-stats">
        <span class="stat-badge">${posts.length} posts</span>
        <span class="stat-badge upvote">+${totalUp}</span>
        <span class="stat-badge downvote">-${totalDown}</span>
        <span class="stat-badge">${totalComm} comments</span>
      </div>
    </div>
    <div class="context-section">
      <h4>&gt; Active In</h4>
      <div class="context-list">${topSubs.map(([s, c]) => `<div class="context-item" data-submolt="${escapeHtml(s)}"><span>m/${escapeHtml(s)}</span><span style="color:var(--text-muted);font-size:9px;margin-left:auto;">${c}</span></div>`).join('')}</div>
    </div>
    <div class="context-section">
      <h4>&gt; Recent Posts</h4>
      <div class="context-list">${posts.slice(0, 10).map(p => `<div class="context-item" data-post-id="${p.post_id}"><span class="context-item-title">${escapeHtml(p.title || '(No title)')}</span><span class="context-item-meta">${formatDate(p.created_at)}</span></div>`).join('')}</div>
    </div>
  `;
  content.querySelectorAll('[data-submolt]').forEach(el => el.addEventListener('click', () => showSubmoltInReader(el.dataset.submolt)));
  content.querySelectorAll('[data-post-id]').forEach(el => el.addEventListener('click', () => showPostInReader(el.dataset.postId)));
}

// ============================================================================
// RESULTS TABLE
// ============================================================================
let currentSortField = 'created_at';

function renderResultsTable(posts) {
  const sorted = DataService.sortPosts(posts, currentSortField).slice(0, 500);
  document.getElementById('results-count').textContent = `(${posts.length.toLocaleString()})`;
  const tbody = document.getElementById('results-tbody');
  if (sorted.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:var(--text-muted);">No results</td></tr>';
    return;
  }
  tbody.innerHTML = sorted.map(p => `
    <tr data-post-id="${p.post_id}">
      <td class="title-cell" title="${escapeHtml(p.title)}">${escapeHtml(p.title || '(No title)')}</td>
      <td>${escapeHtml(p.submolt_display_name)}</td>
      <td>${escapeHtml(p.author_name)}</td>
      <td><span style="color:var(--accent-success);">+${p.upvotes}</span> <span style="color:var(--accent-danger);">-${p.downvotes}</span></td>
      <td>${p.comment_count}</td>
      <td>${formatDate(p.created_at)}</td>
    </tr>
  `).join('');
  tbody.querySelectorAll('tr').forEach(row => {
    row.addEventListener('click', () => showPostInReader(row.dataset.postId));
  });
}

// ============================================================================
// FILTER UI
// ============================================================================
function renderFilterChips() {
  const f = StateService.filters;
  const chips = [];
  f.submolts.forEach(s => chips.push({ type: 'submolt', label: s, action: `submolt:${s}` }));
  f.authors.forEach(a => chips.push({ type: 'author', label: a, action: `author:${a}` }));
  f.tags.forEach(t => chips.push({ type: 'tag', label: t, action: `tag:${t}` }));
  f.classNotes.forEach(n => chips.push({ type: 'note', label: n, action: `note:${n}` }));
  if (f.search) chips.push({ type: 'search', label: `"${f.search}"`, action: 'search' });
  if (f.engagement.minUpvotes > 0) chips.push({ type: 'up', label: `${f.engagement.minUpvotes}+ up`, action: 'minUp' });
  if (f.engagement.minComments > 0) chips.push({ type: 'comm', label: `${f.engagement.minComments}+ comm`, action: 'minComm' });

  const container = document.getElementById('filter-chips');
  if (chips.length === 0) {
    container.innerHTML = '<span class="filter-chip-empty">&gt; No filters active</span>';
    return;
  }
  container.innerHTML = chips.map(c => `<span class="filter-chip" data-action="${c.action}">${c.type}:${escapeHtml(c.label)} <span class="filter-chip-remove">x</span></span>`).join('') +
    '<button class="btn btn-small" style="margin-left:6px;" id="clear-all-btn">Clear</button>';

  container.querySelectorAll('.filter-chip').forEach(el => {
    el.addEventListener('click', () => {
      const action = el.dataset.action;
      if (action === 'search') { StateService.setSearch(''); document.getElementById('search-input').value = ''; }
      else if (action === 'minUp') { StateService.setEngagement('minUpvotes', 0); document.getElementById('min-upvotes').value = '0'; }
      else if (action === 'minComm') { StateService.setEngagement('minComments', 0); document.getElementById('min-comments').value = '0'; }
      else if (action.startsWith('submolt:')) StateService.toggleSubmoltFilter(action.slice(8));
      else if (action.startsWith('author:')) StateService.toggleAuthorFilter(action.slice(7));
      else if (action.startsWith('tag:')) StateService.toggleTagFilter(action.slice(4));
      else if (action.startsWith('note:')) StateService.toggleClassNoteFilter(action.slice(5));
    });
  });

  document.getElementById('clear-all-btn')?.addEventListener('click', () => {
    StateService.clearFilters();
    document.getElementById('search-input').value = '';
    document.getElementById('min-upvotes').value = '0';
    document.getElementById('min-comments').value = '0';
  });
}

function renderFilterLists() {
  const all = DataService.posts;
  const f = StateService.filters;

  // Submolts
  const submoltCounts = new Map();
  for (const p of all) submoltCounts.set(p.submolt_name, (submoltCounts.get(p.submolt_name) || 0) + 1);
  const topSubmolts = Array.from(submoltCounts.entries()).sort((a, b) => b[1] - a[1]).slice(0, 20);
  document.getElementById('submolt-filter-list').innerHTML = topSubmolts.map(([n, c]) => `
    <div class="filter-item ${f.submolts.includes(n) ? 'selected' : ''}" data-submolt="${escapeHtml(n)}">
      <span>${escapeHtml(n)}</span>
      <span class="filter-item-count">${c}</span>
    </div>
  `).join('');
  document.querySelectorAll('#submolt-filter-list .filter-item').forEach(el => {
    el.addEventListener('click', () => StateService.toggleSubmoltFilter(el.dataset.submolt));
  });

  // Tags grouped by prefix
  const tagGroups = DataService.getAllTagsGrouped();
  document.getElementById('tag-filter-list').innerHTML = tagGroups.map(g => `
    <div class="tag-group">
      <div class="tag-group-title">${g.prefix}</div>
      <div class="tag-group-items">
        ${g.tags.map(t => `<span class="tag-filter-item ${f.tags.includes(t.name) ? 'selected' : ''}" data-tag="${escapeHtml(t.name)}">${escapeHtml(t.name.split(':').pop())} (${t.count})</span>`).join('')}
      </div>
    </div>
  `).join('');
  document.querySelectorAll('#tag-filter-list .tag-filter-item').forEach(el => {
    el.addEventListener('click', () => StateService.toggleTagFilter(el.dataset.tag));
  });

  // Class notes
  const noteCounts = new Map();
  for (const p of all) {
    const notes = DataService.classNotesByPostId.get(p.post_id) || [];
    for (const n of notes) noteCounts.set(n.class_note, (noteCounts.get(n.class_note) || 0) + 1);
  }
  const topNotes = Array.from(noteCounts.entries()).sort((a, b) => b[1] - a[1]).slice(0, 15);
  document.getElementById('class-note-filter-list').innerHTML = topNotes.map(([n, c]) => `
    <div class="filter-item ${f.classNotes.includes(n) ? 'selected' : ''}" data-note="${escapeHtml(n)}">
      <span>${escapeHtml(n)}</span>
      <span class="filter-item-count">${c}</span>
    </div>
  `).join('');
  document.querySelectorAll('#class-note-filter-list .filter-item').forEach(el => {
    el.addEventListener('click', () => StateService.toggleClassNoteFilter(el.dataset.note));
  });
}

// ============================================================================
// MAIN
// ============================================================================
let currentPosts = [];
let currentTab = 'overview';

async function init() {
  const loadingText = document.getElementById('loading-text');
  const loadingOverlay = document.getElementById('loading-overlay');

  try {
    await DataService.loadAll(msg => loadingText.textContent = '> ' + msg.toUpperCase() + '...');
    StateService.loadFromHash();

    // Listen for hash changes
    window.addEventListener('hashchange', () => {
      StateService.loadFromHash();
      StateService.notify();
    });

    // Header stats totals
    window.headerStatsTotals = {
      posts: DataService.schema.tables.posts.row_count,
      authors: DataService.schema.stats.unique_authors,
      submolts: DataService.schema.stats.unique_submolts
    };

    // Init filter inputs
    document.getElementById('search-input').value = StateService.filters.search;
    document.getElementById('search-input').addEventListener('input', e => StateService.setSearch(e.target.value));
    document.getElementById('min-upvotes').value = StateService.filters.engagement.minUpvotes;
    document.getElementById('min-upvotes').addEventListener('change', e => StateService.setEngagement('minUpvotes', parseInt(e.target.value, 10) || 0));
    document.getElementById('min-comments').value = StateService.filters.engagement.minComments;
    document.getElementById('min-comments').addEventListener('change', e => StateService.setEngagement('minComments', parseInt(e.target.value, 10) || 0));

    // Tabs
    document.querySelectorAll('.tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
        btn.classList.add('active');
        const tab = btn.dataset.tab;
        document.getElementById('tab-' + tab).classList.add('active');
        currentTab = tab;
        StateService.setTab(tab);
        renderCurrentTab();
      });
    });

    // Restore tab from URL
    if (StateService.filters.tab && StateService.filters.tab !== 'overview') {
      const tab = StateService.filters.tab;
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
      document.querySelector(`.tab-btn[data-tab="${tab}"]`)?.classList.add('active');
      document.getElementById('tab-' + tab)?.classList.add('active');
      currentTab = tab;
    }

    // Sort
    document.getElementById('sort-by').addEventListener('change', e => {
      currentSortField = e.target.value;
      renderResultsTable(currentPosts);
    });

    // Export
    document.getElementById('export-btn').addEventListener('click', () => {
      if (currentPosts.length === 0) return;
      const csv = ['post_id,title,author,submolt,upvotes,downvotes,comments,created_at']
        .concat(currentPosts.map(p => `"${p.post_id}","${p.title.replace(/"/g, '""')}","${p.author_name}","${p.submolt_name}",${p.upvotes},${p.downvotes},${p.comment_count},"${p.created_at}"`))
        .join('\n');
      const blob = new Blob([csv], { type: 'text/csv' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'moltbook_export.csv';
      a.click();
    });

    // Close reader
    document.getElementById('close-reader-btn').addEventListener('click', () => {
      document.getElementById('reader-content').innerHTML = '<div class="reader-placeholder"><p>&gt; Select a post to view details.</p></div>';
      StateService.setSelectedPost(null);
      selectedPostId = null;
    });

    // Copy link button
    document.getElementById('copy-link-btn').addEventListener('click', async () => {
      const btn = document.getElementById('copy-link-btn');
      const url = window.location.href;
      try {
        await navigator.clipboard.writeText(url);
        btn.classList.add('copied');
        btn.querySelector('span').textContent = 'Copied!';
        setTimeout(() => {
          btn.classList.remove('copied');
          btn.querySelector('span').textContent = 'Copy Link';
        }, 2000);
      } catch (err) {
        // Fallback for older browsers
        const textarea = document.createElement('textarea');
        textarea.value = url;
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
        btn.classList.add('copied');
        btn.querySelector('span').textContent = 'Copied!';
        setTimeout(() => {
          btn.classList.remove('copied');
          btn.querySelector('span').textContent = 'Copy Link';
        }, 2000);
      }
    });

    // Draggable results panel resize
    initResultsResize();

    // Draggable column resize
    initColumnResize();

    // Network controls
    document.getElementById('network-type').addEventListener('change', e => {
      currentNetworkType = e.target.value;
      if (currentTab === 'networks') renderNetworks(currentPosts);
    });
    document.getElementById('edge-weight-threshold').addEventListener('input', e => {
      edgeThresholdPercent = parseInt(e.target.value, 10);
      document.getElementById('edge-weight-value').textContent = edgeThresholdPercent + '%';
      if (currentTab === 'networks') renderNetworks(currentPosts);
    });

    // Embeddings events
    initEmbeddingsEvents();

    // Listen to filter changes
    StateService.onChange(() => {
      currentPosts = DataService.filterPosts(StateService.getFilters());
      renderFilterChips();
      renderFilterLists();
      renderResultsTable(currentPosts);
      renderCurrentTab();
      updateHeaderStats(currentPosts);
    });

    // Initial render
    currentPosts = DataService.filterPosts(StateService.getFilters());
    renderFilterChips();
    renderFilterLists();
    renderResultsTable(currentPosts);
    renderCurrentTab();
    updateHeaderStats(currentPosts);

    // Restore selected post from URL
    if (StateService.filters.selectedPost) {
      selectedPostId = StateService.filters.selectedPost;
      showPostInReader(StateService.filters.selectedPost, false);
    }

    // Hide loading
    loadingOverlay.classList.add('hidden');
    setTimeout(() => loadingOverlay.remove(), 300);

  } catch (err) {
    console.error(err);
    loadingText.textContent = '> ERROR: ' + err.message;
    loadingText.style.color = '#ff3333';
  }
}

function renderCurrentTab() {
  switch (currentTab) {
    case 'overview': renderOverview(currentPosts); break;
    case 'spaces': renderSpaces(currentPosts); break;
    case 'networks': renderNetworks(currentPosts); break;
    case 'embeddings': renderEmbeddings(currentPosts); break;
    case 'integrity': renderIntegrity(currentPosts); break;
  }
}

function updateHeaderStats(posts) {
  const totals = window.headerStatsTotals;
  const currentPostCount = posts.length;
  const currentAuthors = new Set(posts.map(p => p.author_name)).size;
  const currentSubmolts = new Set(posts.map(p => p.submolt_name)).size;
  
  const isFiltered = currentPostCount < totals.posts;
  
  const formatStat = (current, total) => {
    if (isFiltered) {
      return `<span class="stat-value">${current.toLocaleString()}</span> / ${total.toLocaleString()}`;
    }
    return `<span class="stat-value">${total.toLocaleString()}</span>`;
  };
  
  document.getElementById('header-stats').innerHTML = `
    <span class="stat-item">DATA: <span class="stat-value">2026-01-30</span></span>
    <span class="stat-item">POSTS: ${formatStat(currentPostCount, totals.posts)}</span>
    <span class="stat-item">AUTHORS: ${formatStat(currentAuthors, totals.authors)}</span>
    <span class="stat-item">SUBMOLTS: ${formatStat(currentSubmolts, totals.submolts)}</span>
  `;
}

// ============================================================================
// COLUMN RESIZE
// ============================================================================
function initColumnResize() {
  // Navigator resize
  const navHandle = document.getElementById('nav-resize-handle');
  const navigator = document.getElementById('navigator');
  
  let navDragging = false;
  let navStartX = 0;
  let navStartWidth = 0;

  navHandle.addEventListener('mousedown', (e) => {
    navDragging = true;
    navStartX = e.clientX;
    navStartWidth = navigator.offsetWidth;
    navHandle.classList.add('dragging');
    document.body.style.cursor = 'ew-resize';
    document.body.style.userSelect = 'none';
    e.preventDefault();
  });

  // Reader resize
  const readerHandle = document.getElementById('reader-resize-handle');
  const reader = document.getElementById('reader');
  
  let readerDragging = false;
  let readerStartX = 0;
  let readerStartWidth = 0;

  readerHandle.addEventListener('mousedown', (e) => {
    readerDragging = true;
    readerStartX = e.clientX;
    readerStartWidth = reader.offsetWidth;
    readerHandle.classList.add('dragging');
    document.body.style.cursor = 'ew-resize';
    document.body.style.userSelect = 'none';
    e.preventDefault();
  });

  document.addEventListener('mousemove', (e) => {
    if (navDragging) {
      const deltaX = e.clientX - navStartX;
      const newWidth = Math.max(180, Math.min(500, navStartWidth + deltaX));
      navigator.style.width = newWidth + 'px';
    }
    if (readerDragging) {
      const deltaX = readerStartX - e.clientX;
      const newWidth = Math.max(280, Math.min(800, readerStartWidth + deltaX));
      reader.style.width = newWidth + 'px';
    }
  });

  document.addEventListener('mouseup', () => {
    if (navDragging) {
      navDragging = false;
      navHandle.classList.remove('dragging');
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    }
    if (readerDragging) {
      readerDragging = false;
      readerHandle.classList.remove('dragging');
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    }
  });
}

// ============================================================================
// RESULTS PANEL RESIZE
// ============================================================================
function initResultsResize() {
  const handle = document.getElementById('results-resize-handle');
  const panel = document.getElementById('results-panel');
  let isDragging = false;
  let startY = 0;
  let startHeight = 0;

  handle.addEventListener('mousedown', (e) => {
    isDragging = true;
    startY = e.clientY;
    startHeight = panel.offsetHeight;
    handle.classList.add('dragging');
    document.body.style.cursor = 'ns-resize';
    document.body.style.userSelect = 'none';
    e.preventDefault();
  });

  document.addEventListener('mousemove', (e) => {
    if (!isDragging) return;
    const deltaY = startY - e.clientY;
    const newHeight = Math.max(100, Math.min(window.innerHeight * 0.7, startHeight + deltaY));
    panel.style.height = newHeight + 'px';
  });

  document.addEventListener('mouseup', () => {
    if (isDragging) {
      isDragging = false;
      handle.classList.remove('dragging');
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    }
  });
}

// Start
document.addEventListener('DOMContentLoaded', init);
