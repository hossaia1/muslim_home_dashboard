/* مسلم ড্যাশবোর্ড (simple web app)
   - Prayer times: AlAdhan API
   - Weather: Open-Meteo (geocoding + hourly)
   - Settings stored in localStorage
*/

const PRAYERS = ["Fajr", "Dhuhr", "Asr", "Maghrib", "Isha"];

const DEFAULT_SETTINGS = {
  locationText: "Mecca, Saudi Arabia",
  method: 4, // Umm Al-Qura
  darkMode: false,
  adhanEnabled: { Fajr: true, Dhuhr: true, Asr: true, Maghrib: true, Isha: true },
  voiceKey: "makkah1",
  customVoiceUrl: ""
};

// A few built-in voices (these links may change over time).
// If they fail, user can paste a custom MP3 URL in settings.
const ADHAN_VOICES = [
  { key: "makkah1", name: "Makkah (demo 1)", url: "https://download.quranicaudio.com/quran/adhan/adhan1.mp3" },
  { key: "makkah2", name: "Makkah (demo 2)", url: "https://download.quranicaudio.com/quran/adhan/adhan2.mp3" },
  { key: "custom",  name: "Custom URL",       url: "" }
];

let settings = loadSettings();

// State
let prayerTimes = null;   // { Fajr:"04:34", ..., Sunrise:"05:56" }
let nextPrayer = null;    // { name, timeStr, dateObj }
let countdownTimer = null;
let clockTimer = null;

let lastAdhanPlayedKey = ""; // prevent repeats

// Elements
const el = {
  // views
  viewDashboard: document.getElementById("viewDashboard"),
  viewSettings: document.getElementById("viewSettings"),

  // top
  locationLine: document.getElementById("locationLine"),

  // time card
  clock: document.getElementById("clock"),
  dateLine: document.getElementById("dateLine"),
  nextPrayerName: document.getElementById("nextPrayerName"),
  countdown: document.getElementById("countdown"),

  // weather
  tempNow: document.getElementById("tempNow"),
  weatherDesc: document.getElementById("weatherDesc"),
  weatherCity: document.getElementById("weatherCity"),
  humidityNow: document.getElementById("humidityNow"),
  windNow: document.getElementById("windNow"),
  hourlyStrip: document.getElementById("hourlyStrip"),

  // prayers
  prayerList: document.getElementById("prayerList"),
  footerLocation: document.getElementById("footerLocation"),

  // nav
  btnDashboard: document.getElementById("btnDashboard"),
  btnSettings: document.getElementById("btnSettings"),

  // settings fields
  locationInput: document.getElementById("locationInput"),
  methodSelect: document.getElementById("methodSelect"),
  adhanToggles: document.getElementById("adhanToggles"),
  voiceSelect: document.getElementById("voiceSelect"),
  customUrlRow: document.getElementById("customUrlRow"),
  customVoiceUrl: document.getElementById("customVoiceUrl"),
  darkModeToggle: document.getElementById("darkModeToggle"),
  btnSave: document.getElementById("btnSave"),
  btnCancel: document.getElementById("btnCancel"),
  saveHint: document.getElementById("saveHint"),

  // audio
  adhanAudio: document.getElementById("adhanAudio"),
  btnTestAdhan: document.getElementById("btnTestAdhan"),
  btnStopAdhan: document.getElementById("btnStopAdhan"),
};

// ---------- Init ----------
applyDarkMode(settings.darkMode);
wireUI();
renderSettingsForm();
startClock();
refreshAll();

// ---------- UI wiring ----------
function wireUI(){
  el.btnSettings.addEventListener("click", () => showView("settings"));
  el.btnDashboard.addEventListener("click", () => showView("dashboard"));

  el.btnSave.addEventListener("click", () => {
    settings = readSettingsForm();
    saveSettings(settings);
    applyDarkMode(settings.darkMode);
    el.saveHint.textContent = "Saved. Updating dashboard…";
    refreshAll().then(() => {
      el.saveHint.textContent = "";
      showView("dashboard");
    });
  });

  el.btnCancel.addEventListener("click", () => {
    renderSettingsForm();
    showView("dashboard");
  });

  el.voiceSelect.addEventListener("change", () => {
    const isCustom = el.voiceSelect.value === "custom";
    el.customUrlRow.classList.toggle("hidden", !isCustom);
  });

  el.btnTestAdhan.addEventListener("click", () => {
    const url = getSelectedAdhanUrl();
    if (!url) {
      alert("No audio URL set. Choose a voice or paste a custom MP3 URL.");
      return;
    }
    playAdhan(url);
  });

  el.btnStopAdhan.addEventListener("click", () => stopAdhan());
}

function showView(which){
  const showSettings = which === "settings";
  el.viewSettings.classList.toggle("hidden", !showSettings);
  el.viewDashboard.classList.toggle("hidden", showSettings);
}

