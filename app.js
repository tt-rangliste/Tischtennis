/* ═══════════════════════════════════════════════════════════════════
   🏓 Tischtennis ELO – app.js
   Daten werden in Firebase gespeichert (Echtzeit, alle Geräte sync).
═══════════════════════════════════════════════════════════════════ */

const START_ELO  = 1000;
const K          = 32;
const MAX_DELTA  = 20;

// ── Firebase Daten ────────────────────────────────────────────────
// Startzustand – wird beim Laden von Firebase überschrieben
let daten = { spieler: {}, spiele: [], turniere: [], eloEvents: [], pins: { admin: null, spieler: {} } };
let _firebaseRef = null;   // wird gesetzt sobald Firebase bereit ist
let _isLoading   = true;   // zeigt Ladeindikator solange Firebase lädt

// Wird aufgerufen sobald Firebase neue Daten liefert (auch vom eigenen Gerät)
let _ignoreNextUpdate = false;
function onFirebaseDaten(snapshot) {
  if (_ignoreNextUpdate) { _ignoreNextUpdate = false; return; }
  const remote = snapshot.val();
  if (remote) {
    daten = remote;
    // Sicherstellen dass alles Arrays/Objekte sind und nicht null
    daten.spieler    = daten.spieler    ? daten.spieler    : {};
    daten.spiele     = daten.spiele     ? Object.values(daten.spiele)   : [];
    daten.turniere   = daten.turniere   ? Object.values(daten.turniere) : [];
    daten.eloEvents  = daten.eloEvents  ? Object.values(daten.eloEvents): [];
    if (!daten.pins)         daten.pins         = { admin: null, spieler: {} };
    if (!daten.pins.spieler) daten.pins.spieler = {};
  } else {
    // Noch keine Daten in Firebase — leere Struktur verwenden
    daten = { spieler: {}, spiele: [], turniere: [], eloEvents: [], pins: { admin: null, spieler: {} } };
  }
  if (_isLoading) {
    _isLoading = false;
    document.getElementById("loadingOverlay")?.remove();
    initAdminPin();
  }
  renderAll();
}

function renderAll() {
  fuelleSelects();
  renderRangliste();
  renderPlayerList();
  renderVerlauf();
  updateHeaderStats();
  renderTurnierListe();
}

// Firebase wird von index.html initialisiert und ruft initFirebase() auf
function initFirebase(database) {
  _firebaseRef = database.ref("tt_daten");
  _firebaseRef.on("value", onFirebaseDaten, err => {
    console.error("Firebase Lesefehler:", err);
    document.getElementById("loadingOverlay")?.remove();
    _isLoading = false;
  });
}

// speichereDaten überschrieben für Firebase compat SDK
function speichereDaten() {
  if (!_firebaseRef) return;
  const clean = JSON.parse(JSON.stringify(daten));
  _firebaseRef.set(clean).catch(err => console.error("Firebase Schreibfehler:", err));
}

// ── Hashing ───────────────────────────────────────────────────────
async function hashPin(pin) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode("tt_salt_" + pin));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2,"0")).join("");
}
async function pinKorrekt(pin, hash) {
  if (!hash) return false;
  return (await hashPin(pin)) === hash;
}

// Admin-PIN: Default "4321" falls noch kein PIN gesetzt
async function initAdminPin() {
  if (!daten.pins.admin) {
    daten.pins.admin = await hashPin("4321");
    speichereDaten();
  }
}

function spielerPinGesetzt(k) { return !!(daten.pins?.spieler?.[k]); }

// ── Modal ─────────────────────────────────────────────────────────
function showModal(content) {
  document.getElementById("pinModalContent").innerHTML = content;
  document.getElementById("pinModal").classList.add("open");
}
function closeModal() {
  document.getElementById("pinModal").classList.remove("open");
}
document.getElementById("closePinModal").addEventListener("click", closeModal);
document.getElementById("pinModal").addEventListener("click", e => {
  if (e.target === document.getElementById("pinModal")) closeModal();
});

// ── Seitenmenü (Settings Drawer) ──────────────────────────────────
document.getElementById("btnSettings").addEventListener("click", () => {
  document.getElementById("settingsDrawer").classList.add("open");
  document.getElementById("drawerOverlay").classList.add("open");
});
document.getElementById("btnCloseDrawer").addEventListener("click", closeDrawer);
document.getElementById("drawerOverlay").addEventListener("click", closeDrawer);
function closeDrawer() {
  document.getElementById("settingsDrawer").classList.remove("open");
  document.getElementById("drawerOverlay").classList.remove("open");
}

// ── PWA Install ───────────────────────────────────────────────────
let _installPrompt = null;

window.addEventListener("beforeinstallprompt", e => {
  e.preventDefault();
  _installPrompt = e;
  const btn  = document.getElementById("btnInstallApp");
  const hint = document.getElementById("installAppHint");
  const sub  = document.getElementById("installAppSub");
  if (btn)  btn.style.display  = "block";
  if (hint) hint.textContent   = "Diese Website kann als App installiert werden:";
  if (sub)  sub.textContent    = "";
});

window.addEventListener("appinstalled", () => {
  const btn  = document.getElementById("btnInstallApp");
  const hint = document.getElementById("installAppHint");
  if (btn)  btn.style.display = "none";
  if (hint) hint.textContent  = "✅ App wurde installiert!";
  _installPrompt = null;
});

document.getElementById("btnInstallApp")?.addEventListener("click", async () => {
  if (!_installPrompt) return;
  _installPrompt.prompt();
  const result = await _installPrompt.userChoice;
  if (result.outcome === "accepted") {
    document.getElementById("btnInstallApp").style.display = "none";
    document.getElementById("installAppHint").textContent  = "✅ App wird installiert …";
  }
  _installPrompt = null;
});

// iOS-Hinweis (Safari unterstützt beforeinstallprompt nicht)
const isIos = /iphone|ipad|ipod/i.test(navigator.userAgent);
const isInStandalone = window.navigator.standalone === true;
if (isIos && !isInStandalone) {
  const hint = document.getElementById("installAppHint");
  const sub  = document.getElementById("installAppSub");
  if (hint) hint.textContent = "iPhone/iPad — so installieren:";
  if (sub)  sub.innerHTML    = "1. Tippe auf das <strong>Teilen-Symbol</strong> (↑) in Safari<br>2. Wähle <strong>\"Zum Home-Bildschirm\"</strong>";
}

// Admin-PIN ändern (aus Drawer)
document.getElementById("btnChangeAdminPin").addEventListener("click", () => {
  showModal(`
    <div class="pin-modal-title">🔑 Admin-PIN ändern</div>
    <div class="pin-modal-sub">Gib zuerst den aktuellen PIN ein, dann den neuen.</div>
    <label class="pin-field-label">Aktueller PIN</label>
    <input type="password" id="pmOldPin" class="pin-input" placeholder="Aktueller Admin-PIN …" maxlength="20" autofocus/>
    <label class="pin-field-label" style="margin-top:10px">Neuer PIN</label>
    <input type="password" id="pmNewPin" class="pin-input" placeholder="Neuer PIN …" maxlength="20"/>
    <input type="password" id="pmNewPin2" class="pin-input" placeholder="Neuen PIN wiederholen …" maxlength="20" style="margin-top:6px"/>
    <div class="toast" id="pmToast"></div>
    <button class="btn-primary" style="margin-top:14px;width:100%" id="pmConfirmBtn">SPEICHERN</button>
  `);
  setTimeout(() => document.getElementById("pmOldPin")?.focus(), 50);
  const confirm = async () => {
    const oldPin  = document.getElementById("pmOldPin").value;
    const newPin  = document.getElementById("pmNewPin").value;
    const newPin2 = document.getElementById("pmNewPin2").value;
    if (!await pinKorrekt(oldPin, daten.pins.admin)) {
      showToast("pmToast","❌ Aktueller PIN falsch.","error"); return;
    }
    if (!newPin) { showToast("pmToast","❌ Neuer PIN darf nicht leer sein.","error"); return; }
    if (newPin !== newPin2) { showToast("pmToast","❌ Neue PINs stimmen nicht überein.","error"); return; }
    daten.pins.admin = await hashPin(newPin);
    speichereDaten();
    closeModal();
    showToast("settingsToast", "✅ Admin-PIN erfolgreich geändert.");
  };
  document.getElementById("pmConfirmBtn").addEventListener("click", confirm);
  document.getElementById("pmNewPin2").addEventListener("keydown", e => { if (e.key==="Enter") confirm(); });
});

// ── ELO ───────────────────────────────────────────────────────────
function erwartet(a, b) { return 1 / (1 + Math.pow(10, (b - a) / 400)); }
function neueElo(elo, erw, ergebnis) {
  const d = K * (ergebnis - erw);
  return Math.round((elo + Math.max(-MAX_DELTA, Math.min(MAX_DELTA, d))) * 10) / 10;
}

// ── Hilfsfunktionen ───────────────────────────────────────────────
const key = name => name.trim().toLowerCase();
function formatDatum() {
  const d = new Date();
  return d.toLocaleDateString("de-DE") + " " + d.toTimeString().slice(0, 5);
}
function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
function nextPow2(n) { let p = 1; while (p < n) p *= 2; return p; }
function spielerName(k) { return daten.spieler[k]?.name || k; }
function showToast(id, msg, type = "success") {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = msg;
  el.className = `toast show ${type}`;
  setTimeout(() => el.className = "toast", 3500);
}

// ── Turnierpunkte Tabelle ──────────────────────────────────────────
function getPrizes(n) {
  if (n < 8)  return [20, 12, 6];
  if (n < 12) return [30, 20, 10];
  if (n < 16) return [40, 25, 12];
  if (n < 20) return [50, 30, 15];
  if (n < 24) return [55, 33, 16];
  if (n < 32) return [65, 38, 18];
  return [80, 45, 22];
}

// ── Selects befüllen ──────────────────────────────────────────────
function fuelleSelects() {
  const ids = ["playerASelect","playerBSelect","previewA","previewB","h2hA","h2hB"];
  const sorted = Object.values(daten.spieler).sort((a, b) => a.name.localeCompare(b.name));
  ids.forEach(id => {
    const sel = document.getElementById(id);
    if (!sel) return;
    const cur = sel.value;
    sel.innerHTML = `<option value="">— Spieler wählen —</option>`;
    sorted.forEach(s => {
      const o = document.createElement("option");
      o.value = key(s.name);
      o.textContent = `${s.name} (${s.elo})`;
      sel.appendChild(o);
    });
    sel.value = cur;
  });
}

// ── Header Stats ──────────────────────────────────────────────────
function updateHeaderStats() {
  document.getElementById("totalPlayers").textContent = Object.keys(daten.spieler).length;
  document.getElementById("totalGames").textContent   = daten.spiele.length;
}

// ════════════════════════════════════════════════════════════════════
// RANGLISTE
// ════════════════════════════════════════════════════════════════════
function renderRangliste() {
  const body  = document.getElementById("rankBody");
  const empty = document.getElementById("rankEmpty");
  const sorted = Object.values(daten.spieler).sort((a, b) => b.elo - a.elo);

  if (!sorted.length) { body.innerHTML = ""; empty.style.display = "block"; return; }
  empty.style.display = "none";

  body.innerHTML = sorted.map((s, i) => {
    const winrate = s.spiele > 0 ? ((s.siege / s.spiele) * 100).toFixed(1) : "0.0";
    const wr = parseFloat(winrate);
    const wrClass = wr >= 90 ? "wr-5" : wr >= 70 ? "wr-4" : wr >= 50 ? "wr-3" : wr >= 30 ? "wr-2" : "wr-1";
    const pd = s.punktdifferenz || 0;
    const pdStr = (pd >= 0 ? "+" : "") + pd;
    const pdClass = pd > 0 ? "pd-pos" : pd < 0 ? "pd-neg" : "pd-zero";
    const avgPkt = s.gesamtSpiele > 0 ? (s.gesamtPunkte / s.gesamtSpiele).toFixed(1) : "—";
    const tp = s.turnierPunkte || 0;
    const medal = i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : i + 1;
    const rankClass = i < 3 ? `rank-${i+1}` : "";
    return `<tr class="${rankClass}" onclick="openDetail('${key(s.name)}')">
      <td>${medal}</td>
      <td>${s.name}</td>
      <td class="elo-cell">${s.elo}</td>
      <td>${s.siege}</td>
      <td>${s.niederlagen}</td>
      <td class="${wrClass}">${winrate}%</td>
      <td class="${pdClass}">${pdStr}</td>
      <td>${avgPkt}</td>
      <td class="tp-cell">${tp > 0 ? tp : "—"}</td>
    </tr>`;
  }).join("");
}

