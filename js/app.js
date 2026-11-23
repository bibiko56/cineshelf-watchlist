const WatchlistStore = {
  getKey() {
    const user = AuthService.getCurrentUser();
    return STORAGE_KEYS.ITEMS_PREFIX + user.id;
  },

  normalizeSeasons(item) {
    if (Array.isArray(item.seasons) && item.seasons.length > 0) {
      return item.seasons.map((s, idx) => ({
        seasonNumber: Number(s.seasonNumber) || idx + 1,
        watched: Math.max(0, Number(s.watched) || 0),
        totalEpisodes: s.totalEpisodes ? Math.max(1, Number(s.totalEpisodes)) : null
      }));
    }

    // Fallback for legacy/starter items
    const seasonCount = Math.max(1, Number(item.season) || 1);
    const seasons = [];
    for (let i = 1; i <= seasonCount; i++) {
      seasons.push({
        seasonNumber: i,
        watched: i === seasonCount ? Math.max(0, Number(item.episode) || 0) : 0,
        totalEpisodes: item.totalEpisodes ? Math.max(1, Number(item.totalEpisodes)) : null
      });
    }
    return seasons;
  },

  getSeriesTotals(item) {
    const seasons = this.normalizeSeasons(item);
    const watched = seasons.reduce((sum, s) => sum + s.watched, 0);
    const hasAllTotals = seasons.length > 0 && seasons.every((s) => Boolean(s.totalEpisodes));
    const total = hasAllTotals
      ? seasons.reduce((sum, s) => sum + s.totalEpisodes, 0)
      : null;

    return { seasons, watched, total, hasAllTotals };
  },

  getAll() {
    const raw = JSON.parse(localStorage.getItem(this.getKey()) || "[]");
    return raw.map((item) =>
      item.type === "Series"
        ? { ...item, seasons: this.normalizeSeasons(item) }
        : item
    );
  },

  saveAll(items) {
    localStorage.setItem(this.getKey(), JSON.stringify(items));
  },

  upsert(item) {
    const items = this.getAll();
    const index = items.findIndex((i) => i.id === item.id);
    if (index > -1) {
      items[index] = item;
    } else {
      items.unshift(item);
    }
    this.saveAll(items);
  },

  remove(id) {
    const items = this.getAll().filter((i) => i.id !== id);
    this.saveAll(items);
  },

  stepSeasonEpisode(itemId, seasonNumber, delta) {
    const items = this.getAll();
    const item = items.find((i) => i.id === itemId);
    if (!item || item.type !== "Series") return;

    const seasons = this.normalizeSeasons(item);
    const target = seasons.find((s) => s.seasonNumber === Number(seasonNumber));
    if (!target) return;

    const maxEp = target.totalEpisodes || 9999;
    target.watched = Math.max(0, Math.min(maxEp, target.watched + delta));
    item.seasons = seasons;

    const totals = this.getSeriesTotals(item);
    if (totals.hasAllTotals && totals.total > 0 && totals.watched >= totals.total) {
      item.status = "Completed";
    } else if (totals.watched > 0 && item.status === "Plan to Watch") {
      item.status = "Watching";
    }

    this.saveAll(items);
  }
};

document.addEventListener("DOMContentLoaded", () => {
  if (document.getElementById("watchlist-grid")) {
    initDashboard();
  }
  if (document.getElementById("kpi-grid")) {
    initStatsPage();
  }
  if (document.getElementById("admin-users-tbody")) {
    initAdminPage();
  }
});

