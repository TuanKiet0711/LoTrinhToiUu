// ==== Khởi tạo bản đồ
const map = L.map('map', { zoomControl: true }).setView([10.7769, 106.7008], 14);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: "&copy; OpenStreetMap" }).addTo(map);

// Nhận dữ liệu đã inject từ Razor (nếu có), fallback mảng rỗng
const data = Array.isArray(window.__ATTRACTIONS__) ? window.__ATTRACTIONS__ : [];

let routeLayer = null; const coords = []; let origin = null;

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

const toastEl = document.getElementById('toast'), loadingEl = document.getElementById('loading');
const toast = (m, t = 'info') => {
    toastEl.style.background = t === 'ok' ? '#16a34a' : (t === 'warn' ? '#f59e0b' : (t === 'err' ? '#ef4444' : '#0ea5e9'));
    toastEl.textContent = m; toastEl.style.display = 'block';
    setTimeout(() => toastEl.style.display = 'none', 2400);
};
const loading = (b) => loadingEl.style.display = b ? 'flex' : 'none';

// ==== Render các điểm từ Model (nếu có)
if (data.length) {
    data.forEach(p => {
        const lat = Number(p.Lat), lng = Number(p.Lng), name = p.Ten || '', addr = p.DiaChi || '';
        const safe = (name + "").replace(/["'<>&]/g, '');
        L.marker([lat, lng], { icon: getPoiIcon(name) }).addTo(map).bindPopup(
            `<b>${safe}</b><br /><small>${addr}</small><br />
       <div style="margin-top:6px; display:flex; gap:6px; flex-wrap:wrap">
         <button class="btn btn-primary" style="padding:6px 10px" onclick="addStop(${lng},${lat},'${safe}')">➕ Thêm điểm này</button>
         <button class="btn" style="padding:6px 10px" onclick="focusHere(${lat},${lng})">🎯 Xem gần</button>
       </div>`
        );
    });
}

// ==== Helpers
window.focusHere = (lat, lng) => map.setView([lat, lng], 17, { animate: true });
window.addStop = (lng, lat, name) => { coords.push([lng, lat]); toast(`Đã thêm: ${name}`, 'ok'); };

// ==== Đặt vị trí xuất phát (dùng icon xe buýt)
const btnUseMyLoc = document.getElementById('btnUseMyLoc');
if (btnUseMyLoc) {
    btnUseMyLoc.onclick = () => {
        if (!navigator.geolocation) return toast("Trình duyệt không hỗ trợ định vị.", 'warn');
        navigator.geolocation.getCurrentPosition(pos => {
            const { latitude, longitude } = pos.coords;
            origin = [longitude, latitude];
            L.marker([latitude, longitude], { icon: busIcon }).addTo(map).bindPopup("🚌 Điểm xuất phát (Xe du lịch)").openPopup();
            map.setView([latitude, longitude], 15, { animate: true });
            toast("Đã đặt điểm xuất phát.", 'ok');
        }, () => toast("Không lấy được vị trí.", 'err'), { enableHighAccuracy: true, timeout: 8000 });
    };
}

// ==== Xoá tuyến
const btnClear = document.getElementById('btnClear');
if (btnClear) {
    btnClear.onclick = () => {
        if (routeLayer) { map.removeLayer(routeLayer); routeLayer = null; }
        coords.length = 0; origin = null;
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
    routeLayer = L.geoJSON(geometry, { style: { color: '#0ea5e9', weight: 6, opacity: .95, lineJoin: 'round', lineCap: 'round', className: 'route-line' } }).addTo(map);
    map.fitBounds(routeLayer.getBounds(), { padding: [24, 24] });
}

// ==== Tính đường theo thứ tự đã chọn
const btnRoute = document.getElementById('btnRoute');
if (btnRoute) {
    btnRoute.onclick = async () => {
        const points = []; if (origin) points.push(origin);
        if (coords.length === 0) return toast("Chọn ít nhất 1 điểm.", 'warn');
        coords.forEach(c => points.push(c));

        loading(true);
        try {
            const res = await fetch('/api/coach-route', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ coords: points, vehicle: { weightTons: 15, height: 3.5, width: 2.5, length: 12 }, avoidSmallRoads: true })
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
        const points = []; if (origin) points.push(origin);
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

            const steps = route.steps ?? []; const ordered = steps.map(s => s.location);
            document.getElementById('steps').innerHTML =
                `<div class="steps">` + steps.map((s, idx) => {
                    const label = s.type === 'start' ? 'Xuất phát' : (s.type === 'end' ? 'Kết thúc' : `Điểm ${s.id ?? (idx + 1)}`);
                    return `<div class="step"><b>${idx + 1}. ${label}</b></div>`;
                }).join('') + `</div>`;

            const dirRes = await fetch('/api/coach-route', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ coords: ordered, vehicle: { weightTons: 15, height: 3.5, width: 2.5, length: 12 } })
            });
            if (!dirRes.ok) { toast("Không vẽ được tuyến tối ưu.", 'err'); console.error(await dirRes.text()); return; }
            const dirJson = await dirRes.json(); const feat2 = dirJson?.features?.[0];
            if (feat2) drawRoute(feat2.geometry);
            toast("Đã tối ưu & vẽ tuyến!", 'ok');
        } finally { loading(false); }
    };
}

// ==== Nạp danh sách danh thắng từ API và gắn icon theo tên
document.addEventListener("DOMContentLoaded", () => {
    fetch('/api/attractions') // dùng URL thuần, không Razor
        .then(r => { if (!r.ok) throw new Error("Lỗi khi gọi API"); return r.json(); })
        .then(items => {
            const list = document.getElementById("list");
            if (!Array.isArray(items) || items.length === 0) { list.innerHTML = `<div class="poi">Không có dữ liệu danh thắng.</div>`; return; }
            list.innerHTML = "";
            items.forEach(p => {
                const safeName = (p.ten || '').replace(/["'<>&]/g, '');
                const item = document.createElement('div'); item.className = 'poi';
                item.innerHTML = `<b>${safeName}</b>
          <div style="color:#64748b">${p.diaChi ?? ''}</div>
          <div style="margin-top:8px; display:flex; gap:8px; flex-wrap:wrap">
            <button class="btn btn-primary" style="padding:6px 10px" onclick="addStop(${p.lng},${p.lat},'${safeName}')">➕ Thêm vào tuyến</button>
            <button class="btn" style="padding:6px 10px" onclick="focusHere(${p.lat},${p.lng})">🎯 Xem trên bản đồ</button>
          </div>`;
                list.appendChild(item);

                L.marker([p.lat, p.lng], { icon: getPoiIcon(p.ten) }).addTo(map).bindPopup(
                    `<b>${safeName}</b><br><small>${p.diaChi ?? ''}</small><br/>
           <div style="margin-top:6px">
             <button class="btn btn-primary" style="padding:6px 10px" onclick="addStop(${p.lng},${p.lat},'${safeName}')">➕ Thêm điểm này</button>
           </div>`
                );
            });
        })
        .catch(err => {
            document.getElementById("list").innerHTML = `<div class="poi" style="color:#b91c1c;background:#fef2f2;border-color:#fee2e2">Không tải được danh sách.</div>`;
            console.error(err);
        });
});
