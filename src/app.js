const API_URL = "api/games.php";

const state = {
  games: [],
  stats: [],
  players: [],
  leaderboard: [],
  duos: new Map(),
  sortKey: "presenceRate",
  sortDirection: "desc",
  query: "",
};

const els = {
  gamesCount: document.getElementById("games-count"),
  heroesCount: document.getElementById("heroes-count"),
  picksCount: document.getElementById("picks-count"),
  bansCount: document.getElementById("bans-count"),
  dataNote: document.getElementById("data-note"),
  statsBody: document.getElementById("stats-body"),
  leaderboardNote: document.getElementById("leaderboard-note"),
  leaderboardBody: document.getElementById("leaderboard-body"),
  duoNote: document.getElementById("duo-note"),
  duoMatrix: document.getElementById("duo-matrix"),
  gamesList: document.getElementById("games-list"),
  search: document.getElementById("hero-search"),
  mobileSort: document.getElementById("mobile-sort"),
  sortButtons: document.querySelectorAll("[data-sort]"),
  tabButtons: document.querySelectorAll("[data-tab]"),
  tabPanels: document.querySelectorAll(".tab-panel"),
};

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
          banCount: 0,
          games: new Set(),
        });
      }

      const stat = statsByHero.get(event.name);
      if (event.type === "pick") {
        stat.pickCount += 1;
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
    banRate: rate(stat.banCount, gameCount),
    presenceRate: rate(stat.games.size, gameCount),
  }));
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
  return sorted.map((record, index) => {
    if (!previous || record.winRate !== previous.winRate || record.wins !== previous.wins || record.losses !== previous.losses) {
      rank = index + 1;
    }
    previous = record;
    return { ...record, rank };
  });
}

function calculatePlayerStats(games) {
  const players = new Map();
  const duos = new Map();

  for (const game of games) {
    const radiant = playerLineup(game, "radiant");
    const dire = playerLineup(game, "dire");

    if (game.result === "1-0") {
      addLineupResult(players, radiant, true);
      addLineupResult(players, dire, false);
      addDuoResult(duos, radiant, true);
      addDuoResult(duos, dire, false);
    } else if (game.result === "0-1") {
      addLineupResult(players, radiant, false);
      addLineupResult(players, dire, true);
      addDuoResult(duos, radiant, false);
      addDuoResult(duos, dire, true);
    } else {
      for (const player of [...radiant, ...dire]) {
        if (!players.has(player)) {
          players.set(player, { player, games: 0, wins: 0, losses: 0 });
        }
      }
    }
  }

  const leaderboard = sortLeaderboard(players);

  return {
    players: leaderboard.map((record) => record.player),
    leaderboard,
    duos,
  };
}

function formatPercent(value) {
  return `${value.toFixed(value % 1 === 0 ? 0 : 1)}%`;
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
    els.statsBody.innerHTML = `<tr><td class="empty" colspan="6">No heroes found.</td></tr>`;
    return;
  }

  els.statsBody.innerHTML = rows.map((stat) => `
    <tr>
      <td class="hero-name" data-label="Hero">${escapeHtml(stat.hero)}</td>
      <td class="bar-cell" data-label="Pick %">
        <div class="bar-label"><span>${formatPercent(stat.pickRate)}</span></div>
        ${meter(stat.pickRate, "pick-meter")}
      </td>
      <td class="number" data-label="Picks">${stat.pickCount}</td>
      <td class="bar-cell" data-label="Ban %">
        <div class="bar-label"><span>${formatPercent(stat.banRate)}</span></div>
        ${meter(stat.banRate, "ban-meter")}
      </td>
      <td class="number" data-label="Bans">${stat.banCount}</td>
      <td class="bar-cell" data-label="Presence %">
        <div class="bar-label"><span>${formatPercent(stat.presenceRate)}</span></div>
        ${meter(stat.presenceRate, "presence-meter")}
      </td>
    </tr>
  `).join("");
}

function renderSummary() {
  const pickCount = state.games.reduce((sum, game) => sum + game.heroes.filter((hero) => hero.type === "pick").length, 0);
  const banCount = state.games.reduce((sum, game) => sum + game.heroes.filter((hero) => hero.type === "ban").length, 0);

  els.gamesCount.textContent = state.games.length;
  els.heroesCount.textContent = state.stats.length;
  els.picksCount.textContent = pickCount;
  els.bansCount.textContent = banCount;
  els.dataNote.textContent = `Percentages use ${state.games.length} game${state.games.length === 1 ? "" : "s"} as the denominator.`;
}

