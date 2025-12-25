// ---------- Local storage keys ----------
const LS = {
  city: "mhd_city",
  lat: "mhd_lat",
  lon: "mhd_lon",
  tz: "mhd_tz",
  method: "mhd_method",
  globalSound: "mhd_sound_global",
  perPrayer: "mhd_sound_per_prayer" // JSON map
};

const PRAYERS = ["Fajr", "Dhuhr", "Asr", "Maghrib", "Isha"];

// ---------- DOM ----------
const timeNowEl = document.getElementById("timeNow");
const dateNowEl = document.getElementById("dateNow");
const nextPrayerLineEl = document.getElementById("nextPrayerLine");
const countdownEl = document.getElementById("countdown");

const prayerListEl = document.getElementById("prayerList");
const prayerMetaEl = document.getElementById("prayerMeta");
const locationLabelEl = document.getElementById("locationLabel");

const weatherIconEl = document.getElementById("weatherIcon");
const weatherTempEl = document.getElementById("weatherTemp");
const weatherCondEl = document.getElementById("weatherCond");
const weatherUpdatedEl = document.getElementById("weatherUpdated");
const daypartsEl = document.getElementById("dayparts");

// Settings modal
const settingsOverlay = document.getElementById("settingsOverlay");
const openSettingsBtn = document.getElementById("openSettingsBtn");
const closeSettingsBtn = document.getElementById("closeSettingsBtn");

const cityInput = document.getElementById("cityInput");
const saveCityBtn = document.getElementById("saveCityBtn");

const calcMethodSel = document.getElementById("calcMethod");
const saveMethodBtn = document.getElementById("saveMethodBtn");

const globalSoundBtn = document.getElementById("globalSoundBtn");
const testSoundBtn = document.getElementById("testSoundBtn");

const resetBtn = document.getElementById("resetBtn");

// ---------- State ----------
let state = {
  city: localStorage.getItem(LS.city) || "Helsinki",
  lat: Number(localStorage.getItem(LS.lat)) || 60.1699,
  lon: Number(localStorage.getItem(LS.lon)) || 24.9384,
  tz: localStorage.getItem(LS.tz) || "Europe/Helsinki",
  method: Number(localStorage.getItem(LS.method)) || 3,
  globalSound: (localStorage.getItem(LS.globalSound) ?? "false") === "true",
  perPrayer: loadPerPrayer(),
  prayerTimes: null, // {Fajr:"HH:MM", ...}
  nextPrayer: null,  // {name, timeDate}
};

// ---------- Helpers ----------
function pad(n){ return String(n).padStart(2,"0"); }

function loadPerPrayer(){
  try{
    const raw = localStorage.getItem(LS.perPrayer);
    if(!raw){
      const init = {};
      PRAYERS.forEach(p => init[p] = false); // default: muted
      localStorage.setItem(LS.perPrayer, JSON.stringify(init));
      return init;
    }
    const obj = JSON.parse(raw);
    // Ensure all prayers exist
    PRAYERS.forEach(p => { if(typeof obj[p] !== "boolean") obj[p] = false; });
    return obj;
  }catch{
    const init = {};
    PRAYERS.forEach(p => init[p] = false);
    return init;
  }
}

function saveState(){
  localStorage.setItem(LS.city, state.city);
  localStorage.setItem(LS.lat, String(state.lat));
  localStorage.setItem(LS.lon, String(state.lon));
  localStorage.setItem(LS.tz, state.tz);
  localStorage.setItem(LS.method, String(state.method));
  localStorage.setItem(LS.globalSound, String(state.globalSound));
  localStorage.setItem(LS.perPrayer, JSON.stringify(state.perPrayer));
}

function openSettings(){
  cityInput.value = state.city;
  calcMethodSel.value = String(state.method);
  renderGlobalSoundPill();
  settingsOverlay.hidden = false;
}

