const API_URL = "api/games.php";

const state = {
  allGames: [],
  games: [],
  stats: [],
  players: [],
  leaderboard: [],
  positionStats: [],
  duos: new Map(),
  sortKey: "presenceRate",
  sortDirection: "desc",
  positionSortKey: "player",
  positionSortDirection: "asc",
  gameLimit: 0,
  selectedGame: "",
  query: "",
};

const els = {
  gamesCount: document.getElementById("games-count"),
  gameScope: document.getElementById("game-scope"),
  dataNote: document.getElementById("data-note"),
  statsBody: document.getElementById("stats-body"),
  leaderboardNote: document.getElementById("leaderboard-note"),
  leaderboardBody: document.getElementById("leaderboard-body"),
  positionsNote: document.getElementById("positions-note"),
  positionsBody: document.getElementById("positions-body"),
  duoNote: document.getElementById("duo-note"),
  duoMatrix: document.getElementById("duo-matrix"),
  gamesList: document.getElementById("games-list"),
  gameDetail: document.getElementById("game-detail"),
  search: document.getElementById("hero-search"),
  mobileSort: document.getElementById("mobile-sort"),
  sortButtons: document.querySelectorAll("[data-sort]"),
  positionSortButtons: document.querySelectorAll("[data-position-sort]"),
  tabButtons: document.querySelectorAll("[data-tab]"),
  tabPanels: document.querySelectorAll(".tab-panel"),
};

function setText(element, value) {
  if (element) {
    element.textContent = value;
  }
}

function setHtml(element, value) {
  if (element) {
    element.innerHTML = value;
  }
}

function setValue(element, value) {
  if (element) {
    element.value = value;
  }
}

function calculateStats(games) {
  const statsByHero = new Map();
  const gameCount = games.length;

  for (const game of games) {
    for (const event of game.heroes) {
      if (!event.name || !["pick", "ban"].includes(event.type)) {
        continue;
      }

      if (!statsByHero.has(event.name)) {
        statsByHero.set(event.name, {
          hero: event.name,
          pickCount: 0,
          pickWins: 0,
          pickLosses: 0,
          banCount: 0,
          games: new Set(),
        });
      }

      const stat = statsByHero.get(event.name);
      if (event.type === "pick") {
        stat.pickCount += 1;
        if (pickedHeroWon(event, game.result)) {
          stat.pickWins += 1;
        } else if (pickedHeroLost(event, game.result)) {
          stat.pickLosses += 1;
        }
      } else {
        stat.banCount += 1;
      }
      stat.games.add(game.name);

    }
  }

  return Array.from(statsByHero.values()).map((stat) => ({
    ...stat,
    gameCount: stat.games.size,
    pickRate: rate(stat.pickCount, gameCount),
    pickWinRate: rate(stat.pickWins, stat.pickWins + stat.pickLosses),
    banRate: rate(stat.banCount, gameCount),
    presenceRate: rate(stat.games.size, gameCount),
  }));
}

function pickedHeroWon(event, result) {
  return (event.cell?.startsWith("E") && result === "1-0") || (event.cell?.startsWith("F") && result === "0-1");
}

function pickedHeroLost(event, result) {
  return (event.cell?.startsWith("E") && result === "0-1") || (event.cell?.startsWith("F") && result === "1-0");
}

function rate(count, total) {
  return total === 0 ? 0 : (count / total) * 100;
}

function duoKey(playerA, playerB) {
  return [playerA, playerB].sort((a, b) => a.localeCompare(b)).join("\u0000");
}

function playerLineup(game, side) {
  const players = game.players?.[side];
  return Array.isArray(players) ? players.filter(Boolean) : [];
}

function addDuoResult(duos, players, won) {
  for (let i = 0; i < players.length; i++) {
    for (let j = i + 1; j < players.length; j++) {
      const key = duoKey(players[i], players[j]);
      const record = duos.get(key) || { wins: 0, losses: 0 };
      if (won) {
        record.wins += 1;
      } else {
        record.losses += 1;
      }
      duos.set(key, record);
    }
  }
}