// ════════════════════════════════════════════════════════════════════
// SPIELER HINZUFÜGEN
// ════════════════════════════════════════════════════════════════════
document.getElementById("addPlayerBtn").addEventListener("click", async () => {
  const name = document.getElementById("newPlayerName").value.trim();
  const pw   = document.getElementById("newPlayerPw").value;
  if (!name) { showToast("playerToast","❌ Bitte einen Namen eingeben.","error"); return; }
  if (!pw)   { showToast("playerToast","❌ Bitte das Schulpasswort eingeben.","error"); return; }
  const k = key(name);
  if (daten.spieler[k]) { showToast("playerToast",`⚠️ '${name}' existiert bereits.`,"error"); return; }

  daten.spieler[k] = {
    name, elo: START_ELO, siege: 0, niederlagen: 0, spiele: 0,
    punktdifferenz: 0, gesamtPunkte: 0, gesamtSpiele: 0, turnierPunkte: 0
  };
  if (!daten.pins) daten.pins = { admin: null, spieler: {} };
  if (!daten.pins.spieler) daten.pins.spieler = {};
  daten.pins.spieler[k] = await hashPin(pw);

  speichereDaten();
  document.getElementById("newPlayerName").value = "";
  document.getElementById("newPlayerPw").value   = "";
  fuelleSelects(); renderRangliste(); renderPlayerList(); updateHeaderStats();
  renderTurnierSetup();
  showToast("playerToast", `✅ '${name}' hinzugefügt (ELO: ${START_ELO}).`);
});
document.getElementById("newPlayerName").addEventListener("keydown", e => {
  if (e.key === "Enter") document.getElementById("newPlayerPw").focus();
});
document.getElementById("newPlayerPw").addEventListener("keydown", e => {
  if (e.key === "Enter") document.getElementById("addPlayerBtn").click();
});

// ════════════════════════════════════════════════════════════════════
// SPIELER LISTE
// ════════════════════════════════════════════════════════════════════
function renderPlayerList() {
  const list   = document.getElementById("playerList");
  const sorted = Object.values(daten.spieler).sort((a, b) => b.elo - a.elo);
  if (!sorted.length) { list.innerHTML = `<p style="color:var(--muted);font-family:var(--font-mono);font-size:.8rem;padding:20px 0">Noch keine Spieler.</p>`; return; }
  list.innerHTML = sorted.map(s => {
    const winrate = s.spiele > 0 ? ((s.siege / s.spiele) * 100).toFixed(1) : "0.0";
    const avgPkt  = s.gesamtSpiele > 0 ? (s.gesamtPunkte / s.gesamtSpiele).toFixed(1) : "—";
    return `<div class="player-chip" onclick="openDetail('${key(s.name)}')">
      <div class="player-chip-name">${s.name}</div>
      <div class="player-chip-elo">${s.elo}</div>
      <div class="player-chip-stats">${s.siege}S / ${s.niederlagen}N · ${winrate}% · Ø${avgPkt}</div>
    </div>`;
  }).join("");
}

// ════════════════════════════════════════════════════════════════════
// SPIELER DETAIL
// ════════════════════════════════════════════════════════════════════
function openDetail(k) {
  const s = daten.spieler[k];
  if (!s) return;
  const winrate = s.spiele > 0 ? ((s.siege / s.spiele) * 100).toFixed(1) : "0.0";
  const pd = s.punktdifferenz || 0;
  const pdStr   = (pd >= 0 ? "+" : "") + pd;
  const pdColor = pd > 0 ? "var(--accent)" : pd < 0 ? "var(--red)" : "var(--muted)";
  const avgPkt  = s.gesamtSpiele > 0 ? (s.gesamtPunkte / s.gesamtSpiele).toFixed(1) : "—";
  const tp = s.turnierPunkte || 0;

  const verlauf = daten.spiele.filter(sp =>
    sp.sieger.toLowerCase() === k || sp.verlierer.toLowerCase() === k
  ).slice(-5).reverse();

  const turnierGames = [];
  daten.turniere.forEach(t => {
    getTurnierAlleSpiele(t).forEach(sp => {
      if (sp.sieger === k || sp.verlierer === k)
        turnierGames.push({ ...sp, turnierName: t.name });
    });
  });
  const turnierVerlauf = turnierGames.slice(-5).reverse();

  const histRegular = verlauf.length ? verlauf.map(sp => {
    const isWin = sp.sieger.toLowerCase() === k;
    const delta = isWin
      ? Math.round((sp.elo_sieger_nachher   - sp.elo_sieger_vorher)   * 10) / 10
      : Math.round((sp.elo_verlierer_nachher - sp.elo_verlierer_vorher) * 10) / 10;
    const opp   = isWin ? sp.verlierer : sp.sieger;
    const score = sp.score_sieger != null
      ? `<span style="font-family:var(--font-mono);font-size:.72rem;color:var(--muted)">${isWin ? sp.score_sieger+":"+sp.score_verlierer : sp.score_verlierer+":"+sp.score_sieger}</span>` : "";
    return `<div class="history-item ${isWin?"win":"loss"}">
      <span>${isWin?"✅":"❌"} vs ${opp} ${score}</span>
      <span class="history-result">${delta>=0?"+":""}${delta} ELO</span>
      <span class="history-date">${sp.datum}</span>
    </div>`;
  }).join("") : "";

  const histTurnier = turnierVerlauf.length ? `
    <div class="detail-history-title" style="margin-top:16px">Turnierspiele (letzte 5)</div>
    ${turnierVerlauf.map(sp => {
      const isWin = sp.sieger === k;
      const opp   = isWin ? sp.verlierer : sp.sieger;
      const score = sp.scoreW != null
        ? `<span style="font-family:var(--font-mono);font-size:.72rem;color:var(--muted)">${isWin ? sp.scoreW+":"+sp.scoreL : sp.scoreL+":"+sp.scoreW}</span>` : "";
      return `<div class="history-item ${isWin?"win":"loss"} turnier-game">
        <span>${isWin?"✅":"❌"} vs ${spielerName(opp)} ${score}</span>
        <span class="turnier-badge">${sp.turnierName}</span>
        <span class="history-date">${sp.datum}</span>
      </div>`;
    }).join("")}` : "";

  document.getElementById("detailContent").innerHTML = `
    <div class="detail-name">${s.name}</div>
    <div class="detail-elo-big">${s.elo} <span style="font-size:1.2rem;color:var(--muted)">ELO</span></div>
    <div class="detail-stats-row">
      <div class="dstat"><span class="dstat-val">${s.spiele}</span><span class="dstat-label">Spiele</span></div>
      <div class="dstat"><span class="dstat-val" style="color:var(--accent)">${s.siege}</span><span class="dstat-label">Siege</span></div>
      <div class="dstat"><span class="dstat-val" style="color:var(--red)">${s.niederlagen}</span><span class="dstat-label">Niederlagen</span></div>
      <div class="dstat"><span class="dstat-val">${winrate}%</span><span class="dstat-label">Win%</span></div>
      <div class="dstat"><span class="dstat-val" style="color:${pdColor}">${pdStr}</span><span class="dstat-label">+/−</span></div>
      <div class="dstat"><span class="dstat-val">${avgPkt}</span><span class="dstat-label">Ø Pkt</span></div>
      ${tp > 0 ? `<div class="dstat"><span class="dstat-val" style="color:#ffd700">${tp}</span><span class="dstat-label">🏅 Pkt</span></div>` : ""}
    </div>
    <div class="detail-history-title">Letzte Spiele (Regulär)</div>
    ${histRegular || `<p style="color:var(--muted);font-size:.8rem;font-family:var(--font-mono)">Noch keine Spiele.</p>`}
    ${histTurnier}
    <div style="margin-top:24px;padding-top:16px;border-top:1px solid var(--border);display:flex;flex-direction:column;gap:10px">
      <button class="btn-small" style="width:100%" onclick="resetSpielerPasswort('${k}')">🔑 Passwort zurücksetzen (Admin)</button>
      <button class="btn-danger" style="width:100%" onclick="deletePlayerWithConfirm('${k}')">🗑️ Spieler löschen</button>
    </div>
  `;
  document.getElementById("detailOverlay").classList.add("open");
}

function resetSpielerPasswort(k) {
  const s = daten.spieler[k];
  if (!s) return;
  showModal(`
    <div class="pin-modal-title">🔑 Passwort zurücksetzen</div>
    <div class="pin-modal-sub">Passwort von <strong style="color:var(--text)">${s.name}</strong> zurücksetzen. Nur mit Admin-PIN möglich.</div>
    <label class="pin-field-label">Admin-PIN</label>
    <input type="password" id="pmAdminPin" class="pin-input" placeholder="Admin-PIN …" maxlength="20" autofocus/>
    <label class="pin-field-label" style="margin-top:12px">Neues Schulpasswort für ${s.name}</label>
    <input type="password" id="pmNewPw" class="pin-input" placeholder="Neues Passwort …" maxlength="30"/>
    <input type="password" id="pmNewPw2" class="pin-input" placeholder="Wiederholen …" maxlength="30" style="margin-top:6px"/>
    <div class="toast" id="pmToast"></div>
    <button class="btn-primary" style="margin-top:14px;width:100%" id="pmConfirmBtn">PASSWORT SETZEN</button>
  `);
  setTimeout(() => document.getElementById("pmAdminPin")?.focus(), 50);
  const confirm = async () => {
    const adminPin = document.getElementById("pmAdminPin").value;
    const newPw    = document.getElementById("pmNewPw").value;
    const newPw2   = document.getElementById("pmNewPw2").value;
    if (!await pinKorrekt(adminPin, daten.pins.admin)) {
      showToast("pmToast","❌ Falscher Admin-PIN.","error"); return;
    }
    if (!newPw) { showToast("pmToast","❌ Neues Passwort darf nicht leer sein.","error"); return; }
    if (newPw !== newPw2) { showToast("pmToast","❌ Passwörter stimmen nicht überein.","error"); return; }
    daten.pins.spieler[k] = await hashPin(newPw);
    speichereDaten();
    closeModal();
    showToast("playerToast", `✅ Passwort von ${s.name} wurde zurückgesetzt.`);
  };
  document.getElementById("pmConfirmBtn").addEventListener("click", confirm);
  document.getElementById("pmNewPw2").addEventListener("keydown", e => { if(e.key==="Enter") confirm(); });
}