function closeSettings(){
  settingsOverlay.hidden = true;
}

function renderGlobalSoundPill(){
  globalSoundBtn.textContent = state.globalSound ? "Sound: ON" : "Sound: OFF";
}

// ---------- Clock ----------
function tickClock(){
  const now = new Date();
  timeNowEl.textContent = `${pad(now.getHours())}:${pad(now.getMinutes())}`;
  dateNowEl.textContent = now.toLocaleDateString(undefined, { weekday:"long", year:"numeric", month:"long", day:"numeric" });

  if(state.prayerTimes){
    computeNextPrayerAndCountdown();
  }
}
setInterval(tickClock, 1000);

// ---------- Prayer times (AlAdhan) ----------
async function fetchPrayerTimes(){
  // Use today’s date
  const now = new Date();
  const dd = now.getDate();
  const mm = now.getMonth() + 1;
  const yyyy = now.getFullYear();

  const url =
    `https://api.aladhan.com/v1/timings/${dd}-${mm}-${yyyy}` +
    `?latitude=${encodeURIComponent(state.lat)}` +
    `&longitude=${encodeURIComponent(state.lon)}` +
    `&method=${encodeURIComponent(state.method)}` +
    `&timezonestring=${encodeURIComponent(state.tz)}`;

  const res = await fetch(url, { cache: "no-store" });
  if(!res.ok) throw new Error("Prayer API failed");
  const json = await res.json();

  const t = json?.data?.timings;
  if(!t) throw new Error("Prayer timings missing");

  // Keep only what we need, strip seconds/timezone suffix if present
  const pick = {};
  PRAYERS.forEach(p => {
    const raw = t[p];
    pick[p] = String(raw).slice(0,5); // "HH:MM"
  });

  state.prayerTimes = pick;
  prayerMetaEl.textContent = `Method ${state.method} · ${state.tz}`;
  renderPrayerList();
  computeNextPrayerAndCountdown();
}

// ---------- Next prayer + countdown ----------
function computeNextPrayerAndCountdown(){
  const now = new Date();

  // Build Date objects for each prayer today
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const prayerDates = PRAYERS.map(name => {
    const [hh, mm] = state.prayerTimes[name].split(":").map(Number);
    const d = new Date(today);
    d.setHours(hh, mm, 0, 0);
    return { name, d };
  });

  // Find next prayer today; if passed all, next is tomorrow Fajr
  let next = prayerDates.find(x => x.d > now);
  if(!next){
    const [hh, mm] = state.prayerTimes["Fajr"].split(":").map(Number);
    const d = new Date(today);
    d.setDate(d.getDate() + 1);
    d.setHours(hh, mm, 0, 0);
    next = { name:"Fajr", d };
  }

  state.nextPrayer = next;
  nextPrayerLineEl.textContent = `Next prayer: ${next.name} at ${pad(next.d.getHours())}:${pad(next.d.getMinutes())}`;

  // Countdown
  const diffMs = next.d - now;
  const totalSec = Math.max(0, Math.floor(diffMs / 1000));
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  countdownEl.textContent = `${pad(h)}:${pad(m)}:${pad(s)}`;

  // Highlight in list
  updatePrayerHighlights(next.name);
}

function updatePrayerHighlights(nextName){
  const rows = document.querySelectorAll(".prayerRow");
  rows.forEach(r => {
    const name = r.getAttribute("data-name");
    const badge = r.querySelector(".badge");
    if(!badge) return;
    if(name === nextName){
      badge.textContent = "NEXT";
      badge.classList.add("next");
    }else{
      badge.textContent = "—";
      badge.classList.remove("next");
    }
  });
}