function leaderboardRowClass(winRate) {
  if (winRate >= 75) {
    return "leaderboard-elite";
  }
  if (winRate >= 60) {
    return "leaderboard-strong";
  }
  if (winRate <= 20) {
    return "leaderboard-low";
  }
  return "";
}

function renderLeaderboard() {
  if (state.leaderboard.length === 0) {
    els.leaderboardBody.innerHTML = `<tr><td class="empty" colspan="7">No player lineup data found. Force refresh the API cache to load player names.</td></tr>`;
    els.leaderboardNote.textContent = "No player lineup data available yet.";
    return;
  }

  els.leaderboardBody.innerHTML = state.leaderboard.map((record) => `
    <tr class="${leaderboardRowClass(record.winRate)}">
      <td class="number" data-label="Ranking">${record.rank}</td>
      <td class="leaderboard-player" data-label="Player">${escapeHtml(record.player)}</td>
      <td class="number" data-label="Games">${record.games}</td>
      <td class="number" data-label="Win">${record.wins}</td>
      <td class="number" data-label="Lose">${record.losses}</td>
      <td class="number" data-label="Score">${record.wins} - ${record.losses}</td>
      <td class="number" data-label="Winrate">${record.winRate.toFixed(2)}%</td>
    </tr>
  `).join("");
  els.leaderboardNote.textContent = `${state.leaderboard.length} player${state.leaderboard.length === 1 ? "" : "s"} ranked by win rate.`;
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
    els.duoMatrix.innerHTML = `<p class="empty">No player lineup data found. Force refresh the API cache to load player names.</p>`;
    els.duoNote.textContent = "No player lineup data available yet.";
    return;
  }

  const headers = state.players.map((player) => `<th scope="col">${escapeHtml(player)}</th>`).join("");
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
      return `<td class="${duoCellClass(winRate)}" data-label="${escapeHtml(colPlayer)}">${winRate}% (${record.wins}-${record.losses})</td>`;
    }).join("");

    return `<tr><th scope="row">${escapeHtml(rowPlayer)}</th>${cells}</tr>`;
  }).join("");

  els.duoNote.textContent = `${state.players.length} player${state.players.length === 1 ? "" : "s"} included from game lineups.`;
  els.duoMatrix.innerHTML = `
    <div class="duo-table-wrap">
      <table class="duo-table">
        <thead><tr><th scope="col"></th>${headers}</tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  `;
}

function renderGames() {
  els.gamesList.innerHTML = state.games.map((game) => {
    const picks = game.heroes.filter((hero) => hero.type === "pick").length;
    const bans = game.heroes.filter((hero) => hero.type === "ban").length;

    return `
      <article class="game-card">
        <strong>${escapeHtml(game.name)}</strong>
        <span>${escapeHtml(game.date || "No date")} · ${escapeHtml(game.result || "No result")}</span>
        <span>${picks} picks · ${bans} bans</span>
      </article>
    `;
  }).join("");
}

function updateSortButtons() {
  for (const button of els.sortButtons) {
    button.classList.toggle("active", button.dataset.sort === state.sortKey);
    button.classList.toggle("asc", button.dataset.sort === state.sortKey && state.sortDirection === "asc");
    button.classList.toggle("desc", button.dataset.sort === state.sortKey && state.sortDirection === "desc");
  }

  if (els.mobileSort) {
    els.mobileSort.value = `${state.sortKey}:${state.sortDirection}`;
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
  els.search.addEventListener("input", (event) => {
    state.query = event.target.value;
    renderStats();
  });

  els.mobileSort.addEventListener("change", (event) => {
    const [key, direction] = event.target.value.split(":");
    state.sortKey = key;
    state.sortDirection = direction;
    renderStats();
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

    state.games = Array.isArray(data.games) ? data.games : [];
    state.stats = calculateStats(state.games);
    const playerStats = calculatePlayerStats(state.games);
    state.players = playerStats.players;
    state.leaderboard = playerStats.leaderboard;
    state.duos = playerStats.duos;

    renderSummary();
    renderLeaderboard();
    renderStats();
    renderDuoMatrix();
    renderGames();
  } catch (error) {
    els.leaderboardBody.innerHTML = `<tr><td class="error" colspan="7">${escapeHtml(error.message)}</td></tr>`;
    els.dataNote.textContent = "Could not load the Google Sheet data.";
    els.statsBody.innerHTML = `<tr><td class="error" colspan="6">${escapeHtml(error.message)}</td></tr>`;
    els.duoMatrix.innerHTML = `<p class="error">${escapeHtml(error.message)}</p>`;
  }
}

init();