function deletePlayerWithConfirm(k) {
  const s = daten.spieler[k];
  if (!s) return;
  showModal(`
    <div class="pin-modal-title">🗑️ Spieler löschen</div>
    <div class="pin-modal-sub">Um <strong style="color:var(--text)">${s.name}</strong> zu löschen, gib den Admin-PIN ein. Diese Aktion kann nicht rückgängig gemacht werden.</div>
    <label class="pin-field-label">Admin-PIN</label>
    <input type="password" id="pmAdminPin" class="pin-input" placeholder="Admin-PIN …" maxlength="20" autofocus/>
    <div class="toast" id="pmToast"></div>
    <button class="btn-danger" style="margin-top:14px;width:100%" id="pmConfirmBtn">ENDGÜLTIG LÖSCHEN</button>
  `);
  setTimeout(() => document.getElementById("pmAdminPin")?.focus(), 50);
  const confirm = async () => {
    const pin = document.getElementById("pmAdminPin").value;
    if (!await pinKorrekt(pin, daten.pins.admin)) {
      showToast("pmToast","❌ Falscher Admin-PIN.","error"); return;
    }
    delete daten.spieler[k];
    if (daten.pins?.spieler?.[k]) delete daten.pins.spieler[k];
    speichereDaten();
    closeModal();
    document.getElementById("detailOverlay").classList.remove("open");
    fuelleSelects(); renderRangliste(); renderPlayerList(); updateHeaderStats();
    renderTurnierSetup();
  };
  document.getElementById("pmConfirmBtn").addEventListener("click", confirm);
  document.getElementById("pmAdminPin").addEventListener("keydown", e => { if(e.key==="Enter") confirm(); });
}

document.getElementById("closeDetail").addEventListener("click", () =>
  document.getElementById("detailOverlay").classList.remove("open"));
document.getElementById("detailOverlay").addEventListener("click", e => {
  if (e.target === document.getElementById("detailOverlay"))
    document.getElementById("detailOverlay").classList.remove("open");
});

// ════════════════════════════════════════════════════════════════════
// MATCH EINTRAGEN
// ════════════════════════════════════════════════════════════════════
const playerASel = document.getElementById("playerASelect");
const playerBSel = document.getElementById("playerBSelect");
const scoreAEl   = document.getElementById("scoreA");
const scoreBEl   = document.getElementById("scoreB");

function updateMatchCards() {
  const aKey = playerASel.value, bKey = playerBSel.value;
  const sA = parseInt(scoreAEl.value), sB = parseInt(scoreBEl.value);
  const preview = document.getElementById("matchPreview");
  const cardA = document.getElementById("playerACard"), cardB = document.getElementById("playerBCard");
  const eloA  = document.getElementById("playerAElo"),  eloB  = document.getElementById("playerBElo");

  eloA.textContent = aKey && daten.spieler[aKey] ? daten.spieler[aKey].elo + " ELO" : "— ELO";
  eloB.textContent = bKey && daten.spieler[bKey] ? daten.spieler[bKey].elo + " ELO" : "— ELO";
  cardA.classList.remove("selected-winner","selected-loser");
  cardB.classList.remove("selected-winner","selected-loser");

  if (!aKey || !bKey || aKey === bKey) {
    preview.textContent = aKey && bKey && aKey === bKey ? "⚠️ Bitte zwei verschiedene Spieler wählen." : "Wähle beide Spieler und trage das Ergebnis ein …";
    updatePinFields(null, null);
    return;
  }
  const a = daten.spieler[aKey], b = daten.spieler[bKey];
  const erw = erwartet(a.elo, b.elo);
  const gainA = Math.min(MAX_DELTA, Math.max(1, Math.round(K * (1 - erw))));
  const gainB = Math.min(MAX_DELTA, Math.max(1, Math.round(K * erw)));
  const both  = scoreAEl.value !== "" && scoreBEl.value !== "" && !isNaN(sA) && !isNaN(sB);

  if (both && sA === sB) { preview.textContent = "⚠️ Unentschieden nicht möglich."; }
  else if (both && sA > sB) {
    cardA.classList.add("selected-winner"); cardB.classList.add("selected-loser");
    preview.textContent = `🏆 ${a.name} gewinnt ${sA}:${sB} (+${sA-sB}) — ELO: ${a.name} +${gainA} | ${b.name} -${gainB}`;
  } else if (both && sB > sA) {
    cardB.classList.add("selected-winner"); cardA.classList.add("selected-loser");
    preview.textContent = `🏆 ${b.name} gewinnt ${sB}:${sA} (+${sB-sA}) — ELO: ${b.name} +${gainB} | ${a.name} -${gainA}`;
  } else {
    preview.textContent = `Bei Sieg von ${a.name}: +${gainA} ELO | Bei Sieg von ${b.name}: +${gainB} ELO`;
  }

  updatePinFields(aKey, bKey);
}

function updatePinFields(aKey, bKey) {
  const wrap  = document.getElementById("pinConfirmWrap");
  const nameA = document.getElementById("pinLabelA");
  const nameB = document.getElementById("pinLabelB");
  if (!wrap) return;
  // Immer zeigen wenn beide Spieler gewählt (normale Spiele zählen immer)
  if (aKey && bKey && aKey !== bKey) {
    wrap.style.display = "block";
    if (nameA) nameA.textContent = `Code von ${spielerName(aKey)}`;
    if (nameB) nameB.textContent = `Code von ${spielerName(bKey)}`;
  } else {
    wrap.style.display = "none";
  }
}

playerASel.addEventListener("change", updateMatchCards);
playerBSel.addEventListener("change", updateMatchCards);
scoreAEl.addEventListener("input", updateMatchCards);
scoreBEl.addEventListener("input", updateMatchCards);

document.getElementById("submitMatch").addEventListener("click", async () => {
  const aKey = playerASel.value, bKey = playerBSel.value;
  const sA = parseInt(scoreAEl.value), sB = parseInt(scoreBEl.value);
  if (!aKey || !bKey) { showToast("matchToast","❌ Bitte beide Spieler auswählen.","error"); return; }
  if (aKey === bKey)  { showToast("matchToast","❌ Bitte verschiedene Spieler.","error"); return; }
  if (scoreAEl.value==="" || scoreBEl.value==="" || isNaN(sA) || isNaN(sB)) { showToast("matchToast","❌ Bitte gültiges Ergebnis eingeben.","error"); return; }
  if (sA === sB) { showToast("matchToast","❌ Unentschieden nicht möglich.","error"); return; }

  // Beide Spieler müssen ihren Code eingeben
  const pinA = document.getElementById("matchPinA")?.value || "";
  const pinB = document.getElementById("matchPinB")?.value || "";
  if (!pinA) { showToast("matchToast",`❌ Code von ${spielerName(aKey)} fehlt.`,"error"); return; }
  if (!pinB) { showToast("matchToast",`❌ Code von ${spielerName(bKey)} fehlt.`,"error"); return; }
  if (!await pinKorrekt(pinA, daten.pins.spieler[aKey])) {
    showToast("matchToast",`❌ Code von ${spielerName(aKey)} ist falsch.`,"error");
    document.getElementById("matchPinA").value = ""; return;
  }
  if (!await pinKorrekt(pinB, daten.pins.spieler[bKey])) {
    showToast("matchToast",`❌ Code von ${spielerName(bKey)} ist falsch.`,"error");
    document.getElementById("matchPinB").value = ""; return;
  }
  document.getElementById("matchPinA").value = "";
  document.getElementById("matchPinB").value = "";

  doSubmitMatch(aKey, bKey, sA, sB);
});

function doSubmitMatch(aKey, bKey, sA, sB) {
  const siegerKey      = sA > sB ? aKey : bKey;
  const verliererKey   = sA > sB ? bKey : aKey;
  const siegerScore    = sA > sB ? sA : sB;
  const verliererScore = sA > sB ? sB : sA;
  const diff = siegerScore - verliererScore;

  const s = daten.spieler[siegerKey], v = daten.spieler[verliererKey];
  const eloSOld = s.elo, eloVOld = v.elo;
  const erw = erwartet(eloSOld, eloVOld);

  s.elo = neueElo(eloSOld, erw, 1);  v.elo = neueElo(eloVOld, 1 - erw, 0);
  s.siege += 1; s.spiele += 1; v.niederlagen += 1; v.spiele += 1;
  if (!s.punktdifferenz) s.punktdifferenz = 0;
  if (!v.punktdifferenz) v.punktdifferenz = 0;
  s.punktdifferenz += diff; v.punktdifferenz -= diff;
  if (!s.gesamtPunkte) s.gesamtPunkte = 0;
  if (!v.gesamtPunkte) v.gesamtPunkte = 0;
  if (!s.gesamtSpiele) s.gesamtSpiele = 0;
  if (!v.gesamtSpiele) v.gesamtSpiele = 0;
  s.gesamtPunkte += siegerScore; v.gesamtPunkte += verliererScore;
  s.gesamtSpiele += 1; v.gesamtSpiele += 1;

  const deltaS = Math.round((s.elo - eloSOld)*10)/10;

  daten.spiele.push({
    ts: Date.now(),
    datum: formatDatum(), sieger: s.name, verlierer: v.name,
    score_sieger: siegerScore, score_verlierer: verliererScore,
    elo_sieger_vorher: eloSOld, elo_verlierer_vorher: eloVOld,
    elo_sieger_nachher: s.elo, elo_verlierer_nachher: v.elo,
  });

  speichereDaten();
  scoreAEl.value = ""; scoreBEl.value = "";
  fuelleSelects(); renderRangliste(); renderPlayerList(); renderVerlauf(); updateHeaderStats(); updateMatchCards();
  showToast("matchToast", `🏆 ${s.name} gewinnt ${siegerScore}:${verliererScore}! +${deltaS} → ${s.elo} ELO`);
}

// ════════════════════════════════════════════════════════════════════
// VERLAUF
// ════════════════════════════════════════════════════════════════════
function renderVerlauf() {
  const log   = document.getElementById("gameLog");
  const empty = document.getElementById("logEmpty");
  if (!log) return;

  try {
    // Reguläre Spiele
    const allSpiele = daten.spiele.map(sp => ({
      ts: sp.ts || 0,
      datum: sp.datum,
      sieger: sp.sieger,
      verlierer: sp.verlierer,
      score_sieger: sp.score_sieger,
      score_verlierer: sp.score_verlierer,
      elo_sieger_vorher: sp.elo_sieger_vorher,
      elo_sieger_nachher: sp.elo_sieger_nachher,
      isTurnier: false
    }));

    // Turnierspiele (nur echte, kein Freilos)
    daten.turniere.forEach(t => {
      getTurnierAlleSpiele(t).forEach((sp, i) => {
        if (!sp.sieger || !sp.verlierer) return;
        allSpiele.push({
          ts: sp.ts || (t.id + i),
          datum: sp.datum || "",
          sieger: spielerName(sp.sieger),
          verlierer: spielerName(sp.verlierer),
          score_sieger: sp.scoreW != null ? sp.scoreW : sp.score_sieger,
          score_verlierer: sp.scoreL != null ? sp.scoreL : sp.score_verlierer,
          isTurnier: true,
          turnierName: t.name
        });
      });
    });

    // Nach Timestamp sortieren (neueste zuerst)
    allSpiele.sort((a, b) => b.ts - a.ts);

    if (!allSpiele.length) {
      log.innerHTML = "";
      empty.style.display = "block";
      return;
    }
    empty.style.display = "none";

    log.innerHTML = allSpiele.map(sp => {
      const score = sp.score_sieger != null
        ? `<span class="log-score">${sp.score_sieger}:${sp.score_verlierer}</span>` : "";
      const badge = sp.isTurnier
        ? `<span class="turnier-badge">${sp.turnierName}</span>` : "";
      const delta = !sp.isTurnier && sp.elo_sieger_nachher != null
        ? `<span class="log-delta">+${Math.round((sp.elo_sieger_nachher - sp.elo_sieger_vorher) * 10) / 10} ELO</span>` : "";
      return `<div class="log-item ${sp.isTurnier ? "log-turnier" : ""}">
        <span class="log-date">${sp.datum || ""}</span>
        <div class="log-match">
          <span class="log-winner">🏆 ${sp.sieger}</span>
          ${score} ${badge}
          <span style="color:var(--border)">vs</span>
          <span class="log-loser">${sp.verlierer}</span>
        </div>
        ${delta}
      </div>`;
    }).join("");
  } catch (err) {
    console.error("renderVerlauf Fehler:", err);
    log.innerHTML = `<p style="color:var(--red);font-family:var(--font-mono);font-size:.8rem;padding:16px">Fehler beim Laden des Verlaufs.</p>`;
  }
}

