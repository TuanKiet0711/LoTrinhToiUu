// wwwroot/js/Index.js  —  FULL DROP-IN REPLACEMENT

// ==== Khởi tạo bản đồ
const map = L.map('map', { zoomControl: false }).setView([10.7769, 106.7008], 14);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: "&copy; OpenStreetMap" }).addTo(map);

// Đặt lại zoom control sang góc phải trên
L.control.zoom({ position: 'topright' }).addTo(map);

// Nhận dữ liệu đã inject từ Razor (nếu có), fallback mảng rỗng
const data = Array.isArray(window.__ATTRACTIONS__) ? window.__ATTRACTIONS__ : [];

let routeLayer = null;
const coords = [];            // waypoints (điểm dừng) theo thứ tự thêm
let origin = null;            // [lng, lat] điểm xuất phát
let originMarker = null;      // marker xuất phát

// ==== Icon theo tên địa điểm (có thể mở rộng dễ dàng)
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

function pickEmoji(name) {
    const n = (name || "").toString();
    for (const r of iconRules) { if (r.key.test(n)) return r.emoji; }
    return "📍";
}
function getPoiIcon(name) {
    const glyph = pickEmoji(name);
    return L.divIcon({
        className: 'poi-marker',
        html: `<span class="dot"></span><span class="glyph" aria-hidden="true">${glyph}</span>`,
        iconSize: [32, 32], iconAnchor: [16, 32], popupAnchor: [0, -28]
    });
}

// ==== Icon xe buýt cho điểm xuất phát
const busIcon = L.divIcon({
    className: 'poi-marker start-marker',
    html: `<span class="dot"></span><span class="glyph" aria-hidden="true">🚌</span>`,
    iconSize: [32, 32], iconAnchor: [16, 32], popupAnchor: [0, -28]
});

// ==== Toast & Loading
const toastEl = document.getElementById('toast'), loadingEl = document.getElementById('loading');
const toast = (m, t = 'info') => {
    toastEl.style.background = t === 'ok' ? '#16a34a' : (t === 'warn' ? '#f59e0b' : (t === 'err' ? '#ef4444' : '#0ea5e9'));
    toastEl.textContent = m; toastEl.style.display = 'block';
    setTimeout(() => toastEl.style.display = 'none', 2400);
};
const loading = (b) => loadingEl.style.display = b ? 'flex' : 'none';

// ==== Reverse Geocode & Geocode (Nominatim)
// Nếu bạn có proxy server: thay URL tương ứng /api/geocode/reverse và /api/geocode/search
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
    // Map -> {lat,lng,label}
    return (j || []).map(f => ({ lat: Number(f.lat), lng: Number(f.lon), label: f.display_name || query }));
}