// ---------- Prayer list UI ----------
function speakerIconSVG(muted){
  // muted: true -> crossed speaker
  if(muted){
    return `
      <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
        <path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v8.05A4.49 4.49 0 0 0 16.5 12Zm2.5 0c0 2.83-1.64 5.27-4 6.45v-2.22c1.19-.93 2-2.36 2-4.23s-.81-3.3-2-4.23V5.55c2.36 1.18 4 3.62 4 6.45ZM3.27 2 2 3.27l4.99 5H3v7h4l5 5v-8.73l4.73 4.73c-.36.27-.75.5-1.17.67v2.08c.97-.25 1.87-.71 2.63-1.35L20.73 21 22 19.73 3.27 2ZM12 5.27 10.91 4.18 12 3v2.27ZM8 14H5v-3h3l4-4v10l-4-3Z"/>
      </svg>`;
  }
  return `
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
      <path d="M3 10v4h4l5 5V5L7 10H3Zm13.5 2c0-1.77-1.02-3.29-2.5-4.03v8.05A4.49 4.49 0 0 0 16.5 12ZM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77Z"/>
    </svg>`;
}

function renderPrayerList(){
  prayerListEl.innerHTML = "";

  PRAYERS.forEach(name => {
    const time = state.prayerTimes[name];
    const enabled = !!state.perPrayer[name];

    const row = document.createElement("div");
    row.className = "prayerRow";
    row.setAttribute("data-name", name);

    row.innerHTML = `
      <div class="prayerLeft">
        <div class="prayerName">${name}</div>
        <div class="prayerTime">${time}</div>
      </div>

      <div class="prayerRight">
        <span class="badge">—</span>
        <button class="soundBtn ${enabled ? "" : "muted"}" aria-label="Toggle adhan for ${name}" title="Toggle adhan">
          ${speakerIconSVG(!enabled)}
        </button>
      </div>
    `;

    const btn = row.querySelector(".soundBtn");
    btn.addEventListener("click", () => {
      state.perPrayer[name] = !state.perPrayer[name];
      saveState();
      renderPrayerList();
      if(state.nextPrayer) updatePrayerHighlights(state.nextPrayer.name);
    });

    prayerListEl.appendChild(row);
  });
}

// ---------- Weather (Open-Meteo) ----------
function weatherCodeToText(code){
  // Minimal mapping (good enough for MVP)
  if(code === 0) return "Clear";
  if([1,2,3].includes(code)) return "Partly cloudy";
  if([45,48].includes(code)) return "Fog";
  if([51,53,55,56,57].includes(code)) return "Drizzle";
  if([61,63,65,66,67].includes(code)) return "Rain";
  if([71,73,75,77].includes(code)) return "Snow";
  if([80,81,82].includes(code)) return "Showers";
  if([95,96,99].includes(code)) return "Thunder";
  return "—";
}

function weatherIconSVG(code){
  // Simple inline icons (no external images)
  const base = `width="26" height="26" viewBox="0 0 24 24"`;
  if(code === 0){
    return `<svg ${base}><path d="M12 18a6 6 0 1 1 0-12 6 6 0 0 1 0 12Z"/></svg>`;
  }
  if([1,2,3].includes(code)){
    return `<svg ${base}><path d="M7 18h9a4 4 0 0 0 0-8 5.5 5.5 0 0 0-10.6 1.8A3.5 3.5 0 0 0 7 18Z"/></svg>`;
  }
  if([61,63,65,80,81,82].includes(code)){
    return `<svg ${base}><path d="M7 15h9a4 4 0 0 0 0-8 5.5 5.5 0 0 0-10.6 1.8A3.5 3.5 0 0 0 7 15Z"/><path d="M8 18l-1 3m5-3l-1 3m5-3l-1 3" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round"/></svg>`;
  }
  if([71,73,75,77].includes(code)){
    return `<svg ${base}><path d="M7 15h9a4 4 0 0 0 0-8 5.5 5.5 0 0 0-10.6 1.8A3.5 3.5 0 0 0 7 15Z"/><path d="M9 18l-1 1 1 1 1-1-1-1Zm6 0l-1 1 1 1 1-1-1-1Z"/></svg>`;
  }
  return `<svg ${base}><path d="M7 18h9a4 4 0 0 0 0-8 5.5 5.5 0 0 0-10.6 1.8A3.5 3.5 0 0 0 7 18Z"/></svg>`;
}