// ---------- Settings storage ----------
function loadSettings(){
  try{
    const raw = localStorage.getItem("muslim_dashboard_settings");
    if(!raw) return structuredClone(DEFAULT_SETTINGS);
    const parsed = JSON.parse(raw);

    // Merge so new fields won’t break old saved settings
    return {
      ...structuredClone(DEFAULT_SETTINGS),
      ...parsed,
      adhanEnabled: { ...structuredClone(DEFAULT_SETTINGS.adhanEnabled), ...(parsed.adhanEnabled || {}) }
    };
  } catch {
    return structuredClone(DEFAULT_SETTINGS);
  }
}

function saveSettings(s){
  localStorage.setItem("muslim_dashboard_settings", JSON.stringify(s));
}

function applyDarkMode(isDark){
  document.body.classList.toggle("dark", !!isDark);
}

// ---------- Settings form render/read ----------
function renderSettingsForm(){
  el.locationInput.value = settings.locationText;
  el.methodSelect.value = String(settings.method);
  el.darkModeToggle.checked = !!settings.darkMode;

  // toggles
  el.adhanToggles.innerHTML = "";
  PRAYERS.forEach(p => {
    const row = document.createElement("div");
    row.className = "toggle-item";
    row.innerHTML = `
      <span>${p}</span>
      <label class="inline" style="margin:0">
        <input type="checkbox" data-prayer="${p}" ${settings.adhanEnabled[p] ? "checked" : ""} />
        <span style="color:var(--muted);font-size:12px">Adhan</span>
      </label>
    `;
    el.adhanToggles.appendChild(row);
  });

  // voice select
  el.voiceSelect.innerHTML = "";
  ADHAN_VOICES.forEach(v => {
    const opt = document.createElement("option");
    opt.value = v.key;
    opt.textContent = v.name;
    el.voiceSelect.appendChild(opt);
  });
  el.voiceSelect.value = settings.voiceKey;
  el.customVoiceUrl.value = settings.customVoiceUrl || "";
  el.customUrlRow.classList.toggle("hidden", settings.voiceKey !== "custom");
}

function readSettingsForm(){
  const s = structuredClone(settings);

  s.locationText = el.locationInput.value.trim() || DEFAULT_SETTINGS.locationText;
  s.method = Number(el.methodSelect.value) || DEFAULT_SETTINGS.method;
  s.darkMode = !!el.darkModeToggle.checked;

  const enabled = {};
  el.adhanToggles.querySelectorAll("input[type='checkbox'][data-prayer]").forEach(cb => {
    const p = cb.getAttribute("data-prayer");
    enabled[p] = cb.checked;
  });
  s.adhanEnabled = enabled;

  s.voiceKey = el.voiceSelect.value;
  s.customVoiceUrl = el.customVoiceUrl.value.trim();

  return s;
}

// ---------- Clock ----------
function startClock(){
  if(clockTimer) clearInterval(clockTimer);

  const tick = () => {
    const now = new Date();
    el.clock.textContent = formatTime(now, true);
    el.dateLine.textContent = formatDateLong(now);
  };

  tick();
  clockTimer = setInterval(tick, 1000);
}

// ---------- Main refresh ----------
async function refreshAll(){
  // location line shown once (small)
  el.locationLine.textContent = settings.locationText;
  el.footerLocation.textContent = settings.locationText;
  el.weatherCity.textContent = settings.locationText;

  // Load prayers and weather in parallel
  await Promise.allSettled([
    loadPrayerTimes(),
    loadWeather()
  ]);

  // After prayers loaded, compute next + render
  if(prayerTimes){
    renderPrayerList();
    computeNextPrayerAndStartCountdown();
  }
}

// ---------- Prayer times (AlAdhan) ----------
async function loadPrayerTimes(){
  try{
    // Parse "City, Country"
    const parts = settings.locationText.split(",").map(x => x.trim()).filter(Boolean);
    const city = parts[0] || "Mecca";
    const country = parts.slice(1).join(", ") || "Saudi Arabia";

    const url = `https://api.aladhan.com/v1/timingsByCity?city=${encodeURIComponent(city)}&country=${encodeURIComponent(country)}&method=${encodeURIComponent(settings.method)}`;

    const res = await fetch(url);
    if(!res.ok) throw new Error("Failed prayer API");
    const json = await res.json();

    const t = json?.data?.timings;
    if(!t) throw new Error("No timings");

    // Keep only what we need
    prayerTimes = {
      Fajr: cleanTime(t.Fajr),
      Sunrise: cleanTime(t.Sunrise),
      Dhuhr: cleanTime(t.Dhuhr),
      Asr: cleanTime(t.Asr),
      Maghrib: cleanTime(t.Maghrib),
      Isha: cleanTime(t.Isha)
    };

    // Some APIs include timezone, but for simplicity we assume the tablet timezone matches the location.
    // (If you set location to a different country than the tablet timezone, countdown will be off.)
  } catch (e){
    prayerTimes = null;
    el.prayerList.innerHTML = `<div class="hint">Couldn’t load prayer times. Check your location text.</div>`;
    el.nextPrayerName.textContent = "—";
    el.countdown.textContent = "--:--:--";
  }
}

