const STORAGE_KEYS = {
  USERS: "cineshelf_users",
  SESSION: "cineshelf_session",
  ITEMS_PREFIX: "cineshelf_items_",
  FEATURED: "cineshelf_featured"
};

const AuthService = {
  initDefaults() {
    // Seed default admin if not present
    const users = this.getUsers();
    const adminEmail = "admin@cineshelf.app";
    if (!users.some((u) => u.email === adminEmail)) {
      const adminUser = {
        id: "usr_admin_1",
        name: "Site Admin",
        email: adminEmail,
        password: "admin123",
        role: "admin"
      };
      users.push(adminUser);
      this.saveUsers(users);
      this.seedStarterWatchlist(adminUser.id);
    }

    // Seed global featured picks if not present
    if (!localStorage.getItem(STORAGE_KEYS.FEATURED)) {
      const defaultFeatured = [
        {
          id: "feat_1",
          title: "Andor",
          type: "Series",
          platform: "Disney+",
          totalEpisodes: 12,
          genre: "Sci-Fi Spy Thriller"
        },
        {
          id: "feat_2",
          title: "Past Lives",
          type: "Movie",
          platform: "Netflix",
          totalEpisodes: 1,
          genre: "Romance Drama"
        }
      ];
      localStorage.setItem(STORAGE_KEYS.FEATURED, JSON.stringify(defaultFeatured));
    }
  },

  getUsers() {
    return JSON.parse(localStorage.getItem(STORAGE_KEYS.USERS) || "[]");
  },

  saveUsers(users) {
    localStorage.setItem(STORAGE_KEYS.USERS, JSON.stringify(users));
  },

  getCurrentUser() {
    return JSON.parse(localStorage.getItem(STORAGE_KEYS.SESSION) || "null");
  },

  register({ name, email, password }) {
    const users = this.getUsers();
    const normalizedEmail = email.trim().toLowerCase();

    if (users.some((u) => u.email === normalizedEmail)) {
      return { ok: false, message: "An account with this email already exists." };
    }

    const newUser = {
      id: "usr_" + Date.now(),
      name: name.trim(),
      email: normalizedEmail,
      password,
      role: "user"
    };

    users.push(newUser);
    this.saveUsers(users);
    this.seedStarterWatchlist(newUser.id);
    this.setSession(newUser);

    return { ok: true, user: newUser };
  },

  login({ email, password }) {
    const users = this.getUsers();
    const normalizedEmail = email.trim().toLowerCase();
    const user = users.find(
      (u) => u.email === normalizedEmail && u.password === password
    );

    if (!user) {
      return { ok: false, message: "Invalid email or password." };
    }

    this.setSession(user);
    return { ok: true, user };
  },

  loginDemo() {
    const demoEmail = "demo@cineshelf.app";
    let user = this.getUsers().find((u) => u.email === demoEmail);

    if (!user) {
      const res = this.register({
        name: "Demo Cinephile",
        email: demoEmail,
        password: "demo"
      });
      user = res.user;
    } else {
      this.setSession(user);
    }
    return user;
  },

  loginAdminDemo() {
    this.initDefaults();
    const admin = this.getUsers().find((u) => u.email === "admin@cineshelf.app");
    this.setSession(admin);
    return admin;
  },

  setSession(user) {
    const safeSession = {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role || "user"
    };
    localStorage.setItem(STORAGE_KEYS.SESSION, JSON.stringify(safeSession));
  },

  logout() {
    localStorage.removeItem(STORAGE_KEYS.SESSION);
    window.location.href = "index.html";
  },

  seedStarterWatchlist(userId) {
    const key = STORAGE_KEYS.ITEMS_PREFIX + userId;
    if (localStorage.getItem(key)) return;

    const starterItems = [
      {
        id: "itm_1",
        title: "Severance",
        type: "Series",
        status: "Watching",
        platform: "Apple TV+",
        season: 2,
        episode: 4,
        totalEpisodes: 10,
        rating: 5,
        genre: "Sci-Fi Thriller",
        notes: "Incredible pacing, eerie office mystery, and top-tier cinematography."
      },
      {
        id: "itm_2",
        title: "Dune: Part Two",
        type: "Movie",
        status: "Completed",
        platform: "Max",
        season: 1,
        episode: 1,
        totalEpisodes: 1,
        rating: 5,
        genre: "Sci-Fi Epic",
        notes: "Massive sound design and visual scale. Best watched with good speakers."
      }
    ];

    localStorage.setItem(key, JSON.stringify(starterItems));
  }
};

// Page Routing & Role Guard
document.addEventListener("DOMContentLoaded", () => {
  AuthService.initDefaults();

  const isAuthPage = Boolean(document.getElementById("login-form"));
  const isAdminPage = Boolean(document.getElementById("admin-users-tbody"));
  const currentUser = AuthService.getCurrentUser();

  if (isAuthPage) {
    if (currentUser) {
      window.location.href = currentUser.role === "admin" ? "admin.html" : "dashboard.html";
      return;
    }
    initAuthForms();
    return;
  }

  // Require login on all protected pages
  if (!currentUser) {
    window.location.href = "index.html";
    return;
  }

  // Block non-admins from admin.html
  if (isAdminPage && currentUser.role !== "admin") {
    window.location.href = "dashboard.html";
    return;
  }

  // Show Admin nav link if user is admin
  const adminNavLink = document.getElementById("nav-admin-link");
  if (adminNavLink && currentUser.role === "admin") {
    adminNavLink.classList.remove("hidden");
  }

  const greeting = document.getElementById("user-greeting");
  if (greeting) {
    greeting.textContent =
      currentUser.role === "admin" ? `${currentUser.name} (Admin)` : currentUser.name;
  }

  const logoutBtn = document.getElementById("logout-btn");
  if (logoutBtn) logoutBtn.addEventListener("click", () => AuthService.logout());
});

function initAuthForms() {
  const tabBtns = document.querySelectorAll(".tab-btn");
  const loginForm = document.getElementById("login-form");
  const regForm = document.getElementById("register-form");
  const msgBox = document.getElementById("auth-message");

  const showMessage = (text, type = "error") => {
    msgBox.textContent = text;
    msgBox.className = `alert ${type}`;
  };

  tabBtns.forEach((btn) => {
    btn.addEventListener("click", () => {
      tabBtns.forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      msgBox.classList.add("hidden");

      const isLogin = btn.dataset.tab === "login";
      loginForm.classList.toggle("hidden", !isLogin);
      regForm.classList.toggle("hidden", isLogin);
    });
  });

  loginForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const res = AuthService.login({
      email: document.getElementById("login-email").value,
      password: document.getElementById("login-password").value
    });
    if (!res.ok) return showMessage(res.message, "error");
    window.location.href = res.user.role === "admin" ? "admin.html" : "dashboard.html";
  });

  regForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const res = AuthService.register({
      name: document.getElementById("reg-name").value,
      email: document.getElementById("reg-email").value,
      password: document.getElementById("reg-password").value
    });
    if (!res.ok) return showMessage(res.message, "error");
    window.location.href = "dashboard.html";
  });

  document.getElementById("demo-login-btn").addEventListener("click", () => {
    AuthService.loginDemo();
    window.location.href = "dashboard.html";
  });

  const adminDemoBtn = document.getElementById("admin-login-btn");
  if (adminDemoBtn) {
    adminDemoBtn.addEventListener("click", () => {
      AuthService.loginAdminDemo();
      window.location.href = "admin.html";
    });
  }
}