async function fetchWeather(){
  // We ask for hourly temps+weathercode so we can build simple “day parts”
  const url =
    `https://api.open-meteo.com/v1/forecast` +
    `?latitude=${encodeURIComponent(state.lat)}` +
    `&longitude=${encodeURIComponent(state.lon)}` +
    `&current=temperature_2m,weather_code` +
    `&hourly=temperature_2m,weather_code` +
    `&timezone=${encodeURIComponent(state.tz)}`;

  const res = await fetch(url, { cache:"no-store" });
  if(!res.ok) throw new Error("Weather API failed");
  const json = await res.json();

  const temp = json?.current?.temperature_2m;
  const code = json?.current?.weather_code;

  weatherTempEl.textContent = (temp !== undefined) ? `${Math.round(temp)}°C` : "—";
  weatherCondEl.textContent = weatherCodeToText(code);
  weatherIconEl.innerHTML = weatherIconSVG(code);
  weatherUpdatedEl.textContent = `Now · ${state.city}`;

  renderDayparts(json?.hourly);
}

function renderDayparts(hourly){
  daypartsEl.innerHTML = "";
  if(!hourly?.time || !hourly?.temperature_2m || !hourly?.weather_code){
    daypartsEl.innerHTML = `<div class="smallHint">No hourly data.</div>`;
    return;
  }

  // Pick representative times (local timezone already applied by API)
  const targets = [
    { label:"Morning", hour: 9 },
    { label:"Afternoon", hour: 14 },
    { label:"Evening", hour: 19 },
    { label:"Night", hour: 23 },
  ];

  const now = new Date();
  const y = now.getFullYear(), m = now.getMonth()+1, d = now.getDate();
  const dayPrefix = `${y}-${String(m).padStart(2,"0")}-${String(d).padStart(2,"0")}`;

  targets.forEach(t => {
    const wanted = `${dayPrefix}T${String(t.hour).padStart(2,"0")}:00`;
    const idx = hourly.time.indexOf(wanted);
    if(idx === -1) return;

    const temp = Math.round(hourly.temperature_2m[idx]);
    const code = hourly.weather_code[idx];

    const el = document.createElement("div");
    el.className = "part";
    el.innerHTML = `
      <div class="label">${t.label}</div>
      <div class="val">${temp}°C</div>
      <div class="mini">${weatherCodeToText(code)}</div>
    `;
    daypartsEl.appendChild(el);
  });
}