function addPlayerResult(players, playerName, won) {
  const record = players.get(playerName) || { player: playerName, games: 0, wins: 0, losses: 0 };
  record.games += 1;
  if (won) {
    record.wins += 1;
  } else {
    record.losses += 1;
  }
  players.set(playerName, record);
}

function addLineupResult(players, lineup, won) {
  for (const player of lineup) {
    addPlayerResult(players, player, won);
  }
}

function emptyPositionRecord(player) {
  return {
    player,
    positions: Array.from({ length: 5 }, () => ({ wins: 0, losses: 0 })),
    radiant: { wins: 0, losses: 0 },
    dire: { wins: 0, losses: 0 },
  };
}

function addPositionResult(positionStats, playerName, position, side, won) {
  const record = positionStats.get(playerName) || emptyPositionRecord(playerName);
  const positionRecord = record.positions[position];
  const sideRecord = record[side];

  if (won) {
    positionRecord.wins += 1;
    sideRecord.wins += 1;
  } else {
    positionRecord.losses += 1;
    sideRecord.losses += 1;
  }

  positionStats.set(playerName, record);
}

function addLineupPositionResults(positionStats, lineup, side, won) {
  lineup.forEach((player, index) => {
    addPositionResult(positionStats, player, index, side, won);
  });
}

function sortLeaderboard(players) {
  const sorted = Array.from(players.values())
    .map((record) => ({
      ...record,
      winRate: rate(record.wins, record.games),
    }))
    .sort((a, b) => {
      if (b.winRate !== a.winRate) {
        return b.winRate - a.winRate;
      }
      if (b.wins !== a.wins) {
        return b.wins - a.wins;
      }
      if (a.losses !== b.losses) {
        return a.losses - b.losses;
      }
      return a.player.localeCompare(b.player);
    });

  let previous = null;
  let rank = 0;
  let groupIndex = 0;
  const ranked = sorted.map((record, index) => {
    if (!previous || record.winRate.toFixed(2) !== previous.winRate.toFixed(2)) {
      rank = index + 1;
      groupIndex += 1;
    }
    previous = record;
    return { ...record, rank, groupIndex };
  });

  const groupCount = groupIndex;
  return ranked.map((record) => ({ ...record, groupCount }));
}

function calculatePlayerStats(games) {
  const players = new Map();
  const positionStats = new Map();
  const duos = new Map();

  for (const game of games) {
    const radiant = playerLineup(game, "radiant");
    const dire = playerLineup(game, "dire");

    if (game.result === "1-0") {
      addLineupResult(players, radiant, true);
      addLineupResult(players, dire, false);
      addLineupPositionResults(positionStats, radiant, "radiant", true);
      addLineupPositionResults(positionStats, dire, "dire", false);
      addDuoResult(duos, radiant, true);
      addDuoResult(duos, dire, false);
    } else if (game.result === "0-1") {
      addLineupResult(players, radiant, false);
      addLineupResult(players, dire, true);
      addLineupPositionResults(positionStats, radiant, "radiant", false);
      addLineupPositionResults(positionStats, dire, "dire", true);
      addDuoResult(duos, radiant, false);
      addDuoResult(duos, dire, true);
    } else {
      for (const player of [...radiant, ...dire]) {
        if (!players.has(player)) {
          players.set(player, { player, games: 0, wins: 0, losses: 0 });
        }
        if (!positionStats.has(player)) {
          positionStats.set(player, emptyPositionRecord(player));
        }
      }
    }
  }

  const leaderboard = sortLeaderboard(players);

  return {
    players: leaderboard.map((record) => record.player),
    leaderboard,
    positionStats: leaderboard.map((record) => positionStats.get(record.player) || emptyPositionRecord(record.player)),
    duos,
  };
}

function formatPercent(value) {
  return `${value.toFixed(value % 1 === 0 ? 0 : 1)}%`;
}