/* ================= DASHBOARD LOGIC ================= */
function initDashboard() {
  const grid = document.getElementById("watchlist-grid");
  const modal = document.getElementById("item-modal");
  const form = document.getElementById("item-form");
  const typeSelect = document.getElementById("item-type");
  const seriesFields = document.getElementById("series-fields");
  const seasonsListEl = document.getElementById("seasons-list");
  const addSeasonBtn = document.getElementById("add-season-btn");
  const modalSummaryEl = document.getElementById("modal-series-summary");

  const searchInput = document.getElementById("search-input");
  const filterType = document.getElementById("filter-type");
  const filterStatus = document.getElementById("filter-status");
  const filterPlatform = document.getElementById("filter-platform");
  const filterGenre = document.getElementById("filter-genre");

  let draftSeasons = [];

  const updateModalSummary = () => {
    if (!modalSummaryEl) return;
    const watchedSum = draftSeasons.reduce((acc, s) => acc + (Number(s.watched) || 0), 0);
    const hasTotals = draftSeasons.length > 0 && draftSeasons.every((s) => Number(s.totalEpisodes) > 0);
    const totalSum = hasTotals
      ? draftSeasons.reduce((acc, s) => acc + Number(s.totalEpisodes), 0)
      : null;

    modalSummaryEl.textContent = totalSum
      ? `Overall: ${watchedSum} / ${totalSum} episodes across ${draftSeasons.length} season(s)`
      : `Watched: ${watchedSum} episode(s) across ${draftSeasons.length} season(s)`;
  };

  const renderDraftSeasons = () => {
    draftSeasons.forEach((s, idx) => {
      s.seasonNumber = idx + 1;
    });

    seasonsListEl.innerHTML = draftSeasons
      .map(
        (s, idx) => `
        <div class="season-editor-row" data-idx="${idx}">
          <span class="season-tag">Season ${s.seasonNumber}</span>
          <input
            type="number"
            class="draft-watched"
            min="0"
            ${s.totalEpisodes ? `max="${s.totalEpisodes}"` : ""}
            value="${s.watched}"
            placeholder="Watched"
            aria-label="Season ${s.seasonNumber} episodes watched"
          />
          <input
            type="number"
            class="draft-total"
            min="1"
            value="${s.totalEpisodes || ""}"
            placeholder="Total eps"
            aria-label="Season ${s.seasonNumber} total episodes"
          />
          ${
            draftSeasons.length > 1
              ? `<button type="button" class="btn btn-danger btn-sm remove-season-btn" title="Remove Season">&times;</button>`
              : `<span></span>`
          }
        </div>
      `
      )
      .join("");

    updateModalSummary();
  };

  const syncDraftFromInputs = () => {
    const rows = seasonsListEl.querySelectorAll(".season-editor-row");
    draftSeasons = Array.from(rows).map((row, idx) => {
      const watchedVal = Math.max(0, Number(row.querySelector(".draft-watched").value) || 0);
      const rawTotal = Number(row.querySelector(".draft-total").value);
      const totalVal = rawTotal > 0 ? rawTotal : null;
      return {
        seasonNumber: idx + 1,
        watched: totalVal ? Math.min(watchedVal, totalVal) : watchedVal,
        totalEpisodes: totalVal
      };
    });
    updateModalSummary();
  };

  seasonsListEl.addEventListener("input", syncDraftFromInputs);

  seasonsListEl.addEventListener("click", (e) => {
    const removeBtn = e.target.closest(".remove-season-btn");
    if (!removeBtn) return;
    syncDraftFromInputs();
    const row = removeBtn.closest(".season-editor-row");
    const idx = Number(row.dataset.idx);
    draftSeasons.splice(idx, 1);
    renderDraftSeasons();
  });

  addSeasonBtn.addEventListener("click", () => {
    syncDraftFromInputs();
    draftSeasons.push({
      seasonNumber: draftSeasons.length + 1,
      watched: 0,
      totalEpisodes: 10
    });
    renderDraftSeasons();
  });

  const toggleSeriesFields = () => {
    seriesFields.classList.toggle("hidden", typeSelect.value === "Movie");
  };
  typeSelect.addEventListener("change", toggleSeriesFields);

  const openModal = (item = null) => {
    form.reset();
    document.getElementById("item-id").value = item ? item.id : "";
    document.getElementById("modal-title").textContent = item ? "Edit Title" : "Add to Watchlist";

    if (item) {
      document.getElementById("item-title").value = item.title;
      document.getElementById("item-type").value = item.type;
      document.getElementById("item-status").value = item.status;
      document.getElementById("item-platform").value = item.platform;
      document.getElementById("item-rating").value = item.rating || 0;
      document.getElementById("item-genre").value = item.genre || "";
      document.getElementById("item-notes").value = item.notes || "";
      draftSeasons =
        item.type === "Series"
          ? WatchlistStore.normalizeSeasons(item)
          : [{ seasonNumber: 1, watched: 0, totalEpisodes: 10 }];
    } else {
      draftSeasons = [{ seasonNumber: 1, watched: 0, totalEpisodes: 10 }];
    }

    renderDraftSeasons();
    toggleSeriesFields();
    modal.classList.remove("hidden");
  };

  const closeModal = () => modal.classList.add("hidden");

  document.getElementById("open-modal-btn").addEventListener("click", () => openModal());
  document.getElementById("close-modal-btn").addEventListener("click", closeModal);
  document.getElementById("cancel-modal-btn").addEventListener("click", closeModal);

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    syncDraftFromInputs();

    const existingId = document.getElementById("item-id").value;
    const type = typeSelect.value;

    const entry = {
      id: existingId || "itm_" + Date.now(),
      title: document.getElementById("item-title").value.trim(),
      type,
      status: document.getElementById("item-status").value,
      platform: document.getElementById("item-platform").value,
      seasons: type === "Series" ? draftSeasons : [],
      rating: Number(document.getElementById("item-rating").value) || 0,
      genre: document.getElementById("item-genre").value.trim(),
      notes: document.getElementById("item-notes").value.trim()
    };

    WatchlistStore.upsert(entry);
    closeModal();
    renderCards();
  });

   [searchInput, filterType, filterStatus, filterPlatform, filterGenre].forEach((el) => {
    el.addEventListener("input", renderCards);
  });

  function renderCards() {
    const query = searchInput.value.toLowerCase();
    const items = WatchlistStore.getAll().filter((item) => {
      const matchesQuery =
        item.title.toLowerCase().includes(query) ||
        (item.genre && item.genre.toLowerCase().includes(query)) ||
        (item.notes && item.notes.toLowerCase().includes(query));
      const matchesType = filterType.value === "all" || item.type === filterType.value;
      const matchesStatus = filterStatus.value === "all" || item.status === filterStatus.value;
      const matchesPlatform = filterPlatform.value === "all" || item.platform === filterPlatform.value;
      const matchesGenre = filterGenre.value === "all" || item.genre === filterGenre.value;
      return matchesQuery && matchesType && matchesStatus && matchesPlatform;
    });

    if (!items.length) {
      grid.innerHTML = `<div class="empty-state">No titles match your filters. Click <strong>+ Add Title</strong> to log something new.</div>`;
      return;
    }

    grid.innerHTML = items
      .map((item) => {
        const stars = item.rating > 0 ? "★".repeat(item.rating) + "☆".repeat(5 - item.rating) : "Unrated";
        const statusClass = item.status.startsWith("Plan") ? "Plan" : item.status;

        let progressHTML = "";
        if (item.type === "Series") {
          const { seasons, watched, total, hasAllTotals } = WatchlistStore.getSeriesTotals(item);
          const overallPct = hasAllTotals && total > 0
            ? Math.min(100, Math.round((watched / total) * 100))
            : item.status === "Completed"
            ? 100
            : 0;

          const seasonBreakdownHTML = seasons
            .map((s) => {
              const sPct = s.totalEpisodes
                ? Math.min(100, Math.round((s.watched / s.totalEpisodes) * 100))
                : s.watched > 0
                ? 50
                : 0;
              return `
                <div class="season-row-item">
                  <div class="season-row-top">
                    <span><strong>S${s.seasonNumber}:</strong> ${s.watched}${s.totalEpisodes ? ` / ${s.totalEpisodes}` : ""} eps</span>
                    <div class="season-mini-controls">
                      <button
                        class="stepper-btn xs"
                        data-action="step-season"
                        data-id="${item.id}"
                        data-season="${s.seasonNumber}"
                        data-delta="-1"
                        title="Decrease Season ${s.seasonNumber} episode"
                      >-</button>
                      <button
                        class="stepper-btn xs"
                        data-action="step-season"
                        data-id="${item.id}"
                        data-season="${s.seasonNumber}"
                        data-delta="1"
                        title="Watched +1 episode in Season ${s.seasonNumber}"
                      >+</button>
                    </div>
                  </div>
                  <div class="progress-track sm">
                    <div class="progress-fill" style="width: ${sPct}%"></div>
                  </div>
                </div>
              `;
            })
            .join("");

          progressHTML = `
            <div class="progress-box">
              <div class="overall-progress-label">
                <span>All Seasons (${seasons.length})</span>
                <span>${watched}${hasAllTotals ? ` / ${total}` : ""} eps${hasAllTotals ? ` • ${overallPct}%` : ""}</span>
              </div>
              <div class="progress-track">
                <div class="progress-fill" style="width: ${overallPct}%"></div>
              </div>
              <div class="season-rows">
                ${seasonBreakdownHTML}
              </div>
            </div>
          `;
        } else {
          progressHTML = `
            <div class="progress-box">
              <div class="progress-header"><span>Feature Film</span><span>${item.status}</span></div>
            </div>
          `;
        }

        return `
          <article class="media-card">
            <div>
              <div class="card-top">
                <h3 class="card-title">${escapeHTML(item.title)}</h3>
                <span class="stars">${stars}</span>
              </div>
              <div class="tag-row">
                <span class="badge status-${statusClass}">${item.status}</span>
                <span class="badge">${escapeHTML(item.platform)}</span>
                ${item.genre ? `<span class="badge">${escapeHTML(item.genre)}</span>` : ""}
              </div>
            </div>

            ${progressHTML}

            ${item.notes ? `<p class="review-note">"${escapeHTML(item.notes)}"</p>` : ""}

            <div class="card-footer">
              <button class="btn btn-ghost btn-sm" data-action="edit" data-id="${item.id}">Edit</button>
              <button class="btn btn-danger btn-sm" data-action="delete" data-id="${item.id}">Delete</button>
            </div>
          </article>
        `;
      })
      .join("");
  }

  grid.addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-action]");
    if (!btn) return;

    const { action, id } = btn.dataset;
    if (action === "step-season") {
      const seasonNum = Number(btn.dataset.season);
      const delta = Number(btn.dataset.delta);
      WatchlistStore.stepSeasonEpisode(id, seasonNum, delta);
      renderCards();
    } else if (action === "edit") {
      const item = WatchlistStore.getAll().find((i) => i.id === id);
      if (item) openModal(item);
    } else if (action === "delete") {
      WatchlistStore.remove(id);
      renderCards();
    }
  });

  renderFeaturedBanner();
  renderCards();
}

