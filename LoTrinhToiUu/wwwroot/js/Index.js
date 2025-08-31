// ==== MAP INIT (only themable layers, no duplicate base) ====
const map = L.map('map', { zoomControl: false }).setView([10.7769, 106.7008], 14);

const lightLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  maxZoom: 19, attribution: "&copy; OpenStreetMap"
});
const darkLayer  = L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
  maxZoom: 19, attribution: "&copy; <a href='https://carto.com/'>CARTO</a>"
});

// default light
lightLayer.addTo(map);

// Zoom control top-right
L.control.zoom({ position: 'topright' }).addTo(map);

// ==== DATA SOURCE ====
const injected = Array.isArray(window.__ATTRACTIONS__) ? window.__ATTRACTIONS__ : null;

// ==== STATE ====
let routeLayer = null;
const coords = [];                 // waypoints [lng,lat]
let origin = null;                 // [lng,lat]
let originMarker = null;

// ==== ICONS ====
const iconRules = [
  { key: /chùa|thiền viện|tịnh xá|chánh điện/i, emoji: "🛕" },
  { key: /nhà\s*thờ|vương cung|giáo xứ/i, emoji: "⛪" },
  { key: /bảo tàng|bảo tàng viện|museum/i, emoji: "🏛️" },
  { key: /công viên|park|thảo cầm viên/i, emoji: "🌳" },
  { key: /biển|bãi biển|hòn|đảo/i, emoji: "🏖️" },
  { key: /núi|đèo|đồi|cao điểm/i, emoji: "⛰️" },
  { key: /hồ|lake|đầm|suối/i, emoji: "🏞️" },
  { key: /chợ|market/i, emoji: "🛍️" },
  { key: /phố đi bộ|walking street/i, emoji: "🚶" },
  { key: /sân vận động|stadium/i, emoji: "🏟️" },
  { key: /cầu|bridge/i, emoji: "🌉" },
  { key: /nhà hát|opera|kịch|ca múa nhạc/i, emoji: "🎭" },
  { key: /quảng trường|square/i, emoji: "🧭" },
  { key: /địa đạo|hầm/i, emoji: "🪖" },
  { key: /tháp|tower|lầu/i, emoji: "🗼" }
];
const pickEmoji = (name="") => (iconRules.find(r => r.key.test(name))?.emoji) || "📍";
const getPoiIcon = (name) => L.divIcon({
  className: 'poi-marker',
  html: `<span class="dot"></span><span class="glyph" aria-hidden="true">${pickEmoji(name)}</span>`,
  iconSize: [32,32], iconAnchor: [16,32], popupAnchor: [0,-28]
});
const busIcon = L.divIcon({
  className: 'poi-marker start-marker',
  html: `<span class="dot"></span><span class="glyph" aria-hidden="true">🚌</span>`,
  iconSize: [32,32], iconAnchor: [16,32], popupAnchor: [0,-28]
});

// ==== UI HELPERS ====
const $toast = document.getElementById('toast');
const $loading = document.getElementById('loading');
const toast = (m, t='info') => {
  $toast.style.background = t==='ok' ? '#16a34a' : t==='warn' ? '#f59e0b' : t==='err' ? '#ef4444' : '#0ea5e9';
  $toast.textContent = m; $toast.style.display = 'block';
  setTimeout(() => $toast.style.display = 'none', 2400);
};
const loading = (b) => { if ($loading) $loading.style.display = b ? 'flex' : 'none'; };