// ════════════════════════════════════════════════════════════════════
// VORSCHAU
// ════════════════════════════════════════════════════════════════════
function updateVorschau() {
  const aKey = document.getElementById("previewA").value;
  const bKey = document.getElementById("previewB").value;
  const pred  = document.getElementById("prediction");
  if (!aKey || !bKey || aKey === bKey) { pred.classList.remove("visible"); return; }
  const a = daten.spieler[aKey], b = daten.spieler[bKey];
  if (!a || !b) return;
  const pA = erwartet(a.elo, b.elo) * 100, pB = 100 - pA;
  const gainA = Math.min(MAX_DELTA, Math.max(1, Math.round(K * (1 - pA/100))));
  const gainB = Math.min(MAX_DELTA, Math.max(1, Math.round(K * (pA/100))));
  pred.classList.add("visible");
  pred.innerHTML = `
    <div class="pred-row">
      <div><div class="pred-name" style="color:var(--accent)">${a.name}</div><div style="font-family:var(--font-mono);font-size:.75rem;color:var(--muted)">${a.elo} ELO</div></div>
      <div class="pred-pct" style="color:var(--accent)">${pA.toFixed(1)}%</div>
    </div>
    <div class="pred-bar-wrap"><div class="pred-bar-a" style="width:${pA}%"></div></div>
    <div class="pred-row">
      <div><div class="pred-name" style="color:var(--red)">${b.name}</div><div style="font-family:var(--font-mono);font-size:.75rem;color:var(--muted)">${b.elo} ELO</div></div>
      <div class="pred-pct" style="color:var(--red)">${pB.toFixed(1)}%</div>
    </div>
    <div class="pred-bar-wrap" style="margin-bottom:24px"><div class="pred-bar-b" style="width:${pB}%"></div></div>
    <div class="pred-elo-gain">
      <div class="elo-gain-card"><div class="gain-label">Sieg ${a.name}</div><div class="gain-val">+${gainA} ELO</div></div>
      <div class="elo-gain-card"><div class="gain-label">Sieg ${b.name}</div><div class="gain-val">+${gainB} ELO</div></div>
    </div>`;
}
document.getElementById("previewA").addEventListener("change", updateVorschau);
document.getElementById("previewB").addEventListener("change", updateVorschau);

// ════════════════════════════════════════════════════════════════════
// HEAD-TO-HEAD
// ════════════════════════════════════════════════════════════════════
function renderH2H() {
  const aKey = document.getElementById("h2hA").value;
  const bKey = document.getElementById("h2hB").value;
  const out   = document.getElementById("h2hResult");
  if (!aKey || !bKey || aKey === bKey) { out.innerHTML = ""; return; }
  const a = daten.spieler[aKey], b = daten.spieler[bKey];

  // Include both regular and tournament games
  const allMeetings = [];
  daten.spiele.forEach(sp => {
    if ((sp.sieger.toLowerCase()===aKey && sp.verlierer.toLowerCase()===bKey) ||
        (sp.sieger.toLowerCase()===bKey && sp.verlierer.toLowerCase()===aKey))
      allMeetings.push({ ...sp, siegerKey: sp.sieger.toLowerCase(), isTurnier: false });
  });
  daten.turniere.forEach(t => {
    getTurnierAlleSpiele(t).forEach(sp => {
      if ((sp.sieger===aKey && sp.verlierer===bKey)||(sp.sieger===bKey && sp.verlierer===aKey))
        allMeetings.push({ siegerKey: sp.sieger, datum: sp.datum, score_sieger: sp.scoreW, score_verlierer: sp.scoreL, isTurnier: true, turnierName: t.name });
    });
  });

  if (!allMeetings.length) {
    out.innerHTML = `<p style="color:var(--muted);font-family:var(--font-mono);font-size:.85rem;text-align:center;padding:32px">Noch keine Duelle zwischen ${a.name} und ${b.name}.</p>`;
    return;
  }

  let winsA=0, winsB=0, ptA=0, ptB=0, bigWinA=0, bigWinB=0;
  allMeetings.forEach(sp => {
    const isA = sp.siegerKey === aKey;
    if (isA) { winsA++; const d=(sp.score_sieger||0)-(sp.score_verlierer||0); ptA+=(sp.score_sieger||0); ptB+=(sp.score_verlierer||0); bigWinA=Math.max(bigWinA,d); }
    else      { winsB++; const d=(sp.score_sieger||0)-(sp.score_verlierer||0); ptB+=(sp.score_sieger||0); ptA+=(sp.score_verlierer||0); bigWinB=Math.max(bigWinB,d); }
  });

  const total = allMeetings.length;
  const pctA  = total > 0 ? winsA/total*100 : 50;
  const recent = [...allMeetings].reverse().slice(0, 5);

  out.innerHTML = `
    <div class="h2h-stats">
      <div class="h2h-player"><div class="h2h-player-name">${a.name}</div><div class="h2h-wins ${winsA>winsB?"winner":winsB>winsA?"loser":""}">${winsA}</div><div class="h2h-sub">Siege</div></div>
      <div class="h2h-middle"><div class="h2h-vs">VS</div><div style="font-family:var(--font-mono);font-size:.65rem;color:var(--muted);margin-top:6px">${total} Duelle</div></div>
      <div class="h2h-player"><div class="h2h-player-name">${b.name}</div><div class="h2h-wins ${winsB>winsA?"winner":winsA>winsB?"loser":""}">${winsB}</div><div class="h2h-sub">Siege</div></div>
    </div>
    <div class="h2h-bar-wrap"><div class="h2h-bar-left" style="width:${pctA}%"></div><div class="h2h-bar-right" style="width:${100-pctA}%"></div></div>
    <div class="h2h-extra-stats">
      <div class="h2h-extra-card"><span class="h2h-extra-val">${ptA}</span><span class="h2h-extra-label">${a.name} Pkt</span></div>
      <div class="h2h-extra-card"><span class="h2h-extra-val">${ptB}</span><span class="h2h-extra-label">${b.name} Pkt</span></div>
      <div class="h2h-extra-card"><span class="h2h-extra-val">${bigWinA}</span><span class="h2h-extra-label">Größter Sieg ${a.name}</span></div>
      <div class="h2h-extra-card"><span class="h2h-extra-val">${bigWinB}</span><span class="h2h-extra-label">Größter Sieg ${b.name}</span></div>
    </div>
    <div class="h2h-history-title">Letzte Duelle</div>
    ${recent.map(sp => {
      const isAWon = sp.siegerKey === aKey;
      const score  = sp.score_sieger != null ? `<span style="font-family:var(--font-mono);font-size:.75rem;color:var(--muted)">${isAWon?sp.score_sieger+":"+sp.score_verlierer:sp.score_verlierer+":"+sp.score_sieger}</span>` : "";
      const tb = sp.isTurnier ? `<span class="turnier-badge">${sp.turnierName}</span>` : "";
      return `<div class="history-item ${isAWon?"win":"loss"}">
        <span>${isAWon?"✅":"❌"} ${a.name} ${score}</span>
        ${tb}<span class="history-date">${sp.datum}</span></div>`;
    }).join("")}`;
}
document.getElementById("h2hA").addEventListener("change", renderH2H);
document.getElementById("h2hB").addEventListener("change", renderH2H);

// ════════════════════════════════════════════════════════════════════
// FORMKURVE
// ════════════════════════════════════════════════════════════════════
const CHART_COLORS = ["#b5f23e","#ff4d6d","#4d9eff","#ffd700","#ff9a3c","#c77dff","#4de88e","#ff6b9d","#00d4ff","#ffb347"];

// Welche Spieler sind im Chart aktiv (key → colorIndex oder -1)
let chartSelected = {}; // key → colorIndex (0-9), oder undefined = nicht ausgewählt

function getChartColorForKey(k) {
  // Finde den nächsten freien Farbindex
  const used = new Set(Object.values(chartSelected).filter(v => v !== undefined));
  for (let i = 0; i < CHART_COLORS.length; i++) {
    if (!used.has(i)) return i;
  }
  return 0;
}

// getEloVerlauf berücksichtigt reguläre Spiele + Turnierpreise
function getEloVerlauf(k) {
  // Alle ELO-verändernden Events sammeln: reguläre Spiele + Turnierpreise
  const events = [];

  daten.spiele.forEach((sp, i) => {
    if (sp.sieger.toLowerCase() === k)
      events.push({ ts: sp.ts || i, elo: sp.elo_sieger_nachher });
    else if (sp.verlierer.toLowerCase() === k)
      events.push({ ts: sp.ts || i, elo: sp.elo_verlierer_nachher });
  });

  // Turnierpreise
  (daten.eloEvents || []).forEach(ev => {
    if (ev.spielerKey === k)
      events.push({ ts: ev.ts, elo: ev.eloDanach });
  });

  // Nach ts sortieren
  events.sort((a, b) => a.ts - b.ts);

  // Punkte für Chart: Startpunkt + alle Events
  const pts = [{ elo: START_ELO, idx: 0 }];
  events.forEach((ev, i) => pts.push({ elo: ev.elo, idx: i + 1 }));
  return pts;
}