function formatRecord(record) {
  const total = record.wins + record.losses;
  return total === 0 ? "" : `${formatPercent(rate(record.wins, total))} (${record.wins}-${record.losses})`;
}

function winrateClass(record) {
  const total = record.wins + record.losses;
  if (total === 0) {
    return "";
  }

  const winRate = rate(record.wins, total);
  if (winRate >= 65) {
    return "winrate-high";
  }
  if (winRate >= 45) {
    return "winrate-average";
  }
  return "winrate-low";
}

function sortStats(stats) {
  const direction = state.sortDirection === "asc" ? 1 : -1;
  return [...stats].sort((a, b) => {
    const aValue = a[state.sortKey];
    const bValue = b[state.sortKey];

    if (typeof aValue === "string") {
      return aValue.localeCompare(bValue) * direction;
    }

    if (aValue === bValue) {
      return a.hero.localeCompare(b.hero);
    }

    return (aValue - bValue) * direction;
  });
}

function filteredStats() {
  const query = state.query.trim().toLowerCase();
  const stats = query
    ? state.stats.filter((stat) => stat.hero.toLowerCase().includes(query))
    : state.stats;
  return sortStats(stats);
}

function positionSortValue(record, key) {
  if (key === "player") {
    return record.player;
  }
  if (key.startsWith("pos")) {
    const position = Number(key.slice(3)) - 1;
    const positionRecord = record.positions[position];
    return rate(positionRecord.wins, positionRecord.wins + positionRecord.losses);
  }

  const sideRecord = record[key];
  return rate(sideRecord.wins, sideRecord.wins + sideRecord.losses);
}

function sortedPositionStats() {
  const direction = state.positionSortDirection === "asc" ? 1 : -1;
  return [...state.positionStats].sort((a, b) => {
    const aValue = positionSortValue(a, state.positionSortKey);
    const bValue = positionSortValue(b, state.positionSortKey);

    if (typeof aValue === "string") {
      return aValue.localeCompare(bValue) * direction;
    }
    if (aValue === bValue) {
      return a.player.localeCompare(b.player);
    }
    return (aValue - bValue) * direction;
  });
}

function meter(rateValue, className) {
  return `
    <div class="meter ${className}" aria-hidden="true">
      <span style="width: ${Math.min(rateValue, 100)}%"></span>
    </div>
  `;
}

function renderStats() {
  const rows = filteredStats();
  updateSortButtons();

  if (rows.length === 0) {
    setHtml(els.statsBody, `<tr><td class="empty" colspan="5">No heroes found.</td></tr>`);
    return;
  }

  setHtml(els.statsBody, rows.map((stat) => `
    <tr>
      <td class="hero-name" data-label="Hero">${escapeHtml(stat.hero)}</td>
      <td class="analysis-cell pick-analysis" data-label="Pick Impact">
        <div class="analysis-top"><strong>${formatPercent(stat.pickRate)}</strong><span>${stat.pickCount} picks</span></div>
        ${meter(stat.pickRate, "pick-meter")}
      </td>
      <td class="analysis-cell win-analysis" data-label="Pick Winrate">
        <div class="analysis-top"><strong>${formatPercent(stat.pickWinRate)}</strong><span>${stat.pickWins}-${stat.pickLosses}</span></div>
        ${meter(stat.pickWinRate, "win-meter")}
      </td>
      <td class="analysis-cell ban-analysis" data-label="Ban Pressure">
        <div class="analysis-top"><strong>${formatPercent(stat.banRate)}</strong><span>${stat.banCount} bans</span></div>
        ${meter(stat.banRate, "ban-meter")}
      </td>
      <td class="analysis-cell presence-analysis" data-label="Draft Presence">
        <div class="analysis-top"><strong>${formatPercent(stat.presenceRate)}</strong><span>${stat.gameCount} games</span></div>
        ${meter(stat.presenceRate, "presence-meter")}
      </td>
    </tr>
  `).join(""));
}