// ==== GEOCODING ====
async function reverseGeocode(lng, lat) {
  try {
    const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&accept-language=vi`;
    const r = await fetch(url, { headers: { 'Accept': 'application/json' } });
    const j = await r.json();
    return { name: j.name || j.display_name || 'Điểm trên bản đồ', label: j.display_name || '' };
  } catch { return null; }
}
async function geocode(query) {
  const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&accept-language=vi&limit=8`;
  const r = await fetch(url, { headers: { 'Accept': 'application/json' } });
  const j = await r.json();
  return (j || []).map(f => ({ lat: +f.lat, lng: +f.lon, label: f.display_name || query }));
}

// ==== ORIGIN SET/UPDATE ====
async function setOrigin(lng, lat, label='') {
  origin = [lng, lat];
  if (!originMarker) {
    originMarker = L.marker([lat, lng], { icon: busIcon, draggable: true }).addTo(map);
    originMarker.on('dragend', async (e) => {
      const ll = e.target.getLatLng();
      origin = [ll.lng, ll.lat];
      const rev = await reverseGeocode(ll.lng, ll.lat);
      originMarker.bindPopup(`🚌 Điểm xuất phát<br><small>${rev?.label || ''}</small>`).openPopup();
      toast('Đã cập nhật điểm xuất phát.', 'ok');
    });
  } else {
    originMarker.setLatLng([lat, lng]);
  }
  const rev = label ? { label } : await reverseGeocode(lng, lat);
  originMarker.bindPopup(`🚌 Điểm xuất phát<br><small>${rev?.label || ''}</small>`).openPopup();
  map.setView([lat, lng], 15, { animate: true });
  toast('Đã đặt điểm xuất phát.', 'ok');
}

// ==== GLOBAL HELPERS FOR POPUP BUTTONS ====
window.focusHere   = (lat,lng) => map.setView([lat,lng], 17, { animate: true });
window.addStop     = (lng,lat,name) => { coords.push([lng,lat]); toast(`Đã thêm: ${name}`,'ok'); };
window.setStartHere= (lng,lat,label) => setOrigin(lng,lat,label||'');

// ==== RENDER LIST + MARKERS (single source) ====
function renderAttractions(items) {
  const list = document.getElementById("list");
  if (!Array.isArray(items) || items.length===0) {
    if (list) list.innerHTML = `<div class="poi">Không có dữ liệu danh thắng.</div>`;
    return;
  }
  if (list) list.innerHTML = "";
  const bounds = L.latLngBounds();

  items.forEach(p => {
    // server có thể dùng tên field khác nhau (p.Lat vs p.lat)
    const lat = Number(p.lat ?? p.Lat);
    const lng = Number(p.lng ?? p.Lng);
    const name= (p.ten ?? p.Ten ?? '').toString();
    const addr= (p.diaChi ?? p.DiaChi ?? '').toString();
    bounds.extend([lat,lng]);

    // list item
    if (list) {
      const safeName = name.replace(/["'<>&]/g,'');
      const safeAddr = addr.replace(/["'<>&]/g,'');
      const item = document.createElement('div'); item.className = 'poi';
      item.innerHTML = `
        <b>${safeName}</b>
        <div style="color:#64748b">${safeAddr}</div>
        <div style="margin-top:8px; display:flex; gap:8px; flex-wrap:wrap">
          <button class="btn btn-primary" style="padding:6px 10px"
            onclick="addStop(${lng},${lat},'${safeName}')">➕ Thêm vào tuyến</button>
          <button class="btn" style="padding:6px 10px"
            onclick="setStartHere(${lng},${lat},'${safeAddr}')">🚌 Đặt làm xuất phát</button>
          <button class="btn" style="padding:6px 10px"
            onclick="focusHere(${lat},${lng})">🎯 Xem trên bản đồ</button>
        </div>`;
      list.appendChild(item);
    }

    // marker + popup
    L.marker([lat, lng], { icon: getPoiIcon(name) }).addTo(map).bindPopup(
      `<b>${name.replace(/["'<>&]/g,'')}</b><br><small>${addr.replace(/["'<>&]/g,'')}</small><br/>
       <div style="margin-top:6px; display:flex; gap:6px; flex-wrap:wrap">
         <button class="btn btn-primary" style="padding:6px 10px"
           onclick="addStop(${lng},${lat},'${name.replace(/["'<>&]/g,'')}')">➕ Thêm điểm này</button>
         <button class="btn" style="padding:6px 10px"
           onclick="setStartHere(${lng},${lat},'${addr.replace(/["'<>&]/g,'')}')">🚌 Xuất phát từ đây</button>
       </div>`
    );
  });

  if (bounds.isValid()) map.fitBounds(bounds.pad(0.15));
}

async function initAttractions() {
  if (injected && injected.length) {
    renderAttractions(injected);
  } else {
    try {
      const r = await fetch('/api/attractions');
      if (!r.ok) throw new Error('API lỗi');
      const items = await r.json();
      renderAttractions(items);
    } catch (e) {
      const list = document.getElementById("list");
      if (list)
        list.innerHTML = `<div class="poi" style="color:#b91c1c;background:#fef2f2;border-color:#fee2e2">Không tải được danh sách.</div>`;
      console.error(e);
    }
  }
}
document.addEventListener('DOMContentLoaded', initAttractions);

// ==== CONTEXT MENU (desktop) → set start
map.on('contextmenu', async (e) => {
  const { lat, lng } = e.latlng;
  const rev = await reverseGeocode(lng, lat);
  setOrigin(lng, lat, rev?.label || '');
});

// ==== LONG PRESS (mobile) → set start
let longTimer = null;
const LONG_MS = 500;
map.on('touchstart', (e) => {
  if (!e?.latlng) return;
  longTimer = setTimeout(async () => {
    const { lat, lng } = e.latlng;
    const rev = await reverseGeocode(lng, lat);
    setOrigin(lng, lat, rev?.label || '');
  }, LONG_MS);
});
map.on('touchend', () => { if (longTimer) { clearTimeout(longTimer); longTimer=null; } });
map.on('touchmove', () => { if (longTimer) { clearTimeout(longTimer); longTimer=null; } });

// ==== CURRENT LOCATION BUTTON
const btnUseMyLoc = document.getElementById('btnUseMyLoc');
if (btnUseMyLoc) {
  btnUseMyLoc.onclick = () => {
    if (!navigator.geolocation) return toast("Trình duyệt không hỗ trợ định vị.", 'warn');
    navigator.geolocation.getCurrentPosition(async (pos) => {
      const { latitude, longitude } = pos.coords;
      await setOrigin(longitude, latitude);
    }, () => toast("Không lấy được vị trí.", 'err'), { enableHighAccuracy: true, timeout: 8000 });
  };
}

// ==== CLEAR
const btnClear = document.getElementById('btnClear');
if (btnClear) {
  btnClear.onclick = () => {
    if (routeLayer) { map.removeLayer(routeLayer); routeLayer = null; }
    coords.length = 0; origin = null;
    if (originMarker) { map.removeLayer(originMarker); originMarker = null; }
    document.getElementById('steps').innerHTML = `<div class="step">Đã xoá tuyến. Hãy chọn lại điểm.</div>`;
    toast("Đã xoá tuyến.", 'warn');
  };
}

// ==== STEPS RENDER
function renderSteps(steps) {
  const box = document.getElementById('steps');
  if (!steps?.length) { box.innerHTML = `<div class="step">Không có hướng dẫn.</div>`; return; }
  const wrap = document.createElement('div'); wrap.className = 'steps';
  steps.forEach((s, i) => {
    const d = Math.round(s.distance || 0), m = Math.round((s.duration || 0) / 60);
    const el = document.createElement('div'); el.className = 'step';
    el.innerHTML = `<b>${i + 1}. ${s.instruction || s.type || 'Bước'}</b><br>
      <small>${d ? d + ' m' : ''}${d && m ? ' · ' : ''}${m ? '~' + m + ' phút' : ''}</small>`;
    wrap.appendChild(el);
  });
  box.innerHTML = ''; box.appendChild(wrap);
}

// ==== DRAW ROUTE
function drawRoute(geometry) {
  if (routeLayer) map.removeLayer(routeLayer);
  routeLayer = L.geoJSON(geometry, {
    style: { color: '#0ea5e9', weight: 6, opacity: .95, lineJoin: 'round', lineCap: 'round', className: 'route-line' }
  }).addTo(map);
  map.fitBounds(routeLayer.getBounds(), { padding: [24, 24] });
}

// ==== ROUTE (ordered)
const btnRoute = document.getElementById('btnRoute');
if (btnRoute) {
  btnRoute.onclick = async () => {
    const points = [];
    if (origin) points.push(origin);
    if (coords.length === 0) return toast("Chọn ít nhất 1 điểm.", 'warn');
    coords.forEach(c => points.push(c));

    loading(true);
    try {
      const res = await fetch('/api/coach-route', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          coords: points,
          vehicle: { weightTons: 15, height: 3.5, width: 2.5, length: 12 },
          avoidSmallRoads: true
        })
      });
      if (!res.ok) { toast("Không tính được tuyến.", 'err'); console.error(await res.text()); return; }
      const json = await res.json(); const feat = json?.features?.[0];
      if (!feat) { toast("Không có kết quả.", 'warn'); return; }
      drawRoute(feat.geometry);
      renderSteps(feat.properties?.segments?.[0]?.steps ?? []);
      toast("Đã tính xong tuyến!", 'ok');
    } finally { loading(false); }
  };
}

// ==== OPTIMIZE then DRAW
const btnOptimal = document.getElementById('btnOptimal');
if (btnOptimal) {
  btnOptimal.onclick = async () => {
    const points = [];
    if (origin) points.push(origin);
    if (coords.length === 0) return toast("Chọn ít nhất 1 điểm.", 'warn');
    coords.forEach(c => points.push(c));

    loading(true);
    try {
      const res = await fetch('/api/coach-route-optimal', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ coords: points })
      });
      if (!res.ok) { toast("Không tối ưu được tuyến.", 'err'); console.error(await res.text()); return; }
      const json = await res.json(); const route = json?.routes?.[0];
      if (!route) { toast("Không có kết quả.", 'warn'); return; }

      const steps = route.steps ?? [];
      const ordered = steps.map(s => s.location);
      document.getElementById('steps').innerHTML =
        `<div class="steps">` + steps.map((s, idx) => {
          const label = s.type === 'start' ? 'Xuất phát' : (s.type === 'end' ? 'Kết thúc' : `Điểm ${s.id ?? (idx + 1)}`);
          return `<div class="step"><b>${idx + 1}. ${label}</b></div>`;
        }).join('') + `</div>`;

      const dirRes = await fetch('/api/coach-route', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          coords: ordered,
          vehicle: { weightTons: 15, height: 3.5, width: 2.5, length: 12 }
        })
      });
      if (!dirRes.ok) { toast("Không vẽ được tuyến tối ưu.", 'err'); console.error(await dirRes.text()); return; }
      const dirJson = await dirRes.json(); const feat2 = dirJson?.features?.[0];
      if (feat2) drawRoute(feat2.geometry);
      toast("Đã tối ưu & vẽ tuyến!", 'ok');
    } finally { loading(false); }
  };
}