function renderFormkurve() {
  const emptyEl  = document.getElementById("chartEmpty");
  const canvas   = document.getElementById("formChart");
  const selectorEl = document.getElementById("chartSelector");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");

  const spielerArr = Object.values(daten.spieler).sort((a, b) => b.elo - a.elo);
  const hasData    = daten.spiele.length > 0 || (daten.eloEvents||[]).length > 0;

  // Spieler-Auswahl Grid rendern
  if (selectorEl) {
    selectorEl.innerHTML = spielerArr.map((s, i) => {
      const k    = key(s.name);
      const cidx = chartSelected[k];
      const sel  = cidx !== undefined;
      const color = sel ? CHART_COLORS[cidx] : null;
      return `<div class="chart-player-btn ${sel ? "selected" : ""}"
        style="${sel ? `border-color:${color};color:${color};background:${color}18` : ""}"
        onclick="toggleChartPlayer('${k}')">
        <div class="chart-player-dot" style="background:${sel ? color : "var(--border)"}"></div>
        <span>${s.name}</span>
      </div>`;
    }).join("");
  }

  const activeKeys = Object.keys(chartSelected).filter(k => chartSelected[k] !== undefined);

  if (!hasData) {
    emptyEl.style.display = "block";
    canvas.parentElement.style.display = "none";
    return;
  }
  emptyEl.style.display = "none";

  if (!activeKeys.length) {
    canvas.parentElement.style.display = "none";
    return;
  }
  canvas.parentElement.style.display = "block";

  const rect = canvas.parentElement.getBoundingClientRect();
  canvas.width  = rect.width - 32;
  canvas.height = 320;
  const W = canvas.width, H = canvas.height;
  const PAD = { top: 24, right: 80, bottom: 40, left: 60 };
  const cW = W - PAD.left - PAD.right, cH = H - PAD.top - PAD.bottom;
  ctx.clearRect(0, 0, W, H);

  // Alle Verlaufs-Daten der aktiven Spieler sammeln
  const verlaeufe = {};
  let allElos = [], maxX = 0;
  activeKeys.forEach(k => {
    const v = getEloVerlauf(k);
    verlaeufe[k] = v;
    v.forEach(p => allElos.push(p.elo));
    maxX = Math.max(maxX, v[v.length - 1]?.idx || 0);
  });
  if (!allElos.length) return;

  const minElo   = Math.min(...allElos) - 30;
  const maxElo   = Math.max(...allElos) + 30;
  const eloRange = maxElo - minElo || 1;
  const xPos = i   => PAD.left + (maxX === 0 ? 0 : (i / maxX) * cW);
  const yPos = elo => PAD.top  + cH - ((elo - minElo) / eloRange) * cH;

  // Gridlinien
  for (let i = 0; i <= 5; i++) {
    const elo = minElo + (eloRange / 5) * i;
    const y   = yPos(elo);
    ctx.beginPath(); ctx.moveTo(PAD.left, y); ctx.lineTo(W - PAD.right, y);
    ctx.strokeStyle = "rgba(37,42,51,.8)"; ctx.lineWidth = 1; ctx.stroke();
    ctx.fillStyle = "#5a6070"; ctx.font = "11px 'DM Mono'"; ctx.textAlign = "right";
    ctx.fillText(Math.round(elo), PAD.left - 8, y + 4);
  }
  // 1000 ELO Referenzlinie
  if (START_ELO >= minElo && START_ELO <= maxElo) {
    const y = yPos(START_ELO);
    ctx.setLineDash([4, 6]); ctx.strokeStyle = "rgba(90,96,112,.4)"; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(PAD.left, y); ctx.lineTo(W - PAD.right, y);
    ctx.stroke(); ctx.setLineDash([]);
  }

  // Kurven zeichnen
  activeKeys.forEach(k => {
    const verlauf = verlaeufe[k];
    if (verlauf.length < 2) return;
    const color = CHART_COLORS[chartSelected[k]];
    // Fläche
    const grad = ctx.createLinearGradient(0, PAD.top, 0, H - PAD.bottom);
    grad.addColorStop(0, color + "30"); grad.addColorStop(1, color + "00");
    ctx.beginPath();
    verlauf.forEach((p, pi) => pi === 0 ? ctx.moveTo(xPos(p.idx), yPos(p.elo)) : ctx.lineTo(xPos(p.idx), yPos(p.elo)));
    ctx.lineTo(xPos(verlauf[verlauf.length - 1].idx), H - PAD.bottom);
    ctx.lineTo(xPos(verlauf[0].idx), H - PAD.bottom);
    ctx.closePath(); ctx.fillStyle = grad; ctx.fill();
    // Linie
    ctx.beginPath();
    verlauf.forEach((p, pi) => pi === 0 ? ctx.moveTo(xPos(p.idx), yPos(p.elo)) : ctx.lineTo(xPos(p.idx), yPos(p.elo)));
    ctx.strokeStyle = color; ctx.lineWidth = 2.5; ctx.lineJoin = "round"; ctx.setLineDash([]); ctx.stroke();
    // Punkte
    verlauf.forEach(p => {
      ctx.beginPath(); ctx.arc(xPos(p.idx), yPos(p.elo), 3.5, 0, Math.PI * 2);
      ctx.fillStyle = color; ctx.fill();
    });
    // Name am Ende
    const last = verlauf[verlauf.length - 1];
    ctx.fillStyle = color; ctx.font = "bold 11px 'DM Sans'"; ctx.textAlign = "left";
    ctx.fillText(spielerName(k), xPos(last.idx) + 8, yPos(last.elo) + 4);
  });

  ctx.fillStyle = "#5a6070"; ctx.font = "10px 'DM Mono'"; ctx.textAlign = "center";
  ctx.fillText("Spiele / Events →", PAD.left + cW / 2, H - 6);
}

function toggleChartPlayer(k) {
  if (chartSelected[k] !== undefined) {
    // Abwählen
    delete chartSelected[k];
  } else {
    // Hinzufügen mit nächster freier Farbe
    chartSelected[k] = getChartColorForKey(k);
  }
  renderFormkurve();
}

function resetChartSelection() {
  chartSelected = {};
  renderFormkurve();
}

// ════════════════════════════════════════════════════════════════════
// TURNIER SYSTEM
// ════════════════════════════════════════════════════════════════════

// ── Views ─────────────────────────────────────────────────────────
let activeTurnierIdx = null; // index in daten.turniere
let activeBracketTab = "haupt"; // "haupt" | "trost"
let activeGruppeIdx  = 0;

function showView(name) {
  ["viewListe","viewErstellen","viewAnsicht"].forEach(id => {
    document.getElementById(id).style.display = id === name ? "block" : "none";
  });
}

// ── Turnier-Hilfsfunktionen ────────────────────────────────────────
function getTurnierAlleSpiele(t) {
  const result = [];
  // Gruppenspiele
  if (t.gruppen) {
    t.gruppen.forEach(g => {
      (g.spiele||[]).forEach(sp => {
        if (sp.sieger && sp.verlierer) result.push(sp); // nur echte Spiele
      });
    });
  }
  // Hauptrunden
  (t.hauptrunden||[]).forEach(runde => {
    runde.forEach(m => {
      if (m.sieger && m.verlierer) result.push({ ...m, runde: "haupt" }); // kein Freilos
    });
  });
  // Trostrunden
  (t.trostrunden||[]).forEach(runde => {
    runde.forEach(m => {
      if (m.sieger && m.verlierer) result.push({ ...m, runde: "trost" });
    });
  });
  // Platz-3-Spiel
  if (t.dritterPlatzSpiel?.sieger && t.dritterPlatzSpiel?.verlierer) {
    result.push({ ...t.dritterPlatzSpiel, runde: "p3" });
  }
  return result;
}

// ════════════════════════════════════════════════════════════════════
// TURNIER LISTE
// ════════════════════════════════════════════════════════════════════
function renderTurnierListe() {
  const container = document.getElementById("turnierCards");
  const empty     = document.getElementById("turnierLeer");
  if (!daten.turniere.length) { container.innerHTML=""; empty.style.display="block"; return; }
  empty.style.display="none";
  container.innerHTML = `<div class="turnier-cards-grid">${daten.turniere.map((t,i) => {
    const badges = `<span class="tc-badge ${t.status}">${t.status==="laufend"?"▶ Laufend":"✓ Abgeschlossen"}</span>${t.mitWertung?`<span class="tc-badge wertung">🏅 Mit Wertung</span>`:""}`;
    const meta = `${t.teilnehmer.length} Spieler · ${t.datum}${t.mitTrost?" · Trostrunde":""}`;
    return `<div class="turnier-card ${t.status}" onclick="openTurnier(${i})">
      <div class="tc-name">${t.name}</div>
      <div class="tc-meta">${meta}</div>
      <div style="margin-top:8px">${badges}</div>
    </div>`;
  }).join("")}</div>`;
}

document.getElementById("btnNeuesTurnier").addEventListener("click", () => {
  renderTurnierSetup();
  showView("viewErstellen");
});
document.getElementById("btnBackListe1").addEventListener("click", () => { renderTurnierListe(); showView("viewListe"); });
document.getElementById("btnBackListe2").addEventListener("click", () => { renderTurnierListe(); showView("viewListe"); });

// ════════════════════════════════════════════════════════════════════
// TURNIER ERSTELLEN
// ════════════════════════════════════════════════════════════════════
function renderTurnierSetup() {
  const grid = document.getElementById("turnierPlayersCreate");
  const spielerArr = Object.values(daten.spieler).sort((a,b)=>b.elo-a.elo);
  if (!spielerArr.length) { grid.innerHTML=`<p style="color:var(--muted);font-family:var(--font-mono);font-size:.8rem">Erst Spieler anlegen.</p>`; return; }
  grid.innerHTML = spielerArr.map(s => `
    <div class="t-player-toggle" data-key="${key(s.name)}" onclick="this.classList.toggle('selected');this.querySelector('.check').textContent=this.classList.contains('selected')?'✓':'';updateCreateInfo()">
      <div class="check"></div><span>${s.name} (${s.elo})</span>
    </div>`).join("");
}

function updateCreateInfo() {
  const selected = getCreateSelected();
  const n = selected.length;
  const infoEl     = document.getElementById("createInfo");
  const wertungWrap = document.getElementById("optWertungWrap");
  const prizesEl   = document.getElementById("prizesPreview");
  const optW       = document.getElementById("optWertung");
  const trostWrap  = document.getElementById("optTrostWrap");
  const optTrost   = document.getElementById("optTrost");

  if (n < 2)       infoEl.textContent = `Mindestens 2 Spieler auswählen. (${n} gewählt)`;
  else if (n < 16) infoEl.textContent = `${n} Spieler gewählt → einfaches K.O.-System.`;
  else             infoEl.textContent = `${n} Spieler → Gruppenphase (4er-Gruppen, Top 2 weiter) + K.O.-Runde.`;

  // Wertung nur ab 8
  if (n >= 8) { wertungWrap.style.opacity="1"; wertungWrap.style.pointerEvents="auto"; }
  else        { wertungWrap.style.opacity=".4"; wertungWrap.style.pointerEvents="none"; optW.checked=false; }

  // Trostrunde nur ab 16 (nur sinnvoll mit Gruppenphase)
  if (trostWrap) {
    if (n >= 16) { trostWrap.style.opacity="1"; trostWrap.style.pointerEvents="auto"; }
    else         { trostWrap.style.opacity=".4"; trostWrap.style.pointerEvents="none"; optTrost.checked=false; }
  }

  if (optW.checked && n >= 8) {
    const [p1,p2,p3] = getPrizes(n);
    prizesEl.style.display = "block";
    prizesEl.innerHTML = `<div class="prizes-title">TURNIERPUNKTE WERDEN ZUR ELO ADDIERT</div>
      <div class="prizes-row">
        <div class="prize-item"><div class="prize-rank">🥇</div><span class="prize-pts">+${p1}</span><span class="prize-label">ELO</span></div>
        <div class="prize-item"><div class="prize-rank">🥈</div><span class="prize-pts">+${p2}</span><span class="prize-label">ELO</span></div>
        <div class="prize-item"><div class="prize-rank">🥉</div><span class="prize-pts">+${p3}</span><span class="prize-label">ELO</span></div>
      </div>`;
  } else { prizesEl.style.display = "none"; }
}

document.getElementById("optWertung").addEventListener("change", updateCreateInfo);
document.getElementById("optTrost").addEventListener("change", updateCreateInfo);

function getCreateSelected() {
  return [...document.querySelectorAll("#turnierPlayersCreate .t-player-toggle.selected")].map(el=>el.dataset.key);
}

document.getElementById("btnStartTurnier").addEventListener("click", () => {
  const name     = document.getElementById("turnierName").value.trim();
  const selected = getCreateSelected();
  const mitW     = document.getElementById("optWertung").checked;
  const mitTrost = document.getElementById("optTrost").checked;

  if (!name)         { showToast("toastCreate","❌ Bitte einen Turniernamen eingeben.","error"); return; }
  if (selected.length < 2) { showToast("toastCreate","❌ Mindestens 2 Spieler auswählen.","error"); return; }
  if (mitW && selected.length < 8) { showToast("toastCreate","❌ Mit Wertung erst ab 8 Spielern.","error"); return; }

  const t = buildTurnier(name, selected, mitW, mitTrost);
  daten.turniere.push(t);
  speichereDaten();
  activeTurnierIdx = daten.turniere.length - 1;
  document.getElementById("turnierName").value = "";
  document.querySelectorAll("#turnierPlayersCreate .t-player-toggle.selected").forEach(el => el.classList.remove("selected"));
  document.getElementById("optWertung").checked = false;
  document.getElementById("optTrost").checked   = false;
  openTurnier(activeTurnierIdx);
});