function renderSummary() {
  setText(els.gamesCount, state.games.length);
  setText(els.dataNote, `Percentages use ${state.games.length} game${state.games.length === 1 ? "" : "s"} as the denominator.`);
}

function populateGameScope() {
  setHtml(els.gameScope, state.allGames.map((game, index) => `
    <option value="${index + 1}">After ${escapeHtml(game.name)}</option>
  `).join(""));
  state.gameLimit = state.allGames.length;
  setValue(els.gameScope, String(state.gameLimit));
}

function applyGameScope() {
  state.games = state.allGames.slice(0, state.gameLimit);
  state.stats = calculateStats(state.games);
  const playerStats = calculatePlayerStats(state.games);
  state.players = playerStats.players;
  state.leaderboard = playerStats.leaderboard;
  state.positionStats = playerStats.positionStats;
  state.duos = playerStats.duos;

  if (!state.games.some((game) => game.name === state.selectedGame)) {
    state.selectedGame = "";
  }

  renderSummary();
  renderLeaderboard();
  renderPositionStats();
  renderStats();
  renderDuoMatrix();
  renderGames();
}

function leaderboardRowClass(record) {
  if (record.groupIndex === 1) {
    return "leaderboard-gold";
  }
  if (record.groupIndex === 2) {
    return "leaderboard-silver";
  }
  if (record.groupIndex === 3) {
    return "leaderboard-bronze";
  }
  if (record.groupIndex === record.groupCount && record.groupCount > 3) {
    return "leaderboard-low";
  }
  return "";
}

function renderLeaderboard() {
  if (state.leaderboard.length === 0) {
    setHtml(els.leaderboardBody, `<tr><td class="empty" colspan="7">No player lineup data found. Force refresh the API cache to load player names.</td></tr>`);
    setText(els.leaderboardNote, "No player lineup data available yet.");
    return;
  }

  setHtml(els.leaderboardBody, state.leaderboard.map((record) => `
    <tr class="${leaderboardRowClass(record)}">
      <td class="number" data-label="Ranking">${record.rank}</td>
      <td class="leaderboard-player" data-label="Player">${escapeHtml(record.player)}</td>
      <td class="number" data-label="Games">${record.games}</td>
      <td class="number" data-label="Win">${record.wins}</td>
      <td class="number" data-label="Lose">${record.losses}</td>
      <td class="number" data-label="Score">${record.wins} - ${record.losses}</td>
      <td class="number" data-label="Winrate">${record.winRate.toFixed(2)}%</td>
    </tr>
  `).join(""));
  setText(els.leaderboardNote, `${state.leaderboard.length} player${state.leaderboard.length === 1 ? "" : "s"} ranked by win rate.`);
}

function renderPositionStats() {
  updatePositionSortButtons();

  if (state.positionStats.length === 0) {
    setHtml(els.positionsBody, `<tr><td class="empty" colspan="8">No player lineup data found. Force refresh the API cache to load player names.</td></tr>`);
    setText(els.positionsNote, "No player lineup data available yet.");
    return;
  }

  setHtml(els.positionsBody, sortedPositionStats().map((record) => `
    <tr>
      <td class="leaderboard-player" data-label="Player">${escapeHtml(record.player)}</td>
      ${record.positions.map((positionRecord, index) => `<td class="number ${winrateClass(positionRecord)}" data-label="Pos ${index + 1}">${formatRecord(positionRecord)}</td>`).join("")}
      <td class="number ${winrateClass(record.radiant)}" data-label="Radiant Winrate">${formatRecord(record.radiant)}</td>
      <td class="number ${winrateClass(record.dire)}" data-label="Dire Winrate">${formatRecord(record.dire)}</td>
    </tr>
  `).join(""));

  setText(els.positionsNote, `${state.positionStats.length} player${state.positionStats.length === 1 ? "" : "s"} with position records.`);
}