/* ================= STATS & BACKUP LOGIC ================= */
function initStatsPage() {
  const items = WatchlistStore.getAll();
  const rated = items.filter((i) => i.rating > 0);
  const avgRating = rated.length
    ? (rated.reduce((sum, i) => sum + i.rating, 0) / rated.length).toFixed(1)
    : "—";
  const totalEpisodes = items
    .filter((i) => i.type === "Series")
    .reduce((sum, i) => sum + WatchlistStore.getSeriesTotals(i).watched, 0);

  document.getElementById("kpi-grid").innerHTML = `
    <div class="kpi-card"><span class="subtitle">Total Titles</span><div class="kpi-value">${items.length}</div></div>
    <div class="kpi-card"><span class="subtitle">Completed</span><div class="kpi-value">${items.filter((i) => i.status === "Completed").length}</div></div>
    <div class="kpi-card"><span class="subtitle">Episodes Watched</span><div class="kpi-value">${totalEpisodes}</div></div>
    <div class="kpi-card"><span class="subtitle">Avg. Star Rating</span><div class="kpi-value">${avgRating} ★</div></div>
  `;

  const renderBreakdown = (containerId, key) => {
    const counts = items.reduce((acc, item) => {
      acc[item[key]] = (acc[item[key]] || 0) + 1;
      return acc;
    }, {});
    const entries = Object.entries(counts).sort((a, b) => b[1] - a[1]);

    document.getElementById(containerId).innerHTML = entries.length
      ? entries
          .map(([label, count]) => `<div class="breakdown-item"><span>${escapeHTML(label)}</span><strong>${count}</strong></div>`)
          .join("")
      : `<p class="subtitle">No data logged yet.</p>`;
  };

  renderBreakdown("status-breakdown", "status");
  renderBreakdown("platform-breakdown", "platform");

  document.getElementById("export-btn").addEventListener("click", () => {
    const blob = new Blob([JSON.stringify(items, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "cineshelf-watchlist-backup.json";
    a.click();
    URL.revokeObjectURL(url);
  });

  document.getElementById("import-input").addEventListener("change", (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const imported = JSON.parse(event.target.result);
        if (!Array.isArray(imported)) throw new Error("Invalid format");
        WatchlistStore.saveAll(imported);
        initStatsPage();
        alert("Watchlist restored successfully!");
      } catch {
        alert("Invalid JSON backup file.");
      }
    };
    reader.readAsText(file);
  });
}

/* ================= FEATURED CATALOG & ADMIN LOGIC ================= */
const FeaturedStore = {
  getAll() {
    return JSON.parse(localStorage.getItem(STORAGE_KEYS.FEATURED) || "[]");
  },
  saveAll(list) {
    localStorage.setItem(STORAGE_KEYS.FEATURED, JSON.stringify(list));
  }
};

function renderFeaturedBanner() {
  const container = document.getElementById("featured-pills");
  const banner = document.getElementById("featured-banner");
  if (!container || !banner) return;

  const featured = FeaturedStore.getAll();
  const userItems = WatchlistStore.getAll();

  if (!featured.length) {
    banner.classList.add("hidden");
    return;
  }

  banner.classList.remove("hidden");
  container.innerHTML = featured
    .map((f) => {
      const alreadyAdded = userItems.some(
        (u) => u.title.toLowerCase() === f.title.toLowerCase()
      );
      return `
        <div class="featured-chip">
          <div>
            <strong>${escapeHTML(f.title)}</strong>
            <span class="subtitle" style="margin-left:0.35rem;">(${escapeHTML(f.platform)})</span>
          </div>
          <button
            class="btn btn-sm ${alreadyAdded ? "btn-ghost" : "btn-primary"}"
            data-feat-id="${f.id}"
            ${alreadyAdded ? "disabled" : ""}
          >
            ${alreadyAdded ? "Saved" : "+ Add"}
          </button>
        </div>
      `;
    })
    .join("");

  container.onclick = (e) => {
    const btn = e.target.closest("button[data-feat-id]");
    if (!btn) return;
    const pick = FeaturedStore.getAll().find((f) => f.id === btn.dataset.featId);
    if (!pick) return;

    WatchlistStore.upsert({
      id: "itm_" + Date.now(),
      title: pick.title,
      type: pick.type,
      status: "Plan to Watch",
      platform: pick.platform,
      seasons:
        pick.type === "Series"
          ? [{ seasonNumber: 1, watched: 0, totalEpisodes: Number(pick.totalEpisodes) || 10 }]
          : [],
      rating: 0,
      genre: pick.genre || "",
      notes: "Added from Featured Picks."
    });

    renderFeaturedBanner();
    document.getElementById("search-input").dispatchEvent(new Event("input"));
  };
}

function initAdminPage() {
  const currentUser = AuthService.getCurrentUser();
  const usersTbody = document.getElementById("admin-users-tbody");
  const featForm = document.getElementById("featured-form");
  const featList = document.getElementById("admin-featured-list");

  function renderAdminDashboard() {
    const users = AuthService.getUsers();
    const featured = FeaturedStore.getAll();

    let totalSavedTitles = 0;
    const userCounts = {};
    users.forEach((u) => {
      const list = JSON.parse(localStorage.getItem(STORAGE_KEYS.ITEMS_PREFIX + u.id) || "[]");
      userCounts[u.id] = list.length;
      totalSavedTitles += list.length;
    });

    document.getElementById("admin-kpi-grid").innerHTML = `
      <div class="kpi-card"><span class="subtitle">Registered Accounts</span><div class="kpi-value">${users.length}</div></div>
      <div class="kpi-card"><span class="subtitle">Total Watchlist Entries</span><div class="kpi-value">${totalSavedTitles}</div></div>
      <div class="kpi-card"><span class="subtitle">Published Featured Picks</span><div class="kpi-value">${featured.length}</div></div>
    `;

    usersTbody.innerHTML = users
      .map((u) => {
        const isSelf = u.id === currentUser.id;
        return `
          <tr>
            <td data-label="Name"><strong>${escapeHTML(u.name)}</strong> ${isSelf ? "(You)" : ""}</td>
            <td data-label="Email">${escapeHTML(u.email)}</td>
            <td data-label="Role"><span class="role-badge ${u.role || "user"}">${u.role || "user"}</span></td>
            <td data-label="Saved Titles">${userCounts[u.id] || 0}</td>
            <td data-label="Actions">
              ${
                isSelf
                  ? `<span class="subtitle">Current Session</span>`
                  : `
                    <button class="btn btn-ghost btn-sm" data-user-action="toggle-role" data-id="${u.id}">
                      ${u.role === "admin" ? "Demote to User" : "Make Admin"}
                    </button>
                    <button class="btn btn-danger btn-sm" data-user-action="delete" data-id="${u.id}">
                      Delete
                    </button>
                  `
              }
            </td>
          </tr>
        `;
      })
      .join("");

    featList.innerHTML = featured.length
      ? featured
          .map(
            (f) => `
          <article class="media-card">
            <div>
              <h3 class="card-title">${escapeHTML(f.title)}</h3>
              <div class="tag-row">
                <span class="badge">${f.type}</span>
                <span class="badge">${escapeHTML(f.platform)}</span>
                ${f.genre ? `<span class="badge">${escapeHTML(f.genre)}</span>` : ""}
              </div>
            </div>
            <div class="card-footer">
              <button class="btn btn-danger btn-sm" data-feat-delete="${f.id}">Remove Pick</button>
            </div>
          </article>
        `
          )
          .join("")
      : `<div class="empty-state">No featured picks published yet.</div>`;
  }

  usersTbody.addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-user-action]");
    if (!btn) return;

    const { userAction, id } = btn.dataset;
    let users = AuthService.getUsers();

    if (userAction === "toggle-role") {
      users = users.map((u) =>
        u.id === id ? { ...u, role: u.role === "admin" ? "user" : "admin" } : u
      );
      AuthService.saveUsers(users);
    } else if (userAction === "delete") {
      users = users.filter((u) => u.id !== id);
      AuthService.saveUsers(users);
      localStorage.removeItem(STORAGE_KEYS.ITEMS_PREFIX + id);
    }

    renderAdminDashboard();
  });

  featForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const list = FeaturedStore.getAll();
    const type = document.getElementById("feat-type").value;

    list.unshift({
      id: "feat_" + Date.now(),
      title: document.getElementById("feat-title").value.trim(),
      type,
      platform: document.getElementById("feat-platform").value,
      totalEpisodes: type === "Series" ? Number(document.getElementById("feat-episodes").value) || null : 1,
      genre: document.getElementById("feat-genre").value.trim()
    });

    FeaturedStore.saveAll(list);
    featForm.reset();
    renderAdminDashboard();
  });

  featList.addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-feat-delete]");
    if (!btn) return;
    const updated = FeaturedStore.getAll().filter((f) => f.id !== btn.dataset.featDelete);
    FeaturedStore.saveAll(updated);
    renderAdminDashboard();
  });

  renderAdminDashboard();
}

function escapeHTML(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