// ── Turnier aufbauen ──────────────────────────────────────────────
function buildTurnier(name, playerKeys, mitWertung, mitTrost) {
  const t = {
    id: Date.now(),
    name, datum: formatDatum(),
    teilnehmer: playerKeys,
    mitWertung, mitTrost,
    status: "laufend",
    phase: "hauptrunde", // "gruppen" | "hauptrunde" | "fertig"
    gruppen: null,
    hauptrunden: [],
    trostrunden: mitTrost ? [] : null,
    sieger: null, platz2: null, platz3: null, dritterPlatzSpiel: null,
  };

  if (playerKeys.length >= 16) {
    // Gruppenphase
    t.phase = "gruppen";
    const shuffled = shuffle(playerKeys);
    const n = shuffled.length;

    // Verteile Spieler möglichst gleichmäßig in Gruppen von 3-4
    // Ziel: so wenige Gruppen wie nötig, alle zwischen 3 und 4 Spielern
    let numGruppen = Math.ceil(n / 4); // starte mit 4er-Gruppen
    // Falls eine Gruppe nur 1-2 Spieler hätte, füge eine weitere Gruppe hinzu
    while (n / numGruppen < 2.5) numGruppen++;
    
    // Verteile überschüssige Spieler: ersten (n % numGruppen) Gruppen bekommen einen extra
    const baseSize  = Math.floor(n / numGruppen);
    const extraGrps = n % numGruppen; // diese Gruppen bekommen einen Spieler mehr

    t.gruppen = [];
    let cursor = 0;
    for (let i = 0; i < numGruppen; i++) {
      const size = baseSize + (i < extraGrps ? 1 : 0);
      const gSpieler = shuffled.slice(cursor, cursor + size);
      cursor += size;
      const spiele = [];
      for (let a = 0; a < gSpieler.length; a++) {
        for (let b = a+1; b < gSpieler.length; b++) {
          spiele.push({ a: gSpieler[a], b: gSpieler[b], sieger: null, scoreW: null, scoreL: null, datum: null });
        }
      }
      t.gruppen.push({ name: String.fromCharCode(65+i), spieler: gSpieler, spiele, abgeschlossen: false });
    }
  } else {
    // Direkt Bracket
    const [haupt, trost] = buildBracket(playerKeys, mitTrost);
    t.hauptrunden  = haupt;
    t.trostrunden  = trost;
  }
  return t;
}

// ── Bracket aufbauen (komplett neu) ──────────────────────────────
// Freilöse werden sauber verteilt: Die ersten numByes zufälligen
// Spieler bekommen ein Freilos, der Rest spielt gegeneinander.
// Kein Freilos-vs-Freilos möglich. Weiterleitung funktioniert
// durch alle Runden korrekt.

function newMatch(a, b) {
  return { a, b, sieger: null, verlierer: null, scoreW: null, scoreL: null, datum: null };
}

function buildBracket(playerKeys, mitTrost) {
  const players  = shuffle([...playerKeys]);
  const n        = players.length;
  const size     = nextPow2(n);
  const numByes  = size - n;

  // Runde 1: erst numByes Spieler mit Freilos, Rest gegeneinander
  const r1 = [];
  for (let i = 0; i < size / 2; i++) {
    if (i < numByes) {
      // Dieser Spieler bekommt Freilos → sofort weiter
      const m = newMatch(players[i], null);
      m.sieger = players[i];
      r1.push(m);
    } else {
      const offset = numByes + (i - numByes) * 2;
      r1.push(newMatch(players[offset], players[offset + 1]));
    }
  }

  // Leere Folgerunden anlegen
  const haupt = [r1];
  let cur = r1.length;
  while (cur > 1) {
    const nr = [];
    for (let i = 0; i < cur; i += 2) nr.push(newMatch(null, null));
    haupt.push(nr);
    cur = nr.length;
  }

  // Freilos-Sieger sofort in Folgerunden eintragen
  vollPropagieren(haupt);

  // Trostrunde: R1-Verlierer (nur echte, keine Freilose)
  let trost = null;
  if (mitTrost) {
    const losers = r1.map(m => m.verlierer).filter(Boolean);
    if (losers.length >= 2) trost = buildBracket(losers, false)[0];
  }
  return [haupt, trost];
}

// Propagiert ALLE bekannten Sieger durch alle Runden
// (auch rekursiv bei Freilos in Folgerunden)
function vollPropagieren(runden) {
  // Mehrere Durchläufe bis nichts mehr geändert wird
  let changed = true;
  while (changed) {
    changed = false;
    for (let ri = 0; ri < runden.length - 1; ri++) {
      // Pass A: Bekannte Sieger in nächste Runde schreiben
      runden[ri].forEach((m, mi) => {
        if (!m.sieger) return;
        const nextMi = Math.floor(mi / 2);
        const slot   = mi % 2 === 0 ? "a" : "b";
        const nm     = runden[ri + 1][nextMi];
        if (nm[slot] !== m.sieger) { nm[slot] = m.sieger; changed = true; }
      });
    }
    // Pass B: Nur echte Freilose auto-advance (wenn ein Slot NIE befüllt werden kann)
    // Ein Slot ist "nie befüllbar" wenn der zuliefernde Match schon einen Sieger hat
    // und der andere Slot bereits voll ist – also wenn nm.a UND nm.b gesetzt sind, NIEMALS auto-advance
    for (let ri = 0; ri < runden.length - 1; ri++) {
      runden[ri + 1].forEach((nm, nmi) => {
        if (nm.sieger) return;
        if (nm.a && nm.b) return; // Echter Match – muss gespielt werden
        // Prüfe ob der leere Slot aus der vorherigen Runde kommen kann
        const srcMiA = nmi * 2;
        const srcMiB = nmi * 2 + 1;
        const srcA   = runden[ri][srcMiA];
        const srcB   = runden[ri][srcMiB];
        // Auto-advance nur wenn der Gegner-Match schon abgeschlossen ist
        // und trotzdem keinen Spieler geliefert hat (echter Freilos-Slot)
        if (nm.a && !nm.b && srcB && srcB.sieger && !srcB.verlierer) {
          // srcB war ein Freilos-Match selbst → kein echter Gegner
          nm.sieger = nm.a; changed = true;
        } else if (!nm.a && nm.b && srcA && srcA.sieger && !srcA.verlierer) {
          nm.sieger = nm.b; changed = true;
        }
      });
    }
  }
}

// ── Aktuell ausgewähltes Spiel ────────────────────────────────────
let selectedMatch = null; // { type: "haupt"|"trost", ri, mi }

// ════════════════════════════════════════════════════════════════════
// TURNIER ÖFFNEN / ANSICHT
// ════════════════════════════════════════════════════════════════════
function openTurnier(idx) {
  activeTurnierIdx = idx;
  activeBracketTab = "haupt";
  activeGruppeIdx  = 0;
  renderTurnierAnsicht();
  showView("viewAnsicht");
}

function renderTurnierAnsicht() {
  const t = daten.turniere[activeTurnierIdx];
  if (!t) return;

  document.getElementById("ansichtName").textContent = t.name;
  const meta = `${t.teilnehmer.length} Spieler · ${t.datum}` +
    (t.mitWertung?" · 🏅 Mit Wertung":"") + (t.mitTrost?" · Trostrunde":"");
  document.getElementById("ansichtMeta").textContent = meta;

  // Phase Tabs (nur wenn kein Gruppenphase aktiv)
  const phaseTabs = document.getElementById("phaseTabs");
  const trostBtn  = document.getElementById("trostTabBtn");
  const uiGruppen = document.getElementById("uiGruppen");
  const uiHaupt   = document.getElementById("uiHaupt");
  const uiTrost   = document.getElementById("uiTrost");

  if (t.phase === "gruppen") {
    phaseTabs.style.display = "none";
    uiGruppen.style.display = "block";
    uiHaupt.style.display   = "none";
    uiTrost.style.display   = "none";
    renderGruppenPhase(t);
  } else {
    uiGruppen.style.display = "none";
    phaseTabs.style.display = "flex";
    if (t.trostrunden) trostBtn.style.display = "inline-block";
    else trostBtn.style.display = "none";

    document.querySelectorAll(".bracket-tab").forEach(btn => {
      btn.classList.toggle("active", btn.dataset.btab === activeBracketTab);
    });

    if (activeBracketTab === "haupt") {
      uiHaupt.style.display  = "block";
      uiTrost.style.display  = "none";
      renderHauptrunde(t);
    } else {
      uiHaupt.style.display  = "none";
      uiTrost.style.display  = "block";
      renderTrostrunde(t);
    }
  }
}

// Bracket Tab Switching
document.querySelectorAll(".bracket-tab").forEach(btn => {
  btn.addEventListener("click", () => {
    activeBracketTab = btn.dataset.btab;
    renderTurnierAnsicht();
  });
});

document.getElementById("btnResetTurnier").addEventListener("click", () => {
  if (confirm("Turnier wirklich abbrechen? Alle Ergebnisse gehen verloren.")) {
    daten.turniere.splice(activeTurnierIdx, 1);
    speichereDaten();
    renderTurnierListe();
    showView("viewListe");
  }
});

// ════════════════════════════════════════════════════════════════════
// GRUPPENPHASE
// ════════════════════════════════════════════════════════════════════
function renderGruppenPhase(t) {
  const tabsEl    = document.getElementById("gruppenTabs");
  const inhaltEl  = document.getElementById("gruppenInhalt");
  const matchBox  = document.getElementById("gruppenMatchBox");
  const abschluss = document.getElementById("gruppenAbschlussWrap");

  // Tabs
  tabsEl.innerHTML = t.gruppen.map((g,i) =>
    `<button class="gruppen-tab ${i===activeGruppeIdx?"active":""}" onclick="activeGruppeIdx=${i};renderGruppenPhase(daten.turniere[activeTurnierIdx])">Gruppe ${g.name}</button>`
  ).join("");

  const g = t.gruppen[activeGruppeIdx];

  // Tabelle
  const stats = {};
  g.spieler.forEach(k => stats[k] = { siege:0, niederlagen:0, pktPlus:0, pktMinus:0 });
  g.spiele.forEach(sp => {
    if (!sp.sieger) return;
    stats[sp.sieger].siege++;         stats[sp.sieger].pktPlus += sp.scoreW; stats[sp.sieger].pktMinus += sp.scoreL;
    stats[sp.verlierer].niederlagen++; stats[sp.verlierer].pktPlus += sp.scoreL; stats[sp.verlierer].pktMinus += sp.scoreW;
  });
  const sorted = [...g.spieler].sort((a,b) => {
    const da=stats[a], db=stats[b];
    if (db.siege !== da.siege) return db.siege - da.siege;
    return (db.pktPlus-db.pktMinus) - (da.pktPlus-da.pktMinus);
  });

  const tabelleHTML = `<div class="gruppe-tabelle">
    <table><thead><tr><th>Spieler</th><th>S</th><th>N</th><th>+</th><th>−</th><th>Diff</th></tr></thead>
    <tbody>${sorted.map((k,i) => {
      const st = stats[k];
      return `<tr class="${i<2?"advance":""}">
        <td>${spielerName(k)}</td>
        <td>${st.siege}</td><td>${st.niederlagen}</td>
        <td>${st.pktPlus}</td><td>${st.pktMinus}</td>
        <td>${st.pktPlus-st.pktMinus>=0?"+":""}${st.pktPlus-st.pktMinus}</td>
      </tr>`;
    }).join("")}</tbody></table></div>`;

  // Spiele
  const spieleHTML = `<div class="gruppe-spiele">
    <div class="gruppe-spiele-title">Spiele</div>
    ${g.spiele.map((sp,si) => {
      if (sp.sieger) {
        return `<div class="gruppe-spiel gespielt">
          <span>${spielerName(sp.sieger)}</span>
          <span class="gruppe-spiel-score">${sp.scoreW}:${sp.scoreL}</span>
          <span>${spielerName(sp.verlierer)}</span>
        </div>`;
      } else {
        return `<div class="gruppe-spiel ausstehend" onclick="startGruppenMatch(${activeGruppeIdx},${si})" style="cursor:pointer">
          <span>${spielerName(sp.a)}</span>
          <span style="color:var(--muted);font-family:var(--font-mono);font-size:.8rem">vs</span>
          <span>${spielerName(sp.b)}</span>
        </div>`;
      }
    }).join("")}</div>`;

  inhaltEl.innerHTML = `<div class="gruppe-container">${tabelleHTML}${spieleHTML}</div>`;

  // Prüfen ob alle Gruppenspiele gespielt
  const alleGespielt = t.gruppen.every(gr => gr.spiele.every(sp => sp.sieger));
  if (alleGespielt) {
    abschluss.style.display = "block";
    const advancer = t.gruppen.flatMap(gr => {
      const gStats = {};
      gr.spieler.forEach(k => gStats[k]={siege:0,pkt:0});
      gr.spiele.forEach(sp => { if(sp.sieger){gStats[sp.sieger].siege++;gStats[sp.sieger].pkt+=sp.scoreW-sp.scoreL;gStats[sp.verlierer].pkt+=sp.scoreL-sp.scoreW;} });
      return [...gr.spieler].sort((a,b)=>gStats[b].siege-gStats[a].siege||(gStats[b].pkt-gStats[a].pkt)).slice(0,2);
    });
    document.getElementById("gruppenAbschlussInfo").textContent =
      `Weiterkommen: ${advancer.map(spielerName).join(", ")}`;
    matchBox.style.display = "none";
  } else {
    abschluss.style.display = "none";
    matchBox.style.display  = "none";
  }
}