// ==== Đặt/Update điểm xuất phát
async function setOrigin(lng, lat, label = '') {
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

// ==== Helpers public cho popup/list
window.focusHere = (lat, lng) => map.setView([lat, lng], 17, { animate: true });
window.addStop = (lng, lat, name) => { coords.push([lng, lat]); toast(`Đã thêm: ${name}`, 'ok'); };
window.setStartHere = (lng, lat, label) => setOrigin(lng, lat, label || '');

// ==== Render các điểm từ Model (nếu có) — marker + popup
if (data.length) {
    data.forEach(p => {
        const lat = Number(p.Lat), lng = Number(p.Lng), name = p.Ten || '', addr = p.DiaChi || '';
        const safe = (name + "").replace(/["'<>&]/g, '');
        L.marker([lat, lng], { icon: getPoiIcon(name) }).addTo(map).bindPopup(
            `<b>${safe}</b><br /><small>${addr}</small><br />
       <div style="margin-top:6px; display:flex; gap:6px; flex-wrap:wrap">
         <button class="btn btn-primary" style="padding:6px 10px" onclick="addStop(${lng},${lat},'${safe}')">➕ Thêm điểm này</button>
         <button class="btn" style="padding:6px 10px" onclick="setStartHere(${lng},${lat},'${addr.replace(/["'<>&]/g, '')}')">🚌 Xuất phát từ đây</button>
         <button class="btn" style="padding:6px 10px" onclick="focusHere(${lat},${lng})">🎯 Xem gần</button>
       </div>`
        );
    });
}

// ==== Right-click (desktop) & Long-press (mobile) để đặt xuất phát
map.on('contextmenu', async (e) => {
    const { lat, lng } = e.latlng;
    const rev = await reverseGeocode(lng, lat);
    setOrigin(lng, lat, rev?.label || '');
});
let pressTimer = null;
const LONG_MS = 500;
const container = map.getContainer();
function startLongPress(clientX, clientY) {
    const pt = map.mouseEventToContainerPoint({ clientX, clientY });
    pressTimer = setTimeout(async () => {
        const ll = map.containerPointToLatLng(pt);
        const rev = await reverseGeocode(ll.lng, ll.lat);
        setOrigin(ll.lng, ll.lat, rev?.label || '');
    }, LONG_MS);
}
function cancelLongPress() { if (pressTimer) { clearTimeout(pressTimer); pressTimer = null; } }
container.addEventListener('touchstart', (e) => { if (e.touches?.[0]) startLongPress(e.touches[0].clientX, e.touches[0].clientY); });
container.addEventListener('touchend', cancelLongPress);
container.addEventListener('touchmove', cancelLongPress);

// ==== Đặt vị trí xuất phát từ vị trí hiện tại (nút 📍)
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

// ==== Xoá tuyến
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

// ==== Render hướng dẫn
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

// ==== Vẽ tuyến
function drawRoute(geometry) {
    if (routeLayer) map.removeLayer(routeLayer);
    routeLayer = L.geoJSON(geometry, {
        style: { color: '#0ea5e9', weight: 6, opacity: .95, lineJoin: 'round', lineCap: 'round', className: 'route-line' }
    }).addTo(map);
    map.fitBounds(routeLayer.getBounds(), { padding: [24, 24] });
}

// ==== Tính đường theo thứ tự đã chọn
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

// ==== Tối ưu thứ tự điểm rồi vẽ
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

// ==== Nạp danh sách danh thắng từ API và gắn icon theo tên (kèm nút đặt xuất phát)
document.addEventListener("DOMContentLoaded", () => {
    fetch('/api/attractions')
        .then(r => { if (!r.ok) throw new Error("Lỗi khi gọi API"); return r.json(); })
        .then(items => {
            const list = document.getElementById("list");
            if (!Array.isArray(items) || items.length === 0) { list.innerHTML = `<div class="poi">Không có dữ liệu danh thắng.</div>`; return; }
            list.innerHTML = "";
            items.forEach(p => {
                const safeName = (p.ten || '').replace(/["'<>&]/g, '');
                const safeAddr = (p.diaChi || '').replace(/["'<>&]/g, '');
                const item = document.createElement('div'); item.className = 'poi';
                item.innerHTML = `
          <b>${safeName}</b>
          <div style="color:#64748b">${safeAddr}</div>
          <div style="margin-top:8px; display:flex; gap:8px; flex-wrap:wrap">
            <button class="btn btn-primary" style="padding:6px 10px"
              data-lat="${p.lat}" data-lng="${p.lng}"
              onclick="addStop(${p.lng},${p.lat},'${safeName}')">➕ Thêm vào tuyến</button>
            <button class="btn" style="padding:6px 10px"
              data-lat="${p.lat}" data-lng="${p.lng}"
              onclick="setStartHere(${p.lng},${p.lat},'${safeAddr}')">🚌 Đặt làm xuất phát</button>
            <button class="btn" style="padding:6px 10px"
              data-lat="${p.lat}" data-lng="${p.lng}"
              onclick="focusHere(${p.lat},${p.lng})">🎯 Xem trên bản đồ</button>
          </div>`;

                list.appendChild(item);

                L.marker([p.lat, p.lng], { icon: getPoiIcon(p.ten) }).addTo(map).bindPopup(
                    `<b>${safeName}</b><br><small>${safeAddr}</small><br/>
           <div style="margin-top:6px; display:flex; gap:6px; flex-wrap:wrap">
             <button class="btn btn-primary" style="padding:6px 10px"
               onclick="addStop(${p.lng},${p.lat},'${safeName}')">➕ Thêm điểm này</button>
             <button class="btn" style="padding:6px 10px"
               onclick="setStartHere(${p.lng},${p.lat},'${safeAddr}')">🚌 Xuất phát từ đây</button>
           </div>`
                );
            });
        })
        .catch(err => {
            document.getElementById("list").innerHTML =
                `<div class="poi" style="color:#b91c1c;background:#fef2f2;border-color:#fee2e2">Không tải được danh sách.</div>`;
            console.error(err);
        });
});

// ==== Tìm kiếm danh thắng + Autocomplete đặt xuất phát
const searchBox = document.getElementById("searchBox");
let acWrap = null, acTimer = null;
function clearAC() { if (acWrap) { acWrap.remove(); acWrap = null; } }

if (searchBox) {
    // Lọc trong danh sách đang có (giữ logic cũ) + Autocomplete Nominatim
    searchBox.addEventListener("input", () => {
        const term = searchBox.value.trim().toLowerCase();

        // Filter list
        const list = document.getElementById("list");
        const pois = list.querySelectorAll(".poi");
        pois.forEach(poi => {
            const name = poi.querySelector("b")?.textContent.toLowerCase() || "";
            const addr = poi.querySelector("div")?.textContent.toLowerCase() || "";
            const match = name.includes(term) || addr.includes(term);
            poi.style.display = term ? (match ? "block" : "none") : "block";
            const b = poi.querySelector("b");
            if (!b) return;
            if (match && term) {
                b.innerHTML = b.textContent.replace(new RegExp(`(${term})`, "gi"), "<mark>$1</mark>");
            } else {
                b.innerHTML = b.textContent;
            }
        });

        // Autocomplete: debounce 250ms
        clearTimeout(acTimer);
        if (!term) { clearAC(); return; }
        acTimer = setTimeout(async () => {
            try {
                const results = await geocode(term);
                // render dropdown
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
                acWrap.innerHTML = '';
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

    // đóng dropdown khi blur
    document.addEventListener('click', (ev) => {
        if (acWrap && ev.target !== searchBox && !acWrap.contains(ev.target)) clearAC();
    });
}

// ==== Toggle Dark/Light mode
const btnTheme = document.getElementById("btnTheme");
let lightLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: "&copy; OpenStreetMap" });
let darkLayer = L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', { maxZoom: 19, attribution: "&copy; <a href='https://carto.com/'>CARTO</a>" });
map.addLayer(lightLayer);

if (btnTheme) {
    btnTheme.onclick = () => {
        document.body.classList.toggle("dark");
        if (document.body.classList.contains("dark")) {
            if (map.hasLayer(lightLayer)) map.removeLayer(lightLayer);
            map.addLayer(darkLayer);
            btnTheme.textContent = "☀️ Light";
        } else {
            if (map.hasLayer(darkLayer)) map.removeLayer(darkLayer);
            map.addLayer(lightLayer);
            btnTheme.textContent = "🌙 Dark";
        }
    };
}