// ---------- Geocoding (Nominatim) ----------
async function geocodeCity(city){
  // Nominatim requires a User-Agent; browsers can't set it reliably.
  // In practice it still works often. If it ever fails, switch to another geocoder.
  const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(city)}`;
  const res = await fetch(url, { cache:"no-store" });
  if(!res.ok) throw new Error("Geocoding failed");
  const arr = await res.json();
  if(!arr?.length) throw new Error("City not found");
  return { lat: Number(arr[0].lat), lon: Number(arr[0].lon), label: arr[0].display_name };
}

// ---------- Sound (simple beep) ----------
let audioUnlocked = false;

function beep(){
  // Create a tiny beep with WebAudio (no file needed)
  const ctx = new (window.AudioContext || window.webkitAudioContext)();
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = "sine";
  o.frequency.value = 880;
  g.gain.value = 0.06;
  o.connect(g); g.connect(ctx.destination);
  o.start();
  setTimeout(() => { o.stop(); ctx.close(); }, 160);
  audioUnlocked = true;
}

function maybePlayAdhanFor(prayerName){
  // MVP: just a beep. Replace with a real adhan audio file later if you want.
  if(!state.globalSound) return;
  if(!state.perPrayer[prayerName]) return;
  if(!audioUnlocked) return;
  beep();
}

// Trigger beep when the prayer time is reached (checks each second)
let lastTriggeredPrayer = null;
function checkPrayerTrigger(){
  if(!state.nextPrayer) return;
  const now = new Date();
  // If we are within the first 3 seconds of the next prayer time
  const diff = state.nextPrayer.d - now;
  if(diff <= 2500 && diff >= -2500){
    if(lastTriggeredPrayer !== state.nextPrayer.name){
      lastTriggeredPrayer = state.nextPrayer.name;
      maybePlayAdhanFor(state.nextPrayer.name);
    }
  }
}
setInterval(checkPrayerTrigger, 1000);

// ---------- Refresh loop ----------
async function refreshAll(){
  locationLabelEl.textContent = state.city;
  try{
    await fetchPrayerTimes();
  }catch(e){
    prayerMetaEl.textContent = "Prayer times failed (check HTTPS + network)";
  }

  try{
    await fetchWeather();
  }catch(e){
    weatherUpdatedEl.textContent = "Weather failed (check HTTPS + network)";
    weatherTempEl.textContent = "—";
    weatherCondEl.textContent = "—";
    weatherIconEl.innerHTML = "";
    daypartsEl.innerHTML = `<div class="smallHint">—</div>`;
  }
}

// ---------- Events ----------
openSettingsBtn.addEventListener("click", openSettings);
closeSettingsBtn.addEventListener("click", closeSettings);
settingsOverlay.addEventListener("click", (e) => {
  if(e.target === settingsOverlay) closeSettings();
});

saveCityBtn.addEventListener("click", async () => {
  const city = cityInput.value.trim();
  if(!city) return;

  saveCityBtn.textContent = "Saving…";
  saveCityBtn.disabled = true;

  try{
    const geo = await geocodeCity(city);
    state.city = city;
    state.lat = geo.lat;
    state.lon = geo.lon;
    // timezone stays as chosen; for Finland that’s fine.
    saveState();
    closeSettings();
    await refreshAll();
  }catch{
    alert("City not found or geocoder blocked. Try a more specific name (e.g., 'Helsinki, Finland').");
  }finally{
    saveCityBtn.textContent = "Save";
    saveCityBtn.disabled = false;
  }
});

saveMethodBtn.addEventListener("click", async () => {
  state.method = Number(calcMethodSel.value);
  saveState();
  closeSettings();
  await refreshAll();
});

globalSoundBtn.addEventListener("click", () => {
  state.globalSound = !state.globalSound;
  saveState();
  renderGlobalSoundPill();
});

testSoundBtn.addEventListener("click", () => {
  // This is the user gesture that unlocks audio
  beep();
  alert("Beep played. Audio is unlocked for this session.");
});

resetBtn.addEventListener("click", async () => {
  if(!confirm("Reset all settings?")) return;
  localStorage.removeItem(LS.city);
  localStorage.removeItem(LS.lat);
  localStorage.removeItem(LS.lon);
  localStorage.removeItem(LS.tz);
  localStorage.removeItem(LS.method);
  localStorage.removeItem(LS.globalSound);
  localStorage.removeItem(LS.perPrayer);
  state = {
    city: "Helsinki",
    lat: 60.1699,
    lon: 24.9384,
    tz: "Europe/Helsinki",
    method: 3,
    globalSound: false,
    perPrayer: loadPerPrayer(),
    prayerTimes: null,
    nextPrayer: null,
  };
  saveState();
  closeSettings();
  await refreshAll();
});

// ---------- Boot ----------
(async function init(){
  renderGlobalSoundPill();
  locationLabelEl.textContent = state.city;
  tickClock();
  await refreshAll();

  // Refresh APIs every 10 minutes (reliability)
  setInterval(refreshAll, 10 * 60 * 1000);
})();