function renderPrayerList(){
  el.prayerList.innerHTML = "";

  // Fajr
  el.prayerList.appendChild(makePrayerRow("Fajr", prayerTimes.Fajr));
  // Sunrise line (latest time to pray Fajr)
  const sunrise = document.createElement("div");
  sunrise.className = "sunrise-row";
  sunrise.innerHTML = `<span>Shuruq (Sunrise)</span><span>${prayerTimes.Sunrise}</span>`;
  el.prayerList.appendChild(sunrise);

  // Others
  el.prayerList.appendChild(makePrayerRow("Dhuhr", prayerTimes.Dhuhr));
  el.prayerList.appendChild(makePrayerRow("Asr", prayerTimes.Asr));
  el.prayerList.appendChild(makePrayerRow("Maghrib", prayerTimes.Maghrib));
  el.prayerList.appendChild(makePrayerRow("Isha", prayerTimes.Isha));

  // Mark adhan icon based on settings
  el.prayerList.querySelectorAll("[data-prayer]").forEach(row => {
    const p = row.getAttribute("data-prayer");
    const icon = row.querySelector(".prayer-adhan");
    icon.textContent = settings.adhanEnabled[p] ? "🔊" : "🔈";
  });
}

function makePrayerRow(name, timeStr){
  const row = document.createElement("div");
  row.className = "prayer-row";
  row.setAttribute("data-prayer", name);
  row.innerHTML = `
    <div class="prayer-name">${name}</div>
    <div class="prayer-time">${timeStr}</div>
    <div class="prayer-adhan" title="Adhan setting"></div>
  `;
  return row;
}

function computeNextPrayerAndStartCountdown(){
  if(countdownTimer) clearInterval(countdownTimer);

  const now = new Date();

  // Build today’s schedule as Date objects (local timezone)
  const schedule = PRAYERS.map(p => ({
    name: p,
    date: dateAtTime(now, prayerTimes[p])
  }));

  // Find next
  let next = schedule.find(x => x.date > now);

  // If none left today, next is tomorrow Fajr
  if(!next){
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    next = { name: "Fajr", date: dateAtTime(tomorrow, prayerTimes.Fajr) };
  }

  nextPrayer = { name: next.name, dateObj: next.date, timeStr: formatTime(next.date, false) };
  el.nextPrayerName.textContent = nextPrayer.name;

  // highlight in list
  highlightActivePrayer(nextPrayer.name);

  // countdown tick
  const tick = () => {
    const now2 = new Date();
    let diffMs = nextPrayer.dateObj - now2;
    if(diffMs < 0) diffMs = 0;

    el.countdown.textContent = msToHHMMSS(diffMs);

    // Play adhan exactly when countdown hits 0 (once)
    if (diffMs === 0){
      maybePlayAdhanFor(nextPrayer.name);
      // Recompute next prayer after a short delay
      setTimeout(() => {
        computeNextPrayerAndStartCountdown();
      }, 1200);
    }
  };

  tick();
  countdownTimer = setInterval(tick, 1000);
}

function highlightActivePrayer(prayerName){
  // Remove active class from all
  document.querySelectorAll(".prayer-row").forEach(r => r.classList.remove("active"));

  // Add to the matching one (if present)
  const row = document.querySelector(`.prayer-row[data-prayer="${prayerName}"]`);
  if(row) row.classList.add("active");
}

// ---------- Adhan audio ----------
function getSelectedAdhanUrl(){
  const key = settings.voiceKey;
  const voice = ADHAN_VOICES.find(v => v.key === key);
  if(!voice) return "";
  if(key === "custom") return settings.customVoiceUrl || "";
  return voice.url;
}

function playAdhan(url){
  try{
    el.adhanAudio.pause();
    el.adhanAudio.currentTime = 0;
    el.adhanAudio.src = url;
    el.adhanAudio.play().catch(() => {
      alert("Audio blocked by browser. Tap the screen once, then try Test sound again.");
    });
  } catch {
    // ignore
  }
}

function stopAdhan(){
  el.adhanAudio.pause();
  el.adhanAudio.currentTime = 0;
}

function maybePlayAdhanFor(prayerName){
  if(!settings.adhanEnabled[prayerName]) return;

  const todayKey = new Date().toDateString();
  const uniqueKey = `${todayKey}::${prayerName}`;

  if(lastAdhanPlayedKey === uniqueKey) return; // already played
  lastAdhanPlayedKey = uniqueKey;

  const url = getSelectedAdhanUrl();
  if(!url) return;

  playAdhan(url);
}