// ==== SEARCH BOX (local filter + global autocomplete) ====
const searchBox = document.getElementById("searchBox");
let acWrap = null, acTimer = null;
const clearAC = () => { if (acWrap) { acWrap.remove(); acWrap=null; } };

if (searchBox) {
  searchBox.addEventListener("input", () => {
    const term = searchBox.value.trim().toLowerCase();

    // filter local list
    const list = document.getElementById("list");
    if (list) {
      const pois = list.querySelectorAll(".poi");
      pois.forEach(poi => {
        const name = poi.querySelector("b")?.textContent.toLowerCase() || "";
        const addr = poi.querySelector("div")?.textContent.toLowerCase() || "";
        const match = name.includes(term) || addr.includes(term);
        poi.style.display = term ? (match ? "block" : "none") : "block";
        const b = poi.querySelector("b");
        if (!b) return;
        if (match && term) b.innerHTML = b.textContent.replace(new RegExp(`(${term})`, "gi"), "<mark>$1</mark>");
        else b.innerHTML = b.textContent;
      });
    }

    // autocomplete (global)
    clearTimeout(acTimer);
    if (!term) { clearAC(); return; }
    acTimer = setTimeout(async () => {
      try {
        const results = await geocode(term);
        if (!acWrap) {
          acWrap = document.createElement('div');
          acWrap.id = 'ac';
          acWrap.style.position = 'absolute';
          acWrap.style.zIndex = 1001;
          acWrap.style.background = '#fff';
          acWrap.style.border = '1px solid rgba(2,6,23,.15)';
          acWrap.style.borderRadius = '8px';
          acWrap.style.boxShadow = '0 8px 24px rgba(2,6,23,.10)';
          acWrap.style.marginTop = '6px';
          acWrap.style.padding = '4px';
          acWrap.style.width = searchBox.offsetWidth + 'px';
          searchBox.parentNode.appendChild(acWrap);
        } else {
          acWrap.innerHTML = '';
        }
        results.forEach(r => {
          const item = document.createElement('div');
          item.style.padding = '8px 10px';
          item.style.cursor = 'pointer';
          item.textContent = r.label;
          item.onclick = async () => {
            await setOrigin(r.lng, r.lat, r.label);
            searchBox.value = r.label;
            clearAC();
          };
          acWrap.appendChild(item);
        });
      } catch (e) { console.error(e); }
    }, 250);
  });

  document.addEventListener('click', (ev) => {
    if (acWrap && ev.target !== searchBox && !acWrap.contains(ev.target)) clearAC();
  });
}

// ==== THEME TOGGLE ====
const btnTheme = document.getElementById("btnTheme");
if (btnTheme) {
  btnTheme.onclick = () => {
    document.body.classList.toggle("dark");
    if (document.body.classList.contains("dark")) {
      if (map.hasLayer(lightLayer)) map.removeLayer(lightLayer);
      if (!map.hasLayer(darkLayer)) map.addLayer(darkLayer);
      btnTheme.textContent = "☀️ Light";
    } else {
      if (map.hasLayer(darkLayer)) map.removeLayer(darkLayer);
      if (!map.hasLayer(lightLayer)) map.addLayer(lightLayer);
      btnTheme.textContent = "🌙 Dark";
    }
  };
}
