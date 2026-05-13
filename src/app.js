const API_URL = "api/games.php";

const state = {
  games: [],
  stats: [],
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
  gamesList: document.getElementById("games-list"),
  search: document.getElementById("hero-search"),
  mobileSort: document.getElementById("mobile-sort"),
  sortButtons: document.querySelectorAll("[data-sort]"),
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

    renderSummary();
    renderStats();
    renderGames();
  } catch (error) {
    els.dataNote.textContent = "Could not load the Google Sheet data.";
    els.statsBody.innerHTML = `<tr><td class="error" colspan="6">${escapeHtml(error.message)}</td></tr>`;
  }
}

init();