let activeGruppenMatch = null; // { gruppeIdx, spielIdx }

function startGruppenMatch(gi, si) {
  const t = daten.turniere[activeTurnierIdx];
  const sp = t.gruppen[gi].spiele[si];
  activeGruppenMatch = { gi, si };
  document.getElementById("gNameA").textContent = spielerName(sp.a);
  document.getElementById("gNameB").textContent = spielerName(sp.b);
  document.getElementById("gScoreA").value = "";
  document.getElementById("gScoreB").value = "";
  document.getElementById("gruppenMatchBox").style.display = "block";
}

document.getElementById("btnSubmitGruppe").addEventListener("click", () => {
  if (!activeGruppenMatch) return;
  const t  = daten.turniere[activeTurnierIdx];
  const sA = parseInt(document.getElementById("gScoreA").value);
  const sB = parseInt(document.getElementById("gScoreB").value);
  if (isNaN(sA)||isNaN(sB)||sA===sB||document.getElementById("gScoreA").value==="") {
    showToast("toastGruppe","❌ Gültiges Ergebnis eingeben (kein Unentschieden).","error"); return;
  }
  const { gi, si } = activeGruppenMatch;
  const sp = t.gruppen[gi].spiele[si];
  sp.sieger    = sA > sB ? sp.a : sp.b;
  sp.verlierer = sA > sB ? sp.b : sp.a;
  sp.scoreW    = sA > sB ? sA : sB;
  sp.scoreL    = sA > sB ? sB : sA;
  sp.datum     = formatDatum();
  sp.ts        = Date.now();

  // Update player avg stats (no ELO change)
  updateTurnierSpielStats(sp.sieger, sp.verlierer, sp.scoreW, sp.scoreL);

  activeGruppenMatch = null;
  document.getElementById("gruppenMatchBox").style.display = "none";
  speichereDaten();
  renderVerlauf();
  renderGruppenPhase(t);
});

document.getElementById("btnGruppenAbschliessen").addEventListener("click", () => {
  const t = daten.turniere[activeTurnierIdx];
  // Bestimme Top-2 aus jeder Gruppe
  const advancer = [];
  const consolation = [];
  t.gruppen.forEach(gr => {
    const gStats = {};
    gr.spieler.forEach(k => gStats[k]={siege:0,pkt:0});
    gr.spiele.forEach(sp => {
      if(!sp.sieger) return;
      gStats[sp.sieger].siege++; gStats[sp.sieger].pkt+=sp.scoreW-sp.scoreL;
      gStats[sp.verlierer].pkt+=sp.scoreL-sp.scoreW;
    });
    const sorted = [...gr.spieler].sort((a,b)=>gStats[b].siege-gStats[a].siege||(gStats[b].pkt-gStats[a].pkt));
    advancer.push(sorted[0], sorted[1]);
    consolation.push(...sorted.slice(2));
  });

  const [haupt, _] = buildBracket(advancer, false);
  t.hauptrunden = haupt;
  if (t.mitTrost && consolation.length >= 2) {
    t.trostrunden = buildBracket(consolation, false)[0];
  }
  t.phase = "hauptrunde";
  speichereDaten();
  activeBracketTab = "haupt";
  renderTurnierAnsicht();
});

function updateTurnierSpielStats(siegerKey, verliererKey, scoreW, scoreL) {
  const s = daten.spieler[siegerKey], v = daten.spieler[verliererKey];
  if (!s || !v) return;
  if (!s.gesamtPunkte) s.gesamtPunkte=0; if (!s.gesamtSpiele) s.gesamtSpiele=0;
  if (!v.gesamtPunkte) v.gesamtPunkte=0; if (!v.gesamtSpiele) v.gesamtSpiele=0;
  s.gesamtPunkte+=scoreW; s.gesamtSpiele+=1;
  v.gesamtPunkte+=scoreL; v.gesamtSpiele+=1;
}

// ════════════════════════════════════════════════════════════════════
// HAUPTRUNDE BRACKET
// ════════════════════════════════════════════════════════════════════
function renderHauptrunde(t) {
  const statusEl  = document.getElementById("hauptStatus");
  const bracketEl = document.getElementById("bracketHaupt");
  const matchBox  = document.getElementById("hauptMatchBox");
  const champEl   = document.getElementById("championDisplay");

  renderBracketHTML(t.hauptrunden, bracketEl, "haupt");

  // Spiel um Platz 3 an den Bracket anhängen
  renderDritterPlatz(t, bracketEl);

  if (t.phase === "fertig") {
    matchBox.style.display = "none";
    champEl.style.display  = "block";
    statusEl.textContent   = "🏆 TURNIER ABGESCHLOSSEN";
    document.getElementById("championName").textContent = spielerName(t.sieger);
    const prizes = t.mitWertung ? getPrizes(t.teilnehmer.length) : null;
    document.getElementById("podium").innerHTML = [
      { rank:"🥇", key:t.sieger,  pts: prizes?.[0] },
      { rank:"🥈", key:t.platz2,  pts: prizes?.[1] },
      { rank:"🥉", key:t.platz3,  pts: prizes?.[2] },
    ].filter(p=>p.key).map(p => `
      <div class="podium-item">
        <span class="podium-rank">${p.rank}</span>
        <div class="podium-name">${spielerName(p.key)}</div>
        ${p.pts ? `<div class="podium-pts">+${p.pts} 🏅 Punkte</div>` : ""}
      </div>`).join("");
    return;
  }
  champEl.style.display = "none";

  // Eingabe-Box: Platz-3-Spiel hat Vorrang wenn ausgewählt
  const sel = selectedMatch;
  if (sel && sel.type === "p3" && t.dritterPlatzSpiel && !t.dritterPlatzSpiel.sieger) {
    const m = t.dritterPlatzSpiel;
    matchBox.style.display = "block";
    document.getElementById("hNameA").textContent = spielerName(m.a);
    document.getElementById("hNameB").textContent = spielerName(m.b);
    document.getElementById("hScoreA").value = "";
    document.getElementById("hScoreB").value = "";
    document.getElementById("btnSubmitHaupt").onclick = () => submitBracketMatch("p3");
    statusEl.textContent = `SPIEL UM PLATZ 3 — ${spielerName(m.a)} vs ${spielerName(m.b)}`;
  } else if (sel && sel.type === "haupt") {
    const m = t.hauptrunden[sel.ri][sel.mi];
    if (m && m.a && m.b && !m.sieger) {
      matchBox.style.display = "block";
      document.getElementById("hNameA").textContent = spielerName(m.a);
      document.getElementById("hNameB").textContent = spielerName(m.b);
      document.getElementById("hScoreA").value = "";
      document.getElementById("hScoreB").value = "";
      document.getElementById("btnSubmitHaupt").onclick = () => submitBracketMatch("haupt");
      statusEl.textContent = `${roundName(sel.ri, t.hauptrunden.length)} — ${spielerName(m.a)} vs ${spielerName(m.b)}`;
    } else {
      selectedMatch = null;
      matchBox.style.display = "none";
      updateStatusText(t, statusEl);
    }
  } else {
    matchBox.style.display = "none";
    updateStatusText(t, statusEl);
  }
}

function renderDritterPlatz(t, bracketEl) {
  // Entferne alten Platz-3-Block falls vorhanden
  const existing = document.getElementById("p3Block");
  if (existing) existing.remove();

  const p3 = t.dritterPlatzSpiel;
  if (!p3) return; // Noch keine Halbfinals gespielt

  const isSelected = selectedMatch && selectedMatch.type === "p3";
  const isPlayable = !p3.sieger;
  const aWon = p3.sieger === p3.a && p3.verlierer;
  const bWon = p3.sieger === p3.b && p3.verlierer;

  const block = document.createElement("div");
  block.id = "p3Block";
  block.className = "p3-block";
  block.innerHTML = `
    <div class="p3-title">🥉 SPIEL UM PLATZ 3</div>
    <div class="bracket-match ${isSelected ? "selected-match" : isPlayable ? "playable-match" : ""}"
         ${isPlayable ? `onclick="selectBracketMatch('p3',0,0)"` : ""}
         style="display:inline-flex;min-width:200px">
      <div class="bracket-slot ${aWon ? "winner-slot" : bWon ? "loser-slot" : ""}">
        <span class="bracket-slot-name">${spielerName(p3.a)}</span>
        <span class="bracket-slot-score">${aWon ? p3.scoreW : bWon ? p3.scoreL : ""}</span>
      </div>
      <div class="bracket-slot ${bWon ? "winner-slot" : aWon ? "loser-slot" : ""}">
        <span class="bracket-slot-name">${spielerName(p3.b)}</span>
        <span class="bracket-slot-score">${bWon ? p3.scoreW : aWon ? p3.scoreL : ""}</span>
      </div>
      ${isPlayable ? `<div class="play-indicator">${isSelected ? "✏️" : "▶"}</div>` : ""}
    </div>`;
  bracketEl.appendChild(block);
}

function updateStatusText(t, el) {
  const offeneHaupt = t.hauptrunden.flatMap((r,ri) => r.map((m,mi) => ({m,ri,mi}))).filter(({m})=>m.a&&m.b&&!m.sieger);
  const p3Offen     = t.dritterPlatzSpiel && !t.dritterPlatzSpiel.sieger ? 1 : 0;
  const offene      = offeneHaupt.length + p3Offen;
  if (offene > 0) el.textContent = `${offene} Spiel${offene>1?"e":""} ausstehend – auf ein Spiel tippen zum Eintragen`;
  else el.textContent = "Alle Spiele gespielt.";
}

document.getElementById("btnSubmitHaupt").addEventListener("click", () => submitBracketMatch("haupt"));

// ════════════════════════════════════════════════════════════════════
// TROSTRUNDE
// ════════════════════════════════════════════════════════════════════
function renderTrostrunde(t) {
  const bracketEl = document.getElementById("bracketTrost");
  const matchBox  = document.getElementById("trostMatchBox");
  if (!t.trostrunden) {
    bracketEl.innerHTML = "<p style='color:var(--muted);font-family:var(--font-mono);font-size:.8rem;padding:20px'>Keine Trostrunde.</p>";
    matchBox.style.display = "none"; return;
  }

  renderBracketHTML(t.trostrunden, bracketEl, "trost");

  if (selectedMatch && selectedMatch.type === "trost") {
    const m = t.trostrunden[selectedMatch.ri][selectedMatch.mi];
    if (m && m.a && m.b && !m.sieger) {
      matchBox.style.display = "block";
      document.getElementById("trNameA").textContent = spielerName(m.a);
      document.getElementById("trNameB").textContent = spielerName(m.b);
      document.getElementById("trScoreA").value = "";
      document.getElementById("trScoreB").value = "";
    } else {
      selectedMatch = null;
      matchBox.style.display = "none";
    }
  } else {
    matchBox.style.display = "none";
  }
}