// ---------- Weather (Open-Meteo) ----------
async function loadWeather(){
  try{
    // Geocode city string -> lat/lon
    const geoUrl = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(settings.locationText)}&count=1&language=en&format=json`;
    const gRes = await fetch(geoUrl);
    if(!gRes.ok) throw new Error("Geocode failed");
    const gJson = await gRes.json();
    const place = gJson?.results?.[0];
    if(!place) throw new Error("No geocode results");

    const lat = place.latitude;
    const lon = place.longitude;
    const displayName = [place.name, place.country].filter(Boolean).join(", ");
    el.weatherCity.textContent = displayName;
    el.locationLine.textContent = displayName;
    el.footerLocation.textContent = displayName;

    // Weather (current + hourly next hours)
    const wxUrl =
      `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
      `&current=temperature_2m,relative_humidity_2m,wind_speed_10m,weather_code` +
      `&hourly=temperature_2m,precipitation_probability,weather_code` +
      `&forecast_days=1&timezone=auto`;

    const wRes = await fetch(wxUrl);
    if(!wRes.ok) throw new Error("Weather failed");
    const wJson = await wRes.json();

    // Current
    const cur = wJson.current;
    el.tempNow.textContent = Math.round(cur.temperature_2m) + "°";
    el.humidityNow.textContent = Math.round(cur.relative_humidity_2m) + "%";
    el.windNow.textContent = Math.round(cur.wind_speed_10m) + " km/h";
    el.weatherDesc.textContent = weatherCodeToText(cur.weather_code);

    // Hourly next 4 slots (show time + temp + rain probability)
    const nowISO = cur.time;
    const times = wJson.hourly.time;
    const temps = wJson.hourly.temperature_2m;
    const rainP = wJson.hourly.precipitation_probability;
    const codes = wJson.hourly.weather_code;

    const startIndex = Math.max(0, times.findIndex(t => t >= nowISO));
    const slots = [];
    for(let i=0; i<4; i++){
      const idx = startIndex + i*3; // every 3 hours like your screenshot feel
      if(idx >= times.length) break;
      slots.push({
        timeISO: times[idx],
        temp: temps[idx],
        rain: rainP[idx],
        code: codes[idx]
      });
    }

    el.hourlyStrip.innerHTML = "";
    slots.forEach(s => {
      const d = new Date(s.timeISO);
      const card = document.createElement("div");
      card.className = "hour-card";
      card.innerHTML = `
        <div class="hour-time">${formatHourOnly(d)}</div>
        <div class="hour-temp">${Math.round(s.temp)}°</div>
        <div class="hour-rain">💧 ${Math.round(s.rain)}%</div>
      `;
      el.hourlyStrip.appendChild(card);
    });

  } catch (e){
    // Weather failure should not kill the app
    el.tempNow.textContent = "--°";
    el.weatherDesc.textContent = "Weather unavailable";
    el.humidityNow.textContent = "--%";
    el.windNow.textContent = "-- km/h";
    el.hourlyStrip.innerHTML = "";
  }
}

// ---------- Helpers ----------
function cleanTime(t){
  // API sometimes returns "04:34 (AST)" or "04:34"
  return String(t).split(" ")[0].trim();
}

function dateAtTime(baseDate, hhmm){
  const [hh, mm] = hhmm.split(":").map(Number);
  const d = new Date(baseDate);
  d.setHours(hh, mm, 0, 0);
  return d;
}

function msToHHMMSS(ms){
  const total = Math.floor(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;

  return `${pad2(h)}:${pad2(m)}:${pad2(s)}`;
}

function pad2(n){ return String(n).padStart(2, "0"); }

function formatTime(date, includeSeconds){
  const opts = { hour: "2-digit", minute: "2-digit" };
  if(includeSeconds) opts.second = "2-digit";
  return new Intl.DateTimeFormat(undefined, opts).format(date);
}

function formatHourOnly(date){
  // shows like "23:00"
  return new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit" }).format(date);
}

function formatDateLong(date){
  return new Intl.DateTimeFormat(undefined, {
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric"
  }).format(date);
}

function weatherCodeToText(code){
  // Basic mapping
  if(code === 0) return "Clear";
  if([1,2,3].includes(code)) return "Partly Cloudy";
  if([45,48].includes(code)) return "Fog";
  if([51,53,55,56,57].includes(code)) return "Drizzle";
  if([61,63,65,66,67].includes(code)) return "Rain";
  if([71,73,75,77].includes(code)) return "Snow";
  if([80,81,82].includes(code)) return "Showers";
  if([95,96,99].includes(code)) return "Thunderstorm";
  return "Weather";
}