function duoCellClass(winRate) {
  if (winRate >= 75) {
    return "duo-strong";
  }
  if (winRate >= 50) {
    return "duo-even";
  }
  if (winRate > 0) {
    return "duo-weak";
  }
  return "duo-zero";
}

function renderDuoMatrix() {
  if (state.players.length === 0) {
    setHtml(els.duoMatrix, `<p class="empty">No player lineup data found. Force refresh the API cache to load player names.</p>`);
    setText(els.duoNote, "No player lineup data available yet.");
    return;
  }

  const headers = state.players.map((player) => `<th scope="col" title="${escapeHtml(player)}">${escapeHtml(player)}</th>`).join("");
  const rows = state.players.map((rowPlayer) => {
    const cells = state.players.map((colPlayer) => {
      if (rowPlayer === colPlayer) {
        return `<td class="duo-self" aria-label="${escapeHtml(rowPlayer)}"></td>`;
      }

      const record = state.duos.get(duoKey(rowPlayer, colPlayer));
      if (!record) {
        return `<td class="duo-empty" data-label="${escapeHtml(colPlayer)}"></td>`;
      }

      const total = record.wins + record.losses;
      const winRate = Math.round(rate(record.wins, total));
      return `<td class="${duoCellClass(winRate)}" data-label="${escapeHtml(colPlayer)}"><span>${winRate}%</span><small>(${record.wins}-${record.losses})</small></td>`;
    }).join("");

    return `<tr><th scope="row" title="${escapeHtml(rowPlayer)}">${escapeHtml(rowPlayer)}</th>${cells}</tr>`;
  }).join("");

  setText(els.duoNote, `${state.players.length} player${state.players.length === 1 ? "" : "s"} included from game lineups.`);
  setHtml(els.duoMatrix, `
    <div class="duo-table-wrap">
      <table class="duo-table" style="--player-count: ${state.players.length}">
        <thead><tr><th scope="col"></th>${headers}</tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  `);
}

function draftSide(cell) {
  if (cell?.startsWith("E")) {
    return "radiant";
  }
  if (cell?.startsWith("F")) {
    return "dire";
  }
  return "";
}

function renderPlayerDraftRows(game) {
  const rows = Array.isArray(game.playerDraft) ? game.playerDraft : [];
  const radiant = rows[0] || [];
  const dire = rows[1] || [];
  const columnCount = Math.max(radiant.length, dire.length);

  if ([...radiant, ...dire].every((cell) => !cell?.value)) {
    return `<p class="empty compact-empty">No recorded player pick order.</p>`;
  }

  return `
    <div class="player-pick-timeline" style="--player-pick-count: ${columnCount}">
      ${Array.from({ length: columnCount }, (_, index) => {
        const radiantCell = radiant[index];
        const direCell = dire[index];
        return `
          <div class="player-pick-step">
            <div class="player-pick-branch top">
              ${radiantCell?.value ? `<span class="player-pick radiant" title="${escapeHtml(radiantCell.cell)}">${escapeHtml(radiantCell.value)}</span>` : ""}
            </div>
            <div class="player-pick-line"></div>
            <div class="player-pick-branch bottom">
              ${direCell?.value ? `<span class="player-pick dire" title="${escapeHtml(direCell.cell)}">${escapeHtml(direCell.value)}</span>` : ""}
            </div>
          </div>
        `;
      }).join("")}
    </div>
  `;
}

function renderDraftEvents(game) {
  if (!Array.isArray(game.heroes) || game.heroes.length === 0) {
    return `<p class="empty compact-empty">No recorded ban/pick phase.</p>`;
  }

  return `
    <div class="draft-timeline" style="--draft-count: ${game.heroes.length}">
      ${game.heroes.map((event, index) => `
        <div class="draft-step ${draftSide(event.cell)} ${event.type}">
          <div class="draft-branch top">
            ${draftSide(event.cell) === "radiant" ? renderDraftBubble(event, index) : ""}
          </div>
          <div class="draft-line"><span>${index + 1}</span></div>
          <div class="draft-branch bottom">
            ${draftSide(event.cell) === "dire" ? renderDraftBubble(event, index) : ""}
          </div>
        </div>
      `).join("")}
    </div>
  `;
}