document.getElementById("btnSubmitTrost").addEventListener("click", () => submitBracketMatch("trost"));

// ─── Spiel aus Bracket auswählen (Klick) ─────────────────────────
function selectBracketMatch(type, ri, mi) {
  const t = daten.turniere[activeTurnierIdx];
  if (type === "p3") {
    // Platz-3-Spiel
    if (!t.dritterPlatzSpiel || t.dritterPlatzSpiel.sieger) return;
    selectedMatch = { type: "p3", ri: 0, mi: 0 };
    renderTurnierAnsicht();
    return;
  }
  const runden = type === "haupt" ? t.hauptrunden : t.trostrunden;
  if (!runden) return;
  const m = runden[ri][mi];
  if (!m || !m.a || !m.b || m.sieger) return;
  selectedMatch = { type, ri, mi };
  renderTurnierAnsicht();
}

// ─── Submit bracket match ─────────────────────────────────────────
function submitBracketMatch(type) {
  const t = daten.turniere[activeTurnierIdx];

  // Spiel um Platz 3
  if (type === "p3") {
    if (!selectedMatch || selectedMatch.type !== "p3") {
      showToast("toastHaupt", "❌ Bitte das Spiel um Platz 3 antippen.", "error"); return;
    }
    const m  = t.dritterPlatzSpiel;
    const sA = parseInt(document.getElementById("hScoreA").value);
    const sB = parseInt(document.getElementById("hScoreB").value);
    if (isNaN(sA) || isNaN(sB) || sA === sB ||
        document.getElementById("hScoreA").value === "" ||
        document.getElementById("hScoreB").value === "") {
      showToast("toastHaupt", "❌ Gültiges Ergebnis eingeben (kein Unentschieden).", "error"); return;
    }
    m.sieger    = sA > sB ? m.a : m.b;
    m.verlierer = sA > sB ? m.b : m.a;
    m.scoreW    = Math.max(sA, sB);
    m.scoreL    = Math.min(sA, sB);
    m.datum     = formatDatum();
    m.ts        = Date.now();
    updateTurnierSpielStats(m.sieger, m.verlierer, m.scoreW, m.scoreL);
    selectedMatch = null;

    const finalM = t.hauptrunden[t.hauptrunden.length - 1][0];
    if (finalM.sieger) {
      t.sieger = finalM.sieger;
      t.platz2 = finalM.verlierer;
      t.platz3 = m.sieger;
      if (t.mitWertung) {
        const [p1, p2, p3] = getPrizes(t.teilnehmer.length);
        const ts = Date.now();
        const award = (k, pts) => {
          if (!k || !daten.spieler[k]) return;
          if (!daten.spieler[k].turnierPunkte) daten.spieler[k].turnierPunkte = 0;
          daten.spieler[k].turnierPunkte += pts;
          daten.spieler[k].elo = Math.round((daten.spieler[k].elo + pts) * 10) / 10;
          if (!daten.eloEvents) daten.eloEvents = [];
          daten.eloEvents.push({ spielerKey: k, delta: pts, eloDanach: daten.spieler[k].elo, ts: ts + daten.eloEvents.length, turnierName: t.name });
        };
        award(t.sieger, p1); award(t.platz2, p2); award(t.platz3, p3);
      }
      t.phase  = "fertig";
      t.status = "abgeschlossen";
    }
    speichereDaten();
    fuelleSelects(); renderRangliste(); renderPlayerList(); renderVerlauf();
    renderTurnierAnsicht();
    return;
  }

  const runden  = type === "haupt" ? t.hauptrunden : t.trostrunden;
  const prefix  = type === "haupt" ? "h" : "tr";
  const toastId = type === "haupt" ? "toastHaupt" : "toastTrost";

  if (!selectedMatch || selectedMatch.type !== type) {
    showToast(toastId, "❌ Bitte erst ein Spiel im Bracket antippen.", "error"); return;
  }

  const sA = parseInt(document.getElementById(`${prefix}ScoreA`).value);
  const sB = parseInt(document.getElementById(`${prefix}ScoreB`).value);
  if (isNaN(sA) || isNaN(sB) || sA === sB ||
      document.getElementById(`${prefix}ScoreA`).value === "" ||
      document.getElementById(`${prefix}ScoreB`).value === "") {
    showToast(toastId, "❌ Gültiges Ergebnis eingeben (kein Unentschieden).", "error"); return;
  }

  const { ri, mi } = selectedMatch;
  const m = runden[ri][mi];
  if (!m || !m.a || !m.b) return;

  m.sieger    = sA > sB ? m.a : m.b;
  m.verlierer = sA > sB ? m.b : m.a;
  m.scoreW    = Math.max(sA, sB);
  m.scoreL    = Math.min(sA, sB);
  m.datum     = formatDatum();
  m.ts        = Date.now();

  // Sieger in nächste Runde propagieren (inkl. Freilös-Ketten)
  vollPropagieren(runden);

  selectedMatch = null;

  // Trostrunde: Wenn R1-Verlierer komplett → jetzt bauen falls noch nicht
  if (type === "haupt" && t.mitTrost && !t.trostrunden) {
    const losers = t.hauptrunden[0].map(m => m.verlierer).filter(Boolean);
    if (losers.length >= 2) {
      t.trostrunden = buildBracket(losers, false)[0];
    }
  }

  // Turnier beendet?
  if (type === "haupt") {
    // Spiel um Platz 3 erstellen sobald beide Halbfinals gespielt sind
    if (t.hauptrunden.length >= 2 && !t.dritterPlatzSpiel) {
      const semis    = t.hauptrunden[t.hauptrunden.length - 2];
      const semi1Done = semis[0]?.sieger && semis[0]?.verlierer;
      const semi2Done = semis.length > 1 && semis[1]?.sieger && semis[1]?.verlierer;
      if (semi1Done && semi2Done) {
        const loserA = semis[0].verlierer;
        const loserB = semis[1].verlierer;
        if (loserA && loserB) {
          t.dritterPlatzSpiel = { a: loserA, b: loserB, sieger: null, verlierer: null, scoreW: null, scoreL: null, datum: null };
        }
      } else if (semi1Done && semis.length === 1) {
        // Nur ein Halbfinale (2-player bracket) → kein Platz-3-Spiel
      }
    }

    // Turnier komplett: Finale gespielt UND (Platz-3-Spiel gespielt ODER kein Platz-3-Spiel)
    const finalM     = t.hauptrunden[t.hauptrunden.length - 1][0];
    const p3Done     = !t.dritterPlatzSpiel || t.dritterPlatzSpiel.sieger;
    if (finalM.sieger && p3Done) {
      t.sieger = finalM.sieger;
      t.platz2 = finalM.verlierer;
      t.platz3 = t.dritterPlatzSpiel?.sieger || null;
      if (t.mitWertung) {
        const [p1, p2, p3] = getPrizes(t.teilnehmer.length);
        const ts = Date.now();
        const award = (k, pts) => {
          if (!k || !daten.spieler[k]) return;
          if (!daten.spieler[k].turnierPunkte) daten.spieler[k].turnierPunkte = 0;
          daten.spieler[k].turnierPunkte += pts;
          daten.spieler[k].elo = Math.round((daten.spieler[k].elo + pts) * 10) / 10;
          if (!daten.eloEvents) daten.eloEvents = [];
          daten.eloEvents.push({ spielerKey: k, delta: pts, eloDanach: daten.spieler[k].elo, ts: ts + daten.eloEvents.length, turnierName: t.name });
        };
        award(t.sieger, p1); award(t.platz2, p2); award(t.platz3, p3);
      }
      t.phase  = "fertig";
      t.status = "abgeschlossen";
    }
  }

  speichereDaten();
  fuelleSelects(); renderRangliste(); renderPlayerList(); renderVerlauf();
  renderTurnierAnsicht();
}

// ─── Bracket HTML (klickbare Matches) ────────────────────────────
function renderBracketHTML(runden, container, type) {
  let html = `<div class="bracket">`;
  runden.forEach((runde, ri) => {
    html += `<div class="bracket-round">
      <div class="bracket-round-title">${roundName(ri, runden.length)}</div>
      <div class="bracket-matches">`;

    runde.forEach((m, mi) => {
      // Freilos: ein Spieler hat keinen Gegner und ist sofort weiter (kein verlierer)
      const isBye      = m.sieger && !m.verlierer;
      const isPlayable = m.a && m.b && !m.sieger;
      const isSelected = selectedMatch && selectedMatch.type===type &&
                         selectedMatch.ri===ri && selectedMatch.mi===mi;

      const nameA = m.a ? spielerName(m.a) : "—";
      const nameB = m.b ? spielerName(m.b) : "—";
      const aWon  = m.sieger === m.a && m.verlierer; // echter Sieg
      const bWon  = m.sieger === m.b && m.verlierer;
      // Score nur anzeigen wenn wirklich gespielt (scoreW ist Zahl, nicht null)
      const scoreA = aWon ? `${m.scoreW}` : bWon ? `${m.scoreL}` : "";
      const scoreB = bWon ? `${m.scoreW}` : aWon ? `${m.scoreL}` : "";

      const matchClass = isBye      ? "bracket-match bye-match" :
                         isSelected ? "bracket-match selected-match" :
                         isPlayable ? "bracket-match playable-match" :
                                      "bracket-match";
      const clickHandler = isPlayable
        ? `onclick="selectBracketMatch('${type}',${ri},${mi})"` : "";

      const slotClassA = aWon ? "bracket-slot winner-slot" :
                         bWon ? "bracket-slot loser-slot" :
                         isBye && m.a ? "bracket-slot bye-slot" :
                         !m.a ? "bracket-slot empty-slot" : "bracket-slot";
      const slotClassB = bWon ? "bracket-slot winner-slot" :
                         aWon ? "bracket-slot loser-slot" :
                         isBye && m.b ? "bracket-slot bye-slot" :
                         !m.b ? "bracket-slot empty-slot" : "bracket-slot";

      html += `<div class="${matchClass}" ${clickHandler}>
        <div class="${slotClassA}">
          <span class="bracket-slot-name">${nameA}</span>
          <span class="bracket-slot-score">${scoreA}</span>
        </div>
        <div class="${slotClassB}">
          <span class="bracket-slot-name">${nameB}</span>
          <span class="bracket-slot-score">${scoreB}</span>
        </div>
        ${isPlayable ? `<div class="play-indicator">${isSelected ? "✏️" : "▶"}</div>` : ""}
        ${isBye ? `<div class="bye-indicator">FREILOS</div>` : ""}
      </div>`;
    });
    html += `</div></div>`;
    if (ri < runden.length - 1) html += `<div style="width:16px;flex-shrink:0"></div>`;
  });
  html += `</div>`;
  container.innerHTML = html;
}

function roundName(idx, total) {
  const rem = total - idx;
  if (rem === 1) return "FINALE";
  if (rem === 2) return "HALBFINALE";
  if (rem === 3) return "VIERTELFINALE";
  return `RUNDE ${idx + 1}`;
}

// ════════════════════════════════════════════════════════════════════
// TAB NAVIGATION
// ════════════════════════════════════════════════════════════════════
document.querySelectorAll(".tab").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".tab").forEach(t => t.classList.remove("active"));
    document.querySelectorAll(".tab-content").forEach(s => s.classList.remove("active"));
    btn.classList.add("active");
    document.getElementById(`tab-${btn.dataset.tab}`).classList.add("active");

    if (btn.dataset.tab === "formkurve") setTimeout(renderFormkurve, 50);
    if (btn.dataset.tab === "turnier")   { renderTurnierListe(); showView("viewListe"); }
    if (btn.dataset.tab === "h2h")       renderH2H();
  });
});

// ════════════════════════════════════════════════════════════════════
// INIT – wird von Firebase-Listener getriggert (siehe onFirebaseDaten)
// ════════════════════════════════════════════════════════════════════
