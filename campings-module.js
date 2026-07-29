(() => {
  "use strict";

  const TABLE = "trip_stops";
  let records = [];
  let editingId = null;

  const css = `
    .stops-shell{display:grid;gap:14px}
    .stops-toolbar{display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap}
    .stops-toolbar h2{margin:0}
    .stops-summary{color:var(--muted);font-size:13px}
    .stops-form-card{padding:18px;border:1px solid var(--line);border-radius:16px;background:rgba(255,255,255,.045)}
    .stops-form-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px 14px}
    .stops-form-grid .wide{grid-column:span 2}
    .stops-form-grid label{margin-top:0}
    .stops-form-actions{display:flex;gap:8px;justify-content:flex-end;margin-top:14px}
    .stops-compact-wrap{overflow:auto;border:1px solid var(--line);border-radius:14px}
    .stops-compact{width:100%;min-width:900px;border-collapse:collapse}
    .stops-compact th,.stops-compact td{padding:7px 9px;border-bottom:1px solid var(--line);vertical-align:middle;font-size:13px}
    .stops-compact th{position:sticky;top:0;background:#0b3039;color:var(--accent);font-size:12px;z-index:1}
    .stops-compact tr:last-child td{border-bottom:0}
    .stops-name{font-weight:800}
    .stops-address{color:var(--muted);font-size:12px;margin-top:2px}
    .stops-note{max-width:260px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:var(--muted)}
    .stops-distance{white-space:nowrap;font-weight:800;color:var(--accent)}
    .stops-actions{display:flex;gap:5px;white-space:nowrap}
    .stops-link{color:var(--accent);text-decoration:none;font-weight:700}
    .stops-empty{padding:26px;text-align:center;color:var(--muted)}
    @media(max-width:850px){.stops-form-grid{grid-template-columns:1fr}.stops-form-grid .wide{grid-column:auto}}
  `;

  function injectCss() {
    if (document.getElementById("stops-module-css")) return;
    const style = document.createElement("style");
    style.id = "stops-module-css";
    style.textContent = css;
    document.head.appendChild(style);
  }

  function esc(value) {
    return String(value ?? "")
      .replaceAll("&","&amp;").replaceAll("<","&lt;")
      .replaceAll(">","&gt;").replaceAll('"',"&quot;")
      .replaceAll("'","&#039;");
  }

  function selectedTripId() {
    return window.selectedTrip?.id || null;
  }

  function selectedTripStart() {
    const t = window.selectedTrip || {};
    const lat = Number(t.start_lat ?? t.start_latitude);
    const lng = Number(t.start_lng ?? t.start_longitude);
    return {
      address: t.start_address || "",
      lat: Number.isFinite(lat) ? lat : null,
      lng: Number.isFinite(lng) ? lng : null
    };
  }

  function haversineKm(aLat, aLng, bLat, bLng) {
    const toRad = x => x * Math.PI / 180;
    const R = 6371;
    const dLat = toRad(bLat - aLat);
    const dLng = toRad(bLng - aLng);
    const aa = Math.sin(dLat/2) ** 2 +
      Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng/2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(aa), Math.sqrt(1-aa));
  }

  async function geocode(address) {
    if (!address || !window.google?.maps?.Geocoder) return null;
    const geocoder = new google.maps.Geocoder();
    const result = await geocoder.geocode({address});
    const loc = result.results?.[0]?.geometry?.location;
    return loc ? {lat: loc.lat(), lng: loc.lng()} : null;
  }

  async function calculateDistances() {
    let start = selectedTripStart();
    if ((start.lat === null || start.lng === null) && start.address) {
      const coords = await geocode(start.address);
      if (coords) start = {...start, ...coords};
    }
    records = records.map(item => {
      const lat = Number(item.latitude);
      const lng = Number(item.longitude);
      const distance = start.lat !== null && start.lng !== null && Number.isFinite(lat) && Number.isFinite(lng)
        ? haversineKm(start.lat, start.lng, lat, lng) : null;
      return {...item, _distance: distance};
    }).sort((a,b) => {
      if (a._distance === null && b._distance === null) return a.name.localeCompare(b.name, "pl");
      if (a._distance === null) return 1;
      if (b._distance === null) return -1;
      return a._distance - b._distance;
    });
  }

  function mapsUrl(item) {
    if (item.google_maps_url) return item.google_maps_url;
    if (item.latitude != null && item.longitude != null) return `https://www.google.com/maps/search/?api=1&query=${item.latitude},${item.longitude}`;
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(item.address || item.name)}`;
  }

  function shellHtml() {
    return `<div class="card stops-shell">
      <div class="stops-toolbar"><div><h2>Kempingi i miejsca postoju</h2><div id="stopsSummary" class="stops-summary"></div></div><button id="stopAdd" class="button" type="button">+ Dodaj</button></div>
      <div id="stopFormCard" class="stops-form-card hidden"><form id="stopForm">
        <div class="stops-form-grid">
          <div><label for="stopType">Rodzaj</label><select id="stopType" required><option value="kemping">Kemping</option><option value="camperpark">Camperpark</option><option value="parking">Parking</option><option value="postoj">Miejsce postoju</option></select></div>
          <div class="wide"><label for="stopName">Nazwa</label><input id="stopName" required placeholder="Nazwa miejsca"></div>
          <div class="wide"><label for="stopAddress">Adres</label><input id="stopAddress" required placeholder="Ulica, miasto, kraj"></div>
          <div><label for="stopRating">Ocena</label><input id="stopRating" type="number" min="0" max="5" step="0.1" placeholder="np. 4.7"></div>
          <div class="wide"><label for="stopMapsUrl">Link Google Maps</label><input id="stopMapsUrl" type="url" placeholder="https://maps.google.com/..."></div>
          <div><label for="stopWebsite">Strona WWW</label><input id="stopWebsite" type="url" placeholder="https://..."></div>
          <div><label for="stopLatitude">Szerokość geogr.</label><input id="stopLatitude" type="number" step="any"></div>
          <div><label for="stopLongitude">Długość geogr.</label><input id="stopLongitude" type="number" step="any"></div>
          <div class="wide"><label for="stopNotes">Uwagi</label><textarea id="stopNotes" placeholder="Prąd, sanitariaty, plac zabaw, cena..."></textarea></div>
        </div>
        <div id="stopFormMessage" class="message"></div>
        <div class="stops-form-actions"><button class="button secondary" id="stopCancel" type="button">Anuluj</button><button class="button" type="submit">Zapisz</button></div>
      </form></div>
      <div id="stopsMessage" class="message"></div><div id="stopsTable"></div>
    </div>`;
  }

  function canEdit() { return window.currentProfile?.global_role === "administrator"; }

  function renderTable() {
    const holder = document.getElementById("stopsTable");
    const summary = document.getElementById("stopsSummary");
    if (!holder) return;
    summary.textContent = `${records.length} ${records.length === 1 ? "pozycja" : "pozycji"} • od najbliższej do najdalszej od startu`;
    if (!records.length) {
      holder.innerHTML = `<div class="stops-empty">Nie dodano jeszcze żadnego kempingu ani miejsca postoju.</div>`;
      return;
    }
    holder.innerHTML = `<div class="stops-compact-wrap"><table class="stops-compact"><thead><tr><th>LP</th><th>Miejsce</th><th>Rodzaj</th><th>Ocena</th><th>Odległość</th><th>Uwagi</th><th>Linki</th>${canEdit()?"<th>Operacje</th>":""}</tr></thead><tbody>${records.map((item,i)=>`<tr>
      <td>${i+1}</td><td><div class="stops-name">${esc(item.name)}</div><div class="stops-address">${esc(item.address)}</div></td>
      <td><span class="badge">${esc(item.type)}</span></td><td>${item.rating!=null?`⭐ ${Number(item.rating).toFixed(1)}`:"—"}</td>
      <td class="stops-distance">${item._distance!=null?`${item._distance.toFixed(0)} km`:"brak danych"}</td>
      <td><div class="stops-note" title="${esc(item.notes)}">${esc(item.notes||"—")}</div></td>
      <td><a class="stops-link" href="${esc(mapsUrl(item))}" target="_blank" rel="noopener">Mapa</a>${item.website?` · <a class="stops-link" href="${esc(item.website)}" target="_blank" rel="noopener">WWW</a>`:""}</td>
      ${canEdit()?`<td><div class="stops-actions"><button class="button secondary small-button" data-edit-stop="${item.id}">Edytuj</button><button class="button danger small-button" data-delete-stop="${item.id}">Usuń</button></div></td>`:""}</tr>`).join("")}</tbody></table></div>`;
    holder.querySelectorAll("[data-edit-stop]").forEach(btn=>btn.addEventListener("click",()=>openForm(records.find(x=>String(x.id)===btn.dataset.editStop))));
    holder.querySelectorAll("[data-delete-stop]").forEach(btn=>btn.addEventListener("click",()=>removeRecord(btn.dataset.deleteStop)));
  }

  function openForm(item=null) {
    editingId = item?.id || null;
    document.getElementById("stopType").value=item?.type||"kemping";
    document.getElementById("stopName").value=item?.name||"";
    document.getElementById("stopAddress").value=item?.address||"";
    document.getElementById("stopRating").value=item?.rating??"";
    document.getElementById("stopMapsUrl").value=item?.google_maps_url||"";
    document.getElementById("stopWebsite").value=item?.website||"";
    document.getElementById("stopLatitude").value=item?.latitude??"";
    document.getElementById("stopLongitude").value=item?.longitude??"";
    document.getElementById("stopNotes").value=item?.notes||"";
    document.getElementById("stopFormCard").classList.remove("hidden");
    document.getElementById("stopName").focus();
  }

  function closeForm() {
    editingId=null; document.getElementById("stopForm").reset();
    document.getElementById("stopFormCard").classList.add("hidden");
    document.getElementById("stopFormMessage").textContent="";
  }

  async function loadRecords() {
    const message=document.getElementById("stopsMessage");
    const tripId=selectedTripId();
    if(!tripId){message.textContent="Nie wybrano wyjazdu.";return;}
    message.textContent="Ładowanie...";
    const {data,error}=await window.client.from(TABLE).select("*").eq("trip_id",tripId).order("created_at",{ascending:true});
    if(error){message.textContent=error.message;message.className="message error";return;}
    records=data||[]; await calculateDistances(); message.textContent=""; renderTable();
  }

  async function saveRecord(event) {
    event.preventDefault();
    const msg=document.getElementById("stopFormMessage"); msg.textContent="Zapisywanie..."; msg.className="message";
    let lat=document.getElementById("stopLatitude").value, lng=document.getElementById("stopLongitude").value;
    const address=document.getElementById("stopAddress").value.trim();
    if(!lat||!lng){try{const c=await geocode(address);if(c){lat=c.lat;lng=c.lng;}}catch{}}
    const payload={trip_id:selectedTripId(),type:document.getElementById("stopType").value,name:document.getElementById("stopName").value.trim(),address,
      rating:document.getElementById("stopRating").value||null,google_maps_url:document.getElementById("stopMapsUrl").value.trim()||null,
      website:document.getElementById("stopWebsite").value.trim()||null,latitude:lat||null,longitude:lng||null,
      notes:document.getElementById("stopNotes").value.trim()||null,updated_at:new Date().toISOString()};
    const query=editingId?window.client.from(TABLE).update(payload).eq("id",editingId):window.client.from(TABLE).insert(payload);
    const {error}=await query;
    if(error){msg.textContent=error.message;msg.className="message error";return;}
    closeForm(); await loadRecords();
  }

  async function removeRecord(id) {
    if(!confirm("Usunąć tę pozycję?"))return;
    const {error}=await window.client.from(TABLE).delete().eq("id",id);
    if(error)return alert(error.message); await loadRecords();
  }

  function mount() {
    injectCss();
    const panel=document.getElementById("trip-tab-kempingi");
    if(!panel)return;
    if(!panel.querySelector(".stops-shell")){
      panel.innerHTML=shellHtml();
      document.getElementById("stopAdd").addEventListener("click",()=>openForm());
      document.getElementById("stopCancel").addEventListener("click",closeForm);
      document.getElementById("stopForm").addEventListener("submit",saveRecord);
    }
    document.getElementById("stopAdd").classList.toggle("hidden",!canEdit());
    loadRecords();
  }

  document.addEventListener("click",event=>{if(event.target.closest('[data-trip-tab="kempingi"]'))setTimeout(mount,0);});
  const observer=new MutationObserver(()=>{const panel=document.getElementById("trip-tab-kempingi");if(panel?.classList.contains("active")&&!panel.querySelector(".stops-shell"))mount();});
  observer.observe(document.documentElement,{subtree:true,attributes:true,attributeFilter:["class"]});
  window.KamperTeamStops={mount,reload:loadRecords};
})();