function renderDraftBubble(event) {
  return `
    <div class="draft-bubble ${event.type}" title="${escapeHtml(event.cell)}">
      <span>${event.type}</span>
      <strong>${escapeHtml(event.name)}</strong>
    </div>
  `;
}

function renderHeroLocks(game) {
  const locks = Array.isArray(game.heroLocks) ? game.heroLocks : [];
  if (locks.length === 0) {
    return `<p class="empty compact-empty">No player hero locks recorded.</p>`;
  }

  return `
    <div class="lock-table-wrap">
      <table class="lock-table">
        <thead>
          <tr>
            <th>Pos</th>
            <th>Radiant Player</th>
            <th>Radiant Hero</th>
            <th>Dire Hero</th>
            <th>Dire Player</th>
          </tr>
        </thead>
        <tbody>
          ${locks.map((lock) => `
            <tr>
              <td>${lock.position}</td>
              <td>${escapeHtml(lock.radiantPlayer)}</td>
              <td class="radiant-lock">${escapeHtml(lock.radiantHero)}</td>
              <td class="dire-lock">${escapeHtml(lock.direHero)}</td>
              <td>${escapeHtml(lock.direPlayer)}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
  `;
}

function renderGameDetail(game) {
  if (!game) {
    setHtml(els.gameDetail, `<p class="empty">Select a game to view the full sheet data.</p>`);
    return;
  }

  const firstPick = game.firstPick?.side ? `${game.firstPick.side} first pick (${game.firstPick.cell}: ${game.firstPick.value})` : "No first-pick marker";
  setHtml(els.gameDetail, `
    <article class="game-detail-card">
      <div class="game-detail-header">
        <div>
          <p class="eyebrow">${escapeHtml(game.name)}</p>
          <h3>Game Details</h3>
        </div>
        <button type="button" id="close-game-detail">Close</button>
      </div>

      <dl class="game-meta">
        <div><dt>Date</dt><dd>${escapeHtml(game.date || "No date")}</dd></div>
        <div><dt>Result</dt><dd>${escapeHtml(game.result || "No result")}</dd></div>
        <div><dt>Match ID</dt><dd>${escapeHtml(game.matchId || "No match ID")}</dd></div>
      </dl>

      <section class="detail-section">
        <h4>Player Ban/Pick Phase</h4>
        ${renderPlayerDraftRows(game)}
      </section>

      <section class="detail-section">
        <h4>Hero Ban/Pick Phase</h4>
        <p class="detail-note">${escapeHtml(firstPick)}</p>
        ${renderDraftEvents(game)}
      </section>

      <section class="detail-section">
        <h4>Player Hero Locks</h4>
        ${renderHeroLocks(game)}
      </section>
    </article>
  `);

  document.getElementById("close-game-detail")?.addEventListener("click", () => {
    state.selectedGame = "";
    renderGames();
  });
}

function renderGames() {
  const selectedGame = state.games.find((game) => game.name === state.selectedGame) || null;
  setHtml(els.gamesList, state.games.map((game) => {
    const picks = game.heroes.filter((hero) => hero.type === "pick").length;
    const bans = game.heroes.filter((hero) => hero.type === "ban").length;

    return `
      <button class="game-card ${game.name === state.selectedGame ? "active" : ""}" type="button" data-game="${escapeHtml(game.name)}">
        <strong>${escapeHtml(game.name)}</strong>
        <span>${escapeHtml(game.date || "No date")} · ${escapeHtml(game.result || "No result")}</span>
        <span>Match ID: ${escapeHtml(game.matchId || "No match ID")}</span>
        <span>${picks} picks · ${bans} bans</span>
      </button>
    `;
  }).join(""));

  for (const card of els.gamesList?.querySelectorAll("[data-game]") || []) {
    card.addEventListener("click", () => {
      state.selectedGame = card.dataset.game;
      renderGames();
      els.gameDetail?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  renderGameDetail(selectedGame);
}

function updateSortButtons() {
  for (const button of els.sortButtons) {
    button.classList.toggle("active", button.dataset.sort === state.sortKey);
    button.classList.toggle("asc", button.dataset.sort === state.sortKey && state.sortDirection === "asc");
    button.classList.toggle("desc", button.dataset.sort === state.sortKey && state.sortDirection === "desc");
  }

  if (els.mobileSort) {
    setValue(els.mobileSort, `${state.sortKey}:${state.sortDirection}`);
  }
}

function updatePositionSortButtons() {
  for (const button of els.positionSortButtons) {
    button.classList.toggle("active", button.dataset.positionSort === state.positionSortKey);
    button.classList.toggle("asc", button.dataset.positionSort === state.positionSortKey && state.positionSortDirection === "asc");
    button.classList.toggle("desc", button.dataset.positionSort === state.positionSortKey && state.positionSortDirection === "desc");
  }
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function setupEvents() {
  els.search?.addEventListener("input", (event) => {
    state.query = event.target.value;
    renderStats();
  });

  els.mobileSort?.addEventListener("change", (event) => {
    const [key, direction] = event.target.value.split(":");
    state.sortKey = key;
    state.sortDirection = direction;
    renderStats();
  });

  els.gameScope?.addEventListener("change", (event) => {
    state.gameLimit = Number(event.target.value) || state.allGames.length;
    applyGameScope();
  });

  for (const button of els.sortButtons) {
    button.addEventListener("click", () => {
      const key = button.dataset.sort;
      if (state.sortKey === key) {
        state.sortDirection = state.sortDirection === "asc" ? "desc" : "asc";
      } else {
        state.sortKey = key;
        state.sortDirection = key === "hero" ? "asc" : "desc";
      }
      renderStats();
    });
  }

  for (const button of els.positionSortButtons) {
    button.addEventListener("click", () => {
      const key = button.dataset.positionSort;
      if (state.positionSortKey === key) {
        state.positionSortDirection = state.positionSortDirection === "asc" ? "desc" : "asc";
      } else {
        state.positionSortKey = key;
        state.positionSortDirection = key === "player" ? "asc" : "desc";
      }
      renderPositionStats();
    });
  }

  for (const button of els.tabButtons) {
    button.addEventListener("click", () => {
      const tab = button.dataset.tab;
      for (const tabButton of els.tabButtons) {
        tabButton.classList.toggle("active", tabButton.dataset.tab === tab);
      }
      for (const panel of els.tabPanels) {
        const active = panel.id === `${tab}-panel`;
        panel.hidden = !active;
        panel.classList.toggle("active", active);
      }
    });
  }
}

async function init() {
  setupEvents();

  try {
    const response = await fetch(API_URL, { cache: "no-store" });
    if (!response.ok) {
      throw new Error(`Unable to load ${API_URL}: ${response.status}`);
    }

    const data = await response.json();
    if (data.error) {
      throw new Error(data.message || "The Google Sheet converter failed.");
    }

    state.allGames = Array.isArray(data.games) ? data.games : [];
    populateGameScope();
    applyGameScope();
  } catch (error) {
    setHtml(els.leaderboardBody, `<tr><td class="error" colspan="7">${escapeHtml(error.message)}</td></tr>`);
    setHtml(els.positionsBody, `<tr><td class="error" colspan="8">${escapeHtml(error.message)}</td></tr>`);
    setText(els.dataNote, "Could not load the Google Sheet data.");
    setHtml(els.statsBody, `<tr><td class="error" colspan="5">${escapeHtml(error.message)}</td></tr>`);
    setHtml(els.duoMatrix, `<p class="error">${escapeHtml(error.message)}</p>`);
  }
}

init();
