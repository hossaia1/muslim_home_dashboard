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
const EXTRA_TIMES = ["Sunrise"]; // For showing end time of Fajr

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
  prayerTimes: null,
  nextPrayer: null
};

function pad(n) { return String(n).padStart(2, "0"); }

function loadPerPrayer() {
  try {
    const raw = localStorage.getItem(LS.perPrayer);
    if (!raw) {
      const init = {};
      PRAYERS.forEach(p => init[p] = false);
      localStorage.setItem(LS.perPrayer, JSON.stringify(init));
      return init;
    }
    const obj = JSON.parse(raw);
    PRAYERS.forEach(p => { if (typeof obj[p] !== "boolean") obj[p] = false; });
    return obj;
  } catch {
    const init = {};
    PRAYERS.forEach(p => init[p] = false);
    return init;
  }
}

function saveState() {
  localStorage.setItem(LS.city, state.city);
  localStorage.setItem(LS.lat, String(state.lat));
  localStorage.setItem(LS.lon, String(state.lon));
  localStorage.setItem(LS.tz, state.tz);
  localStorage.setItem(LS.method, String(state.method));
  localStorage.setItem(LS.globalSound, String(state.globalSound));
  localStorage.setItem(LS.perPrayer, JSON.stringify(state.perPrayer));
}

function openSettings() {
  cityInput.value = state.city;
  calcMethodSel.value = String(state.method);
  renderGlobalSoundPill();
  settingsOverlay.hidden = false;
  settingsOverlay.setAttribute("aria-hidden", "false");
}

function closeSettings() {
  settingsOverlay.hidden = true;
  settingsOverlay.setAttribute("aria-hidden", "true");
}

function renderGlobalSoundPill() {
  globalSoundBtn.textContent = state.globalSound ? "Sound: ON" : "Sound: OFF";
}

function tickClock() {
  const now = new Date();
  timeNowEl.textContent = `${pad(now.getHours())}:${pad(now.getMinutes())}`;
  dateNowEl.textContent = now.toLocaleDateString(undefined, { weekday: "long", year: "numeric", month: "long", day: "numeric" });

  if (state.prayerTimes) computeNextPrayerAndCountdown();
}
setInterval(tickClock, 1000);

// ---------- Prayer Times ----------
async function fetchPrayerTimes() {
  const now = new Date();
  const dd = now.getDate();
  const mm = now.getMonth() + 1;
  const yyyy = now.getFullYear();

  const url =
    `https://api.aladhan.com/v1/timings/${dd}-${mm}-${yyyy}` +
    `?latitude=${state.lat}&longitude=${state.lon}` +
    `&method=${state.method}&timezonestring=${state.tz}`;

  const res = await fetch(url);
  if (!res.ok) throw new Error("Prayer API failed");
  const json = await res.json();

  const t = json?.data?.timings;
  if (!t) throw new Error("Prayer timings missing");

  const pick = {};
  PRAYERS.forEach(p => { pick[p] = t[p].slice(0, 5); });

  const extra = {};
  EXTRA_TIMES.forEach(p => {
    if (t[p]) extra[p] = t[p].slice(0, 5);
  });

  state.prayerTimes = { ...pick, ...extra };
  prayerMetaEl.textContent = `Method ${state.method} · ${state.tz}`;
  renderPrayerList();
  computeNextPrayerAndCountdown();
}

function computeNextPrayerAndCountdown() {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  const prayerDates = PRAYERS.map(name => {
    const [hh, mm] = state.prayerTimes[name].split(":").map(Number);
    const d = new Date(today);
    d.setHours(hh, mm, 0, 0);
    return { name, d };
  });

  let next = prayerDates.find(x => x.d > now);
  if (!next) {
    const [hh, mm] = state.prayerTimes["Fajr"].split(":").map(Number);
    const d = new Date(today);
    d.setDate(d.getDate() + 1);
    d.setHours(hh, mm, 0, 0);
    next = { name: "Fajr", d };
  }

  state.nextPrayer = next;
  nextPrayerLineEl.textContent = `Next prayer: ${next.name} at ${pad(next.d.getHours())}:${pad(next.d.getMinutes())}`;

  const diffMs = next.d - now;
  const totalSec = Math.max(0, Math.floor(diffMs / 1000));
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  countdownEl.textContent = `${pad(h)}:${pad(m)}:${pad(s)}`;

  updatePrayerHighlights(next.name);
}

function updatePrayerHighlights(nextName) {
  const rows = document.querySelectorAll(".prayerRow");
  rows.forEach(r => {
    const name = r.getAttribute("data-name");
    const badge = r.querySelector(".badge");
    if (!badge) return;
    if (name === nextName) {
      badge.textContent = "NEXT";
      badge.classList.add("next");
    } else {
      badge.textContent = "—";
      badge.classList.remove("next");
    }
  });
}

function speakerIconSVG(muted) {
  return muted
    ? `<svg viewBox="0 0 24 24" width="18" height="18"><path d="M3.27 2 2 3.27..."/></svg>`
    : `<svg viewBox="0 0 24 24" width="18" height="18"><path d="M3 10v4h4l5 5V5..."/></svg>`;
}

