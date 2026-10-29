/* KKP Mangrove Planting Map 2020–2023 — Three.js (r147, global build) */
(function () {
  'use strict';

  var SITES = window.MANGROVE_SITES || [];
  var PROV = window.PROVINSI || [];
  var YEARS = [2020, 2021, 2022, 2023];
  var YCOL = { 2020: '#E76F51', 2021: '#F4B942', 2022: '#3A86FF', 2023: '#B5179E' };
  var K = 1.1, LON0 = 118, LAT0 = -2.5;           // simple equirectangular projection (degrees → world units)
  var PIN_Y = 0.28;                               // province height in site mode
  var HMAX = 3.4;

  function wx(lon) { return (lon - LON0) * K; }
  function wz(lat) { return -(lat - LAT0) * K; }  // north = -z
  function $(s) { return document.querySelector(s); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function fmt(n, d) { return Number(n).toLocaleString('en-US', { maximumFractionDigits: d == null ? 0 : d }); }
  function compact(n, short) {
    if (n >= 1e6) return fmt(n / 1e6, 2) + (short ? 'M' : ' million');
    if (n >= 1e3) return fmt(n / 1e3, 1) + 'K';
    return fmt(n);
  }

  /* ---------------- state ---------------- */
  var state = { year: null, view: 'peta', prov: null, site: null, hoverProv: null, hoverPin: null };

  /* ---------------- scene ---------------- */
  var canvas = $('#kanvas');
  var renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  var scene = new THREE.Scene();
  var camera = new THREE.PerspectiveCamera(32, 1, 0.1, 500);
  var controls = new THREE.OrbitControls(camera, canvas);
  controls.enableDamping = true; controls.dampingFactor = 0.08;
  controls.maxPolarAngle = Math.PI * 0.47; controls.minDistance = 0.5; controls.maxDistance = 120;

  scene.add(new THREE.HemisphereLight(0xffffff, 0xb9cfc5, 0.62));
  var sun = new THREE.DirectionalLight(0xffffff, 0.62);
  sun.position.set(-22, 42, 26); sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -42; sun.shadow.camera.right = 42; sun.shadow.camera.top = 30; sun.shadow.camera.bottom = -30;
  sun.shadow.camera.near = 1; sun.shadow.camera.far = 120; sun.shadow.bias = -0.0006;
  scene.add(sun);

  var floor = new THREE.Mesh(new THREE.PlaneGeometry(500, 500), new THREE.ShadowMaterial({ opacity: 0.16 }));
  floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; scene.add(floor);

  /* ---------------- warna ---------------- */
  var RAMP = ['#CFE8D5', '#7CC49A', '#2F9E6E', '#0F6B4F', '#0A4A3A'].map(function (c) { return new THREE.Color(c); });
  var NODATA = new THREE.Color('#D2CDBE');
  function ramp(t) {
    t = Math.max(0, Math.min(1, t)) * (RAMP.length - 1);
    var i = Math.min(RAMP.length - 2, Math.floor(t));
    return RAMP[i].clone().lerp(RAMP[i + 1], t - i);
  }

  /* ---------------- provinsi ---------------- */
  var provs = [], byName = {}, provMeshes = [];
  PROV.forEach(function (p) {
    var shapes = p.r.map(function (r) {
      var s = new THREE.Shape();
      r.forEach(function (pt, i) { var x = wx(pt[0]), y = -wz(pt[1]); if (i) s.lineTo(x, y); else s.moveTo(x, y); });
      return s;
    });
    var geo = new THREE.ExtrudeGeometry(shapes, { depth: 1, bevelEnabled: false, curveSegments: 1 });
    geo.rotateX(-Math.PI / 2);
    var top = new THREE.MeshStandardMaterial({ color: NODATA.clone(), roughness: 0.82, metalness: 0, transparent: true });
    var side = new THREE.MeshStandardMaterial({ color: NODATA.clone().multiplyScalar(0.72), roughness: 0.9, metalness: 0, transparent: true });
    var mesh = new THREE.Mesh(geo, [top, side]);
    mesh.castShadow = true; mesh.receiveShadow = true; mesh.scale.y = 0.01;
    var minx = 1e9, maxx = -1e9, minz = 1e9, maxz = -1e9;
    p.r.forEach(function (r) { r.forEach(function (pt) { var x = wx(pt[0]), z = wz(pt[1]); minx = Math.min(minx, x); maxx = Math.max(maxx, x); minz = Math.min(minz, z); maxz = Math.max(maxz, z); }); });
    var o = { name: p.n, mesh: mesh, top: top, side: side, hv: 0, tH: 0.1, tOp: 1, tColor: NODATA.clone(), stat: { n: 0, bibit: 0, luas: 0 },
      cx: (minx + maxx) / 2, cz: (minz + maxz) / 2, w: maxx - minx, d: maxz - minz };
    mesh.userData.prov = o;
    scene.add(mesh); provs.push(o); byName[p.n] = o; provMeshes.push(mesh);
  });

  // label anchor = mean of the province's site points (all years)
  var anchors = {};
  SITES.forEach(function (s) {
    var a = anchors[s.Provinsi] || (anchors[s.Provinsi] = { x: 0, z: 0, n: 0 });
    a.x += wx(s.c[0]); a.z += wz(s.c[1]); a.n++;
  });
  var labelBox = $('#label');
  provs.forEach(function (p) {
    var a = anchors[p.name];
    if (!a) return;
    p.ax = a.x / a.n; p.az = a.z / a.n;
    p.label = document.createElement('div'); p.label.className = 'lbl';
    labelBox.appendChild(p.label);
  });
  SITES.forEach(function (s) { if (!byName[s.Provinsi]) console.warn('Province does not match boundary:', s.Provinsi); });

  /* ---------------- agregasi ---------------- */
  function filtered() { return state.year ? SITES.filter(function (s) { return s.Tahun === state.year; }) : SITES; }
  function aggregate(list) {
    var m = {};
    list.forEach(function (s) {
      var a = m[s.Provinsi] || (m[s.Provinsi] = { n: 0, bibit: 0, luas: 0 });
      a.n++; a.bibit += s.Jml_Bibit; a.luas += s.Luas;
    });
    return m;
  }
  var maxB = 1;
  function updateTargets() {
    var agg = aggregate(filtered());
    maxB = 1;
    Object.keys(agg).forEach(function (k) { maxB = Math.max(maxB, agg[k].bibit); });
    provs.forEach(function (p) {
      var s = agg[p.name] || { n: 0, bibit: 0, luas: 0 };
      p.stat = s;
      var t = s.n ? Math.sqrt(s.bibit / maxB) : 0;
      if (state.view === 'prov') {
        p.tH = p === state.prov ? PIN_Y : 0.08;
        p.tOp = p === state.prov ? 1 : 0.3;
      } else {
        p.tH = s.n ? 0.25 + (HMAX - 0.25) * t : 0.1;
        p.tOp = 1;
      }
      p.tColor = s.n ? ramp(t) : NODATA.clone();
    });
  }

  /* ---------------- pin & poligon ---------------- */
  var pinsGroup = new THREE.Group(); scene.add(pinsGroup);
  var polyGroup = new THREE.Group(); scene.add(polyGroup);
  var sphereGeo = new THREE.SphereGeometry(1, 18, 14);
  var coneGeo = new THREE.ConeGeometry(1, 1, 14); coneGeo.rotateX(Math.PI);   // tip pointing down
  var ringGeo = new THREE.RingGeometry(0.86, 1, 56); ringGeo.rotateX(-Math.PI / 2);
  var pinSize = 0.08, pulse = null;

  function clearGroup(g) {
    while (g.children.length) {
      var c = g.children.pop();
      c.traverse(function (o) { if (o.material && o.geometry !== sphereGeo && o.geometry !== coneGeo && o.geometry !== ringGeo) { o.geometry.dispose(); } if (o.material) o.material.dispose(); });
    }
  }
  function makePin(site, sp, delay) {
    var col = new THREE.Color(YCOL[site.Tahun]);
    var mat = new THREE.MeshStandardMaterial({ color: col, roughness: 0.38, metalness: 0.05, emissive: col, emissiveIntensity: 0.18 });
    var h = sp * 3.4, g = new THREE.Group();
    var stem = new THREE.Mesh(coneGeo, mat); stem.scale.set(sp * 0.85, h, sp * 0.85); stem.position.y = h / 2;
    var head = new THREE.Mesh(sphereGeo, mat); head.scale.setScalar(sp * 1.15); head.position.y = h;
    stem.castShadow = head.castShadow = true;
    g.add(stem); g.add(head);
    g.position.set(wx(site.c[0]), PIN_Y, wz(site.c[1]));
    g.scale.setScalar(0.001);
    g.userData = { site: site, t0: performance.now() + delay, s: 1, sTarget: 1 };
    return g;
  }
  function buildPins(list) {
    clearGroup(pinsGroup);
    var sp = pinSize;
    list.forEach(function (s, i) { pinsGroup.add(makePin(s, sp, Math.min(900, i * 12))); });
  }

  function clearPoly() { clearGroup(polyGroup); pulse = null; }
  function showPoly(site) {   // selected-site marker: pulsing ring around the pin
    clearPoly();
    var col = new THREE.Color(YCOL[site.Tahun]);
    var ring = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.8, side: THREE.DoubleSide, depthWrite: false }));
    ring.position.set(wx(site.c[0]), PIN_Y + 0.02, wz(site.c[1]));
    polyGroup.add(ring);
    pulse = { mesh: ring, base: pinSize * 2.4 };
  }

  /* ---------------- kamera ---------------- */
  var fly = null;
  function flyTo(pos, tgt, dur) {
    fly = { t0: performance.now(), dur: dur || 1100, p0: camera.position.clone(), g0: controls.target.clone(), p1: pos, g1: tgt };
  }
  controls.addEventListener('start', function () { fly = null; });
  function stepFly(now) {
    if (!fly) return;
    var k = Math.min(1, (now - fly.t0) / fly.dur);
    var e = k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
    camera.position.lerpVectors(fly.p0, fly.p1, e);
    controls.target.lerpVectors(fly.g0, fly.g1, e);
    if (k >= 1) fly = null;
  }
  function aspect() { return window.innerWidth / Math.max(1, window.innerHeight); }
  function homeView() {
    var f = Math.max(1, 1.78 / aspect());
    return { pos: new THREE.Vector3(-3 * f, 36 * f, 36 * f), tgt: new THREE.Vector3(0, 0, 0) };
  }
  function viewFor(cx, cz, extent, dirY, dirZ) {
    var dist = extent / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)));
    dist = Math.max(dist, 1.2) * Math.max(1, 1.5 / aspect());
    var vw = 2 * dist * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * aspect();
    var shift = window.innerWidth > 820 ? vw * 0.1 : 0;       // leave room for the right-hand panel
    var tgt = new THREE.Vector3(cx + shift, PIN_Y, cz);
    var n = new THREE.Vector3(0, dirY, dirZ).normalize();
    return { pos: tgt.clone().addScaledVector(n, dist), tgt: tgt };
  }
  function fitProvince(p) {
    var list = filtered().filter(function (s) { return s.Provinsi === p.name; });
    var minx = 1e9, maxx = -1e9, minz = 1e9, maxz = -1e9;
    if (!list.length) { minx = p.cx - p.w / 2; maxx = p.cx + p.w / 2; minz = p.cz - p.d / 2; maxz = p.cz + p.d / 2; }
    list.forEach(function (s) { var x = wx(s.c[0]), z = wz(s.c[1]); minx = Math.min(minx, x); maxx = Math.max(maxx, x); minz = Math.min(minz, z); maxz = Math.max(maxz, z); });
    var extent = Math.max(maxx - minx, (maxz - minz) * 1.4) * 1.5 + 1.4;
    pinSize = Math.max(0.035, Math.min(0.2, extent * 0.009));
    return viewFor((minx + maxx) / 2, (maxz + minz) / 2, extent, 0.8, 0.7);
  }

  /* ---------------- UI ---------------- */
  var elJudul = $('#judul'), elKpi = $('#kpi'), elDaftar = $('#daftar'), elLegenda = $('#legenda'), elDetail = $('#detail'), elTahun = $('#tahun');

  function renderTahun() {
    var items = [{ y: null, t: 'All' }].concat(YEARS.map(function (y) { return { y: y, t: String(y) }; }));
    elTahun.innerHTML = items.map(function (it) {
      return '<button type="button" role="tab" data-y="' + (it.y || '') + '" aria-selected="' + (state.year === it.y) + '">' + it.t + '</button>';
    }).join('');
  }
  elTahun.addEventListener('click', function (e) {
    var b = e.target.closest('button'); if (!b) return;
    setYear(b.dataset.y ? +b.dataset.y : null);
  });

  function renderJudul() {
    var rng = state.year ? 'Planting year ' + state.year : 'Planting years 2020–2023';
    if (state.view === 'peta') {
      elJudul.innerHTML = '<span class="pill">KKP · Mangrove Rehabilitation · 2020–2023</span>' +
        '<h1>Mangrove Planting<br>Map of Indonesia</h1>' +
        '<p class="sub">The height of each province shows the total mangrove seedlings planted. Hover for a summary, click a province to see the planting site locations.</p>';
    } else {
      var s = state.prov.stat;
      elJudul.innerHTML = '<div><button class="kembali" id="tbl-peta" type="button"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M19 12H5M11 6l-6 6 6 6"/></svg>Map</button><span class="pill">' + esc(rng) + '</span></div>' +
        '<h1>' + esc(state.prov.name) + '</h1>' +
        '<div class="chips"><span class="chip">' + fmt(s.n) + ' sites</span><span class="chip">' + compact(s.bibit) + ' seedlings</span><span class="chip">' + fmt(s.luas, 1) + ' ha</span></div>';
      $('#tbl-peta').addEventListener('click', showMap);
    }
  }

  function renderKpi() {
    var list = state.view === 'prov' ? filtered().filter(function (s) { return s.Provinsi === state.prov.name; }) : filtered();
    var bibit = 0, luas = 0, pv = {};
    list.forEach(function (s) { bibit += s.Jml_Bibit; luas += s.Luas; pv[s.Provinsi] = 1; });
    var third = state.view === 'prov'
      ? '<div><span class="kecil">Regencies</span><b>' + fmt(Object.keys(list.reduce(function (a, s) { a[s.Kabupaten] = 1; return a; }, {})).length) + '</b></div>'
      : '<div><span class="kecil">Provinces</span><b>' + fmt(Object.keys(pv).length) + '</b></div>';
    elKpi.innerHTML = '<div><span class="kecil">Sites</span><b>' + fmt(list.length) + '</b></div>' +
      '<div><span class="kecil">Total seedlings</span><b>' + compact(bibit, true) + '</b></div>' +
      '<div><span class="kecil">Area</span><b>' + fmt(luas, 1) + '<small>ha</small></b></div>' + third;
    elKpi.style.gridTemplateColumns = 'repeat(4,1fr)';
  }

  function renderDaftar() {
    if (state.view === 'peta') {
      var rows = provs.filter(function (p) { return p.stat.n; }).sort(function (a, b) { return b.stat.bibit - a.stat.bibit; });
      var top = rows.slice(0, 5), mx = top.length ? top[0].stat.bibit : 1;
      elDaftar.innerHTML = '<div class="kepala"><h2>Top 5 provinces</h2><span class="kecil">total seedlings · ' + rows.length + ' provinces</span></div><div id="isi">' +
        (top.length ? top.map(function (p) {
          return '<button class="baris" type="button" data-p="' + esc(p.name) + '"><div class="atas"><span>' + esc(p.name) + '</span><span>' + compact(p.stat.bibit) + '</span></div>' +
            '<div class="bawah">' + fmt(p.stat.n) + ' sites · ' + fmt(p.stat.luas, 1) + ' ha</div><div class="bar"><i style="width:' + (p.stat.bibit / mx * 100).toFixed(1) + '%"></i></div></button>';
        }).join('') : '<p class="kosong">No data for this year.</p>') + '</div>';
    } else {
      var list = filtered().filter(function (s) { return s.Provinsi === state.prov.name; })
        .sort(function (a, b) { return a.Tahun - b.Tahun || a.Kabupaten.localeCompare(b.Kabupaten) || a.Desa.localeCompare(b.Desa); });
      elDaftar.innerHTML = '<div class="kepala"><h2>Planting sites</h2><span class="kecil">' + list.length + ' sites</span></div><div id="isi">' +
        (list.length ? list.map(function (s) {
          return '<button class="baris' + (state.site === s ? ' aktif' : '') + '" type="button" data-s="' + s.id + '"><div class="atas"><span>' + esc(s.Desa) + '</span><span>' + compact(s.Jml_Bibit) + '</span></div>' +
            '<div class="bawah"><i class="titik" style="background:' + YCOL[s.Tahun] + '"></i>' + s.Tahun + ' · ' + esc(s.Kabupaten) + '</div></button>';
        }).join('') : '<p class="kosong">No planting in ' + state.year + ' in this province. Pick another year.</p>') + '</div>';
    }
  }
  elDaftar.addEventListener('click', function (e) {
    var b = e.target.closest('.baris'); if (!b) return;
    if (b.dataset.p) enterProv(byName[b.dataset.p]);
    else selectSite(SITES[+b.dataset.s]);
  });

  function renderLegenda() {
    if (state.view === 'peta') {
      elLegenda.innerHTML = '<div class="kecil">Total seedlings per province (height & color)</div><div class="skala"></div>' +
        '<div class="ujung kecil"><span>0</span><span>' + compact(maxB) + '</span></div>';
    } else {
      elLegenda.innerHTML = '<div class="kecil">Planting year</div><div>' + YEARS.map(function (y) {
        return '<span class="item"><i class="titik" style="background:' + YCOL[y] + '"></i>' + y + '</span>';
      }).join('') + '</div>';
    }
  }

  function renderDetail() {
    var s = state.site;
    if (!s) { elDetail.hidden = true; elDetail.innerHTML = ''; return; }
    elDetail.hidden = false;
    elDetail.innerHTML = '<button class="tutup" type="button" aria-label="Close">×</button>' +
      '<span class="pill" style="background:' + YCOL[s.Tahun] + ';color:' + (s.Tahun === 2021 ? '#3a2a00' : '#fff') + '">Planting year ' + s.Tahun + '</span>' +
      '<h3>' + esc(s.Desa) + ' Village</h3>' +
      '<p class="lokasi">Regency: ' + esc(s.Kabupaten) + '<br>Province: ' + esc(s.Provinsi) + (s.Kecamatan ? '<br>Subdistrict: ' + esc(s.Kecamatan) : '') + '</p>' +
      '<dl><div><dt>Seedlings planted</dt><dd class="besar">' + fmt(s.Jml_Bibit) + '</dd></div>' +
      '<div><dt>Planted area</dt><dd class="besar">' + fmt(s.Luas, 2) + ' ha</dd></div>' +
      (s.Jns_Bibit ? '<div class="lebar"><dt>Seedling species</dt><dd>' + esc(s.Jns_Bibit) + '</dd></div>' : '') +
      (s.Nama_Kel ? '<div class="lebar"><dt>Group</dt><dd>' + esc(s.Nama_Kel) + '</dd></div>' : '') +
      (s.Pola_Tanam ? '<div><dt>Planting pattern</dt><dd>' + esc(s.Pola_Tanam) + '</dd></div>' : '') +
      (s.Smbr_Anggr ? '<div><dt>Budget source</dt><dd>' + esc(s.Smbr_Anggr) + '</dd></div>' : '') +
      '</dl>';
    elDetail.querySelector('.tutup').addEventListener('click', deselectSite);
  }

  function renderAll() { renderTahun(); renderJudul(); renderKpi(); renderDaftar(); renderLegenda(); renderDetail(); }

  /* ---------------- navigasi ---------------- */
  function setYear(y) {
    state.year = y;
    updateTargets();
    if (state.view === 'prov') {
      if (state.site && y && state.site.Tahun !== y) { state.site = null; clearPoly(); }
      var v = fitProvince(state.prov);
      buildPins(filtered().filter(function (s) { return s.Provinsi === state.prov.name; }));
      if (state.site) { pinsGroup.children.forEach(function (g) { if (g.userData.site === state.site) g.userData.sTarget = 1.35; }); }
      else flyTo(v.pos, v.tgt, 900);
    }
    renderAll();
  }
  function showMap() {
    state.view = 'peta'; state.prov = null; state.site = null; state.hoverPin = null;
    clearGroup(pinsGroup); clearPoly();
    updateTargets();
    var v = homeView(); flyTo(v.pos, v.tgt, 1200);
    renderAll();
  }
  function enterProv(p) {
    if (!p) return;
    if (!p.stat.n) return;
    state.view = 'prov'; state.prov = p; state.site = null; state.hoverPin = null;
    clearPoly();
    updateTargets();
    var v = fitProvince(p);
    buildPins(filtered().filter(function (s) { return s.Provinsi === p.name; }));
    flyTo(v.pos, v.tgt, 1300);
    hideBalon();
    renderAll();
  }
  function selectSite(s) {
    if (!s) return;
    state.site = s;
    pinsGroup.children.forEach(function (g) { g.userData.sTarget = g.userData.site === s ? 1.35 : 1; });
    showPoly(s);
    var wxp = wx(s.c[0]), wzp = wz(s.c[1]);
    var v = viewFor(wxp, wzp, Math.max(pinSize * 40, 3), 0.75, 0.75);
    flyTo(v.pos, v.tgt, 1100);
    renderDaftar(); renderDetail();
    var act = elDaftar.querySelector('.baris.aktif'); if (act) act.scrollIntoView({ block: 'nearest' });
  }
  function deselectSite() {
    if (!state.site) return;
    state.site = null; clearPoly();
    pinsGroup.children.forEach(function (g) { g.userData.sTarget = 1; });
    var v = fitProvince(state.prov); flyTo(v.pos, v.tgt, 1000);
    renderDaftar(); renderDetail();
  }
  window.addEventListener('keydown', function (e) {
    if (e.key !== 'Escape') return;
    if (state.site) deselectSite(); else if (state.view === 'prov') showMap();
  });

  /* ---------------- interaksi mouse ---------------- */
  var ray = new THREE.Raycaster(), mouse = new THREE.Vector2(), mx = 0, my = 0, dirty = false, down = null;
  var balon = $('#balon');
  function hideBalon() { balon.hidden = true; }
  function showBalon(html) { balon.innerHTML = html; balon.hidden = false; balon.style.left = mx + 'px'; balon.style.top = my + 'px'; }
  function setMouse(e) {
    var r = canvas.getBoundingClientRect();
    mx = e.clientX; my = e.clientY;
    mouse.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
  }
  function pinAt() {
    ray.setFromCamera(mouse, camera);
    var hits = ray.intersectObjects(pinsGroup.children, true);
    for (var i = 0; i < hits.length; i++) { var o = hits[i].object; while (o && !o.userData.site) o = o.parent; if (o) return o; }
    return null;
  }
  function provAt() {
    ray.setFromCamera(mouse, camera);
    var hits = ray.intersectObjects(provMeshes, false);
    return hits.length ? hits[0].object.userData.prov : null;
  }
  function hover() {
    dirty = false;
    if (down) return;
    if (state.view === 'prov') {
      var g = pinAt();
      state.hoverPin = g;
      canvas.style.cursor = g ? 'pointer' : 'grab';
      if (g) {
        var s = g.userData.site;
        showBalon('<b>' + esc(s.Desa) + ' Village</b><span>' + esc(s.Kabupaten) + ' · ' + s.Tahun + '<br>' + fmt(s.Jml_Bibit) + ' seedlings</span>');
      } else hideBalon();
      return;
    }
    var p = provAt();
    state.hoverProv = p;
    canvas.style.cursor = p && p.stat.n ? 'pointer' : 'grab';
    if (p) {
      showBalon('<b>' + esc(p.name) + '</b><span>' + (p.stat.n ? fmt(p.stat.n) + ' sites · ' + compact(p.stat.bibit) + ' seedlings<br>' + fmt(p.stat.luas, 1) + ' ha · click to view sites' : 'No planting data yet') + '</span>');
    } else hideBalon();
  }
  canvas.addEventListener('pointermove', function (e) { setMouse(e); if (!dirty) { dirty = true; requestAnimationFrame(hover); } });
  canvas.addEventListener('pointerleave', function () { state.hoverProv = null; state.hoverPin = null; hideBalon(); });
  canvas.addEventListener('pointerdown', function (e) { down = { x: e.clientX, y: e.clientY }; hideBalon(); });
  canvas.addEventListener('pointerup', function (e) {
    var moved = down ? Math.hypot(e.clientX - down.x, e.clientY - down.y) : 99;
    down = null;
    if (moved > 5) return;
    setMouse(e);
    if (state.view === 'prov') {
      var g = pinAt();
      if (g) selectSite(g.userData.site);
    } else {
      var p = provAt();
      if (p && p.stat.n) enterProv(p);
    }
  });

  /* ---------------- loop ---------------- */
  var last = performance.now(), tmp = new THREE.Vector3();
  function easeOutBack(t) { var c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); }
  function frame(now) {
    var dt = Math.min(0.05, (now - last) / 1000); last = now;
    stepFly(now); controls.update();

    var kh = 1 - Math.exp(-dt * 7), kc = 1 - Math.exp(-dt * 6);
    provs.forEach(function (p) {
      var hvT = (state.view === 'peta' && state.hoverProv === p && p.stat.n) ? 1 : 0;
      p.hv += (hvT - p.hv) * kh;
      p.mesh.scale.y += (p.tH - p.mesh.scale.y) * kh;
      p.mesh.position.y = p.hv * 0.14;
      p.top.color.lerp(p.tColor, kc);
      p.side.color.copy(p.top.color).multiplyScalar(0.72);
      p.top.emissive.setRGB(0.08 * p.hv, 0.3 * p.hv, 0.17 * p.hv);
      p.side.emissive.copy(p.top.emissive);
      p.top.opacity += (p.tOp - p.top.opacity) * kh; p.side.opacity = p.top.opacity;
      if (p.label) {
        var show = state.view === 'peta' ? p.stat.n > 0 : false;
        if (!show) { p.label.style.display = 'none'; }
        else {
          tmp.set(p.ax, p.mesh.scale.y + 0.2, p.az).project(camera);
          if (tmp.z > 1) p.label.style.display = 'none';
          else {
            p.label.style.display = '';
            p.label.style.transform = 'translate(' + ((tmp.x * 0.5 + 0.5) * window.innerWidth).toFixed(1) + 'px,' + ((-tmp.y * 0.5 + 0.5) * window.innerHeight).toFixed(1) + 'px) translate(-50%,-100%)';
            var full = p.stat.bibit >= 0.12 * maxB || state.hoverProv === p, key = p.stat.n + (full ? 'f' : 'c');
            if (p.label._t !== key) { p.label._t = key; p.label.innerHTML = full ? esc(p.name) + '<b>' + p.stat.n + '</b>' : '<b style="margin:0">' + p.stat.n + '</b>'; }
          }
        }
      }
    });
    pinsGroup.children.forEach(function (g) {
      var u = g.userData, k = Math.max(0, Math.min(1, (now - u.t0) / 450));
      var hv = state.hoverPin === g ? 1.25 : 1;
      u.s += (Math.max(u.sTarget, hv) - u.s) * kh;
      g.scale.setScalar(Math.max(0.001, easeOutBack(k) * u.s));
    });
    if (pulse) {
      var t = (now % 1600) / 1600;
      var sc = pulse.base * (0.8 + t * 1.4);
      pulse.mesh.scale.set(sc, 1, sc); pulse.mesh.material.opacity = 0.85 * (1 - t);
    }
    renderer.render(scene, camera);
    requestAnimationFrame(frame);
  }

  function resize() {
    var w = window.innerWidth, h = window.innerHeight;
    renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix();
  }
  window.addEventListener('resize', function () { resize(); if (state.view === 'peta' && !fly) { var v = homeView(); camera.position.copy(v.pos); controls.target.copy(v.tgt); } });

  /* ---------------- mulai ---------------- */
  resize();
  var hv = homeView(); camera.position.set(hv.pos.x, hv.pos.y * 1.3, hv.pos.z * 1.1); controls.target.copy(hv.tgt); controls.update();
  updateTargets(); renderAll();
  flyTo(hv.pos, hv.tgt, 1600);
  requestAnimationFrame(frame);
  $('#panggung').classList.remove('memuat');

  // deep link, e.g. #prov=Jawa%20Timur&year=2021&site=12
  (function () {
    var h = {}; location.hash.replace(/^#/, '').split('&').forEach(function (kv) { var a = kv.split('='); if (a[0]) h[a[0]] = decodeURIComponent(a[1] || ''); });
    if (h.year) setYear(+h.year);
    if (h.prov && byName[h.prov]) enterProv(byName[h.prov]);
    if (h.site && SITES[+h.site]) selectSite(SITES[+h.site]);
    if (h.snap) {   // jump straight to the end state (for testing / screenshots)
      if (fly) { camera.position.copy(fly.p1); controls.target.copy(fly.g1); fly = null; }
      provs.forEach(function (p) { p.mesh.scale.y = p.tH; p.top.color.copy(p.tColor); p.top.opacity = p.tOp; });
      pinsGroup.children.forEach(function (g) { g.userData.t0 = 0; g.userData.s = g.userData.sTarget; });
    }
  })();
})();