function renderPrayerList() {
  prayerListEl.innerHTML = "";

  PRAYERS.forEach(name => {
    let time = state.prayerTimes[name];
    if (name === "Fajr" && state.prayerTimes["Sunrise"]) {
      time += ` <span class="sunriseTag">(ends ${state.prayerTimes["Sunrise"]})</span>`;
    }

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
        <button class="soundBtn ${enabled ? "" : "muted"}" aria-label="Toggle adhan for ${name}">${speakerIconSVG(!enabled)}</button>
      </div>
    `;

    row.querySelector(".soundBtn").addEventListener("click", () => {
      state.perPrayer[name] = !state.perPrayer[name];
      saveState();
      renderPrayerList();
      if (state.nextPrayer) updatePrayerHighlights(state.nextPrayer.name);
    });

    prayerListEl.appendChild(row);
  });
}

// ---------- Weather ----------
async function fetchWeather() {
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${state.lat}&longitude=${state.lon}&current=temperature_2m,weather_code&hourly=temperature_2m,weather_code,precipitation_probability&timezone=${state.tz}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error("Weather API failed");
  const json = await res.json();

  weatherTempEl.textContent = `${Math.round(json.current.temperature_2m)}°C`;
  weatherCondEl.textContent = weatherCodeToText(json.current.weather_code);
  weatherIconEl.innerHTML = weatherIconSVG(json.current.weather_code);
  weatherUpdatedEl.textContent = `Now · ${state.city}`;

  renderDayparts(json.hourly);
}

function renderDayparts(hourly) {
  daypartsEl.innerHTML = "";
  if (!hourly?.time || !hourly?.temperature_2m || !hourly?.precipitation_probability) {
    daypartsEl.innerHTML = `<div class="smallHint">No hourly data.</div>`;
    return;
  }

  const now = new Date();
  const y = now.getFullYear(), m = now.getMonth()+1, d = now.getDate();
  const dayPrefix = `${y}-${String(m).padStart(2,"0")}-${String(d).padStart(2,"0")}`;
  const hours = [6, 9, 12, 15, 18, 21];

  hours.forEach(hour => {
    const target = `${dayPrefix}T${String(hour).padStart(2,"0")}:00`;
    const idx = hourly.time.indexOf(target);
    if (idx === -1) return;

    const temp = Math.round(hourly.temperature_2m[idx]);
    const rain = hourly.precipitation_probability[idx];

    const el = document.createElement("div");
    el.className = "part";
    el.innerHTML = `
      <div class="label">${hour}:00</div>
      <div class="val">${temp}°C</div>
      <div class="mini">Rain: ${rain}%</div>
    `;
    daypartsEl.appendChild(el);
  });
}

function weatherCodeToText(code) {
  if(code === 0) return "Clear";
  if([1,2,3].includes(code)) return "Cloudy";
  if([45,48].includes(code)) return "Fog";
  if([51,53,55].includes(code)) return "Drizzle";
  if([61,63,65].includes(code)) return "Rain";
  return "—";
}
function weatherIconSVG(code) {
  return `<svg viewBox="0 0 24 24" width="24" height="24"><circle cx="12" cy="12" r="8" fill="white"/></svg>`;
}

// ---------- Quran Verse ----------
async function fetchDailyVerse() {
  try {
    const res = await fetch("https://api.alquran.cloud/v1/ayah/262/en.asad");
    const json = await res.json();
    if (!json || !json.data) return;
    const verse = json.data.text;
    const surah = json.data.surah.englishName;
    const num = json.data.numberInSurah;
    document.getElementById("verseBox").innerHTML = `<div style="font-size:14px; line-height:1.4">${verse}</div><div class="smallHint">${surah} (${num})</div>`;
  } catch {
    document.getElementById("verseBox").textContent = "— Failed to load verse";
  }
}

// ---------- Boot ----------
(async function init() {
  renderGlobalSoundPill();
  locationLabelEl.textContent = state.city;
  tickClock();
  await refreshAll();
  fetchDailyVerse();
  setInterval(refreshAll, 10 * 60 * 1000);
})();

async function refreshAll() {
  locationLabelEl.textContent = state.city;
  try {
    await fetchPrayerTimes();
  } catch {
    prayerMetaEl.textContent = "Prayer times failed";
  }

  try {
    await fetchWeather();
  } catch {
    weatherUpdatedEl.textContent = "Weather failed";
    weatherTempEl.textContent = "—";
    weatherCondEl.textContent = "—";
    weatherIconEl.innerHTML = "";
    daypartsEl.innerHTML = `<div class="smallHint">—</div>`;
  }
}

// ---------- Events ----------
openSettingsBtn.addEventListener("click", openSettings);
closeSettingsBtn.addEventListener("click", (e) => { e.preventDefault(); closeSettings(); });
settingsOverlay.addEventListener("click", (e) => { if(e.target === settingsOverlay) closeSettings(); });
document.addEventListener("keydown", (e) => { if(e.key === "Escape" && !settingsOverlay.hidden) closeSettings(); });

saveCityBtn.addEventListener("click", async () => {
  const city = cityInput.value.trim();
  if (!city) return;

  saveCityBtn.textContent = "Saving…";
  saveCityBtn.disabled = true;

  try {
    const geo = await geocodeCity(city);
    state.city = city;
    state.lat = geo.lat;
    state.lon = geo.lon;
    saveState();
    closeSettings();
    await refreshAll();
  } catch {
    alert("City not found or geocoder blocked.");
  } finally {
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
  beep();
  alert("Beep played. Audio unlocked.");
});

resetBtn.addEventListener("click", async () => {
  if (!confirm("Reset all settings?")) return;
  Object.values(LS).forEach(k => localStorage.removeItem(k));
  location.reload();
});

async function geocodeCity(city) {
  const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(city)}`;
  const res = await fetch(url);
  const arr = await res.json();
  return { lat: Number(arr[0].lat), lon: Number(arr[0].lon), label: arr[0].display_name };
}

function beep() {
  const ctx = new (window.AudioContext || window.webkitAudioContext)();
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = "sine"; o.frequency.value = 880;
  g.gain.value = 0.06;
  o.connect(g); g.connect(ctx.destination);
  o.start();
  setTimeout(() => { o.stop(); ctx.close(); }, 160);
}
