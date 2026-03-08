const STORAGE_KEY = "erettsegi-site-data-v1";
const CONFIG_KEY = "erettsegi-site-github-config-v1";

const state = {
  data: { subjects: [], meta: { version: 1, lastSavedAt: null } },
  selectedSubjectId: null,
  selectedPageId: null,
  selectedImageFigure: null,
  modalSubmitHandler: null,
  confirmHandler: null,
  githubConfig: loadGithubConfig(),
  saveTimer: null,
  syncTimer: null,
  remoteLoaded: false,
};

const els = {
  subjectsList: document.getElementById("subjectsList"),
  subjectSearch: document.getElementById("subjectSearch"),
  pagesList: document.getElementById("pagesList"),
  heroTitle: document.getElementById("heroTitle"),
  heroSubtitle: document.getElementById("heroSubtitle"),
  addSubjectBtn: document.getElementById("addSubjectBtn"),
  addPageBtn: document.getElementById("addPageBtn"),
  renameCurrentPageBtn: document.getElementById("renameCurrentPageBtn"),
  deletePageBtn: document.getElementById("deletePageBtn"),
  saveNowBtn: document.getElementById("saveNowBtn"),
  settingsBtn: document.getElementById("settingsBtn"),
  syncStatus: document.getElementById("syncStatus"),
  syncDot: document.getElementById("syncDot"),
  pageTitleInput: document.getElementById("pageTitleInput"),
  pageMeta: document.getElementById("pageMeta"),
  editor: document.getElementById("editor"),
  editorPlaceholder: document.getElementById("editorPlaceholder"),
  editorToolbar: document.getElementById("editorToolbar"),
  insertImageBtn: document.getElementById("insertImageBtn"),
  imageInput: document.getElementById("imageInput"),
  insertDividerBtn: document.getElementById("insertDividerBtn"),
  clearFormattingBtn: document.getElementById("clearFormattingBtn"),
  imageControls: document.getElementById("imageControls"),
  removeSelectedImageBtn: document.getElementById("removeSelectedImageBtn"),
  modalBackdrop: document.getElementById("modalBackdrop"),
  itemModal: document.getElementById("itemModal"),
  itemModalTitle: document.getElementById("itemModalTitle"),
  itemModalInput: document.getElementById("itemModalInput"),
  itemModalSubmit: document.getElementById("itemModalSubmit"),
  confirmModal: document.getElementById("confirmModal"),
  confirmTitle: document.getElementById("confirmTitle"),
  confirmMessage: document.getElementById("confirmMessage"),
  confirmSubmit: document.getElementById("confirmSubmit"),
  settingsModal: document.getElementById("settingsModal"),
  cfgOwner: document.getElementById("cfgOwner"),
  cfgRepo: document.getElementById("cfgRepo"),
  cfgBranch: document.getElementById("cfgBranch"),
  cfgToken: document.getElementById("cfgToken"),
  cfgAutoSync: document.getElementById("cfgAutoSync"),
  saveSettingsBtn: document.getElementById("saveSettingsBtn"),
  testSyncBtn: document.getElementById("testSyncBtn"),
  toastContainer: document.getElementById("toastContainer"),
};

init();

async function init() {
  bindEvents();
  hydrateSettingsForm();
  await loadInitialData();
  ensureSelection();
  render();
}

function bindEvents() {
  els.addSubjectBtn.addEventListener("click", () => openItemModal("Új tantárgy", "pl. Történelem", (value) => {
    addSubject(value);
  }));

  els.addPageBtn.addEventListener("click", () => {
    const subject = getSelectedSubject();
    if (!subject) {
      toast("Előbb válassz vagy hozz létre egy tantárgyat.", "warning");
      return;
    }
    openItemModal("Új oldal", "pl. 1. tétel", (value) => addPage(subject.id, value));
  });

  els.renameCurrentPageBtn.addEventListener("click", () => {
    const page = getSelectedPage();
    if (!page) {
      toast("Nincs kiválasztott oldal.", "warning");
      return;
    }
    openItemModal("Oldal átnevezése", page.title, (value) => {
      page.title = value;
      page.updatedAt = nowIso();
      markDirty("Oldal átnevezve.");
    }, page.title);
  });

  els.deletePageBtn.addEventListener("click", () => {
    const subject = getSelectedSubject();
    const page = getSelectedPage();
    if (!subject || !page) {
      toast("Nincs kiválasztott oldal.", "warning");
      return;
    }
    openConfirmModal(
      "Oldal törlése",
      `Biztos törölni akarod ezt az oldalt: „${page.title}”?`,
      () => deletePage(subject.id, page.id)
    );
  });

  els.saveNowBtn.addEventListener("click", async () => {
    persistLocal();
    toast("Helyi mentés kész.", "success");
    if (isGithubConfigured()) {
      await syncToGithub({ showToast: true });
    }
  });

  els.settingsBtn.addEventListener("click", () => openModal(els.settingsModal));

  els.pageTitleInput.addEventListener("input", () => {
    const page = getSelectedPage();
    if (!page) return;
    page.title = els.pageTitleInput.value.trimStart();
    page.updatedAt = nowIso();
    scheduleLocalSave();
    renderHeaderBits();
    renderPages();
  });

  els.editor.addEventListener("input", () => {
    saveCurrentEditorToState();
    scheduleLocalSave();
  });

  els.editor.addEventListener("paste", handlePaste);
  els.editor.addEventListener("drop", handleDrop);
  els.editor.addEventListener("dragover", (e) => e.preventDefault());

  els.editor.addEventListener("click", (event) => {
    const figure = event.target.closest("figure.page-figure");
    selectImageFigure(figure || null);
  });

  document.addEventListener("click", (event) => {
    const clickedInModal = event.target.closest(".modal-card");
    const clickedImage = event.target.closest("figure.page-figure");
    const clickedControls = event.target.closest("#imageControls");
    if (!clickedImage && !clickedControls && !clickedInModal) {
      selectImageFigure(null);
    }
  });

  els.editorToolbar.addEventListener("click", (event) => {
    const button = event.target.closest("button");
    if (!button) return;
    const command = button.dataset.cmd;
    const block = button.dataset.block;
    const align = button.dataset.align;

    focusEditor();
    if (command) {
      document.execCommand(command, false, null);
    } else if (block) {
      document.execCommand("formatBlock", false, block);
    } else if (align) {
      document.execCommand(`justify${align[0].toUpperCase()}${align.slice(1)}`);
    }
    saveCurrentEditorToState();
    renderEditorMeta();
  });

  els.insertDividerBtn.addEventListener("click", () => {
    focusEditor();
    insertHtmlAtCursor("<hr>");
    saveCurrentEditorToState();
  });

  els.clearFormattingBtn.addEventListener("click", () => {
    focusEditor();
    document.execCommand("removeFormat", false, null);
    saveCurrentEditorToState();
  });

  els.insertImageBtn.addEventListener("click", () => els.imageInput.click());
  els.imageInput.addEventListener("change", async (event) => {
    const [file] = event.target.files || [];
    if (!file) return;
    await insertImageFile(file);
    event.target.value = "";
  });

  els.imageControls.addEventListener("click", (event) => {
    const button = event.target.closest("button");
    if (!button || !state.selectedImageFigure) return;
    const width = button.dataset.imageWidth;
    const align = button.dataset.imageAlign;
    if (width) {
      state.selectedImageFigure.dataset.width = width;
    }
    if (align) {
      state.selectedImageFigure.dataset.align = align;
    }
    saveCurrentEditorToState();
  });

  els.removeSelectedImageBtn.addEventListener("click", () => {
    if (!state.selectedImageFigure) return;
    state.selectedImageFigure.remove();
    selectImageFigure(null);
    saveCurrentEditorToState();
  });

  els.itemModalSubmit.addEventListener("click", () => {
    const value = els.itemModalInput.value.trim();
    if (!value) {
      toast("Adj meg egy nevet.", "warning");
      return;
    }
    if (typeof state.modalSubmitHandler === "function") {
      state.modalSubmitHandler(value);
    }
    closeModal(els.itemModal);
  });

  els.confirmSubmit.addEventListener("click", () => {
    if (typeof state.confirmHandler === "function") {
      state.confirmHandler();
    }
    closeModal(els.confirmModal);
  });

  document.querySelectorAll("[data-close-modal]").forEach((button) => {
    button.addEventListener("click", () => closeModal(document.getElementById(button.dataset.closeModal)));
  });

  els.modalBackdrop.addEventListener("click", closeAllModals);
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeAllModals();
  });

  els.subjectSearch.addEventListener("input", renderSubjects);

  els.saveSettingsBtn.addEventListener("click", () => {
    state.githubConfig = {
      owner: els.cfgOwner.value.trim(),
      repo: els.cfgRepo.value.trim(),
      branch: els.cfgBranch.value.trim() || "main",
      token: els.cfgToken.value.trim(),
      autoSync: els.cfgAutoSync.checked,
    };
    localStorage.setItem(CONFIG_KEY, JSON.stringify(state.githubConfig));
    closeModal(els.settingsModal);
    updateSyncIndicator();
    toast("GitHub sync beállítások mentve.", "success");
  });

  els.testSyncBtn.addEventListener("click", async () => {
    const tempConfig = {
      owner: els.cfgOwner.value.trim(),
      repo: els.cfgRepo.value.trim(),
      branch: els.cfgBranch.value.trim() || "main",
      token: els.cfgToken.value.trim(),
      autoSync: els.cfgAutoSync.checked,
    };
    if (!isGithubConfigured(tempConfig)) {
      toast("A teszthez tölts ki minden GitHub mezőt.", "warning");
      return;
    }
    try {
      await githubRequest(tempConfig, `/repos/${tempConfig.owner}/${tempConfig.repo}`);
      toast("Kapcsolat rendben, a repository elérhető.", "success");
    } catch (error) {
      toast(`Kapcsolati hiba: ${error.message}`, "error");
    }
  });
}

async function loadInitialData() {
  const localData = loadLocalData();
  let remoteData = null;
  try {
    const response = await fetch(`./data/content.json?ts=${Date.now()}`, { cache: "no-store" });
    if (response.ok) remoteData = await response.json();
  } catch (error) {
    console.warn("A repository adatfájl nem tölthető be.", error);
  }

  state.data = pickNewestData(localData, remoteData) || {
    subjects: [],
    meta: { version: 1, lastSavedAt: nowIso() },
  };
  state.remoteLoaded = true;
}

function pickNewestData(localData, remoteData) {
  const localTs = new Date(localData?.meta?.lastSavedAt || 0).getTime();
  const remoteTs = new Date(remoteData?.meta?.lastSavedAt || 0).getTime();
  if (!localData && !remoteData) return null;
  return localTs >= remoteTs ? (localData || remoteData) : remoteData;
}

function loadLocalData() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (error) {
    console.error("Helyi adat betöltési hiba.", error);
    return null;
  }
}

function persistLocal() {
  state.data.meta.lastSavedAt = nowIso();
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state.data));
  updateSyncIndicator();
}

function scheduleLocalSave(message) {
  window.clearTimeout(state.saveTimer);
  state.saveTimer = window.setTimeout(() => {
    persistLocal();
    if (message) toast(message, "success");
  }, 250);

  if (state.githubConfig.autoSync && isGithubConfigured()) {
    window.clearTimeout(state.syncTimer);
    state.syncTimer = window.setTimeout(() => {
      syncToGithub({ showToast: false });
    }, 1200);
  }
}

function markDirty(message) {
  persistLocal();
  render();
  if (message) toast(message, "success");
  if (state.githubConfig.autoSync && isGithubConfigured()) {
    syncToGithub({ showToast: false });
  }
}

function render() {
  renderSubjects();
  renderPages();
  renderHeaderBits();
  renderEditor();
  updateSyncIndicator();
}

function renderSubjects() {
  const query = els.subjectSearch.value.trim().toLowerCase();
  const subjects = state.data.subjects.filter((subject) => {
    if (!query) return true;
    return subject.name.toLowerCase().includes(query);
  });

  if (!subjects.length) {
    els.subjectsList.innerHTML = `<div class="empty-note">Nincs találat. Hozz létre új tantárgyat.</div>`;
    return;
  }

  els.subjectsList.innerHTML = subjects.map((subject) => {
    const active = subject.id === state.selectedSubjectId ? "active" : "";
    return `
      <article class="subject-card ${active}" data-subject-id="${subject.id}">
        <div class="subject-main">
          <div class="subject-row">
            <div>
              <div class="subject-name">${escapeHtml(subject.name)}</div>
              <div class="subject-count small">${subject.pages.length} oldal</div>
            </div>
          </div>
        </div>
        <div class="subject-actions">
          <button class="ghost-btn" data-action="rename-subject" data-subject-id="${subject.id}">Átnevezés</button>
          <button class="danger-btn" data-action="delete-subject" data-subject-id="${subject.id}">Törlés</button>
        </div>
      </article>
    `;
  }).join("");

  els.subjectsList.querySelectorAll(".subject-main").forEach((element) => {
    element.addEventListener("click", () => {
      const card = element.closest("[data-subject-id]");
      selectSubject(card.dataset.subjectId);
    });
  });

  els.subjectsList.querySelectorAll("[data-action='rename-subject']").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      const subject = getSubjectById(button.dataset.subjectId);
      if (!subject) return;
      openItemModal("Tantárgy átnevezése", subject.name, (value) => {
        subject.name = value;
        subject.updatedAt = nowIso();
        markDirty("Tantárgy átnevezve.");
      }, subject.name);
    });
  });

  els.subjectsList.querySelectorAll("[data-action='delete-subject']").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      const subject = getSubjectById(button.dataset.subjectId);
      if (!subject) return;
      openConfirmModal(
        "Tantárgy törlése",
        `Biztos törölni akarod ezt a tantárgyat: „${subject.name}”? Az összes aloldal is törlődik.`,
        () => deleteSubject(subject.id)
      );
    });
  });
}

function renderPages() {
  const subject = getSelectedSubject();
  if (!subject) {
    els.pagesList.innerHTML = `<div class="empty-note">Nincs kiválasztott tantárgy.</div>`;
    return;
  }

  if (!subject.pages.length) {
    els.pagesList.innerHTML = `<div class="empty-note">Ehhez a tantárgyhoz még nincs oldal. Hozz létre egyet.</div>`;
    return;
  }

  els.pagesList.innerHTML = subject.pages.map((page) => {
    const active = page.id === state.selectedPageId ? "active" : "";
    return `
      <article class="page-chip ${active}">
        <div class="page-chip-main" data-page-id="${page.id}">
          <span class="page-chip-name">${escapeHtml(page.title || "Névtelen oldal")}</span>
          <span class="page-chip-count small">Frissítve: ${formatDate(page.updatedAt)}</span>
        </div>
        <div class="page-chip-actions">
          <button class="ghost-btn" data-action="rename-page" data-page-id="${page.id}">Átnevezés</button>
          <button class="danger-btn" data-action="delete-page" data-page-id="${page.id}">Törlés</button>
        </div>
      </article>
    `;
  }).join("");

  els.pagesList.querySelectorAll(".page-chip-main").forEach((element) => {
    element.addEventListener("click", () => {
      selectPage(element.dataset.pageId);
    });
  });

  els.pagesList.querySelectorAll("[data-action='rename-page']").forEach((button) => {
    button.addEventListener("click", () => {
      const page = getPageById(button.dataset.pageId);
      if (!page) return;
      openItemModal("Oldal átnevezése", page.title, (value) => {
        page.title = value;
        page.updatedAt = nowIso();
        markDirty("Oldal átnevezve.");
      }, page.title);
    });
  });

  els.pagesList.querySelectorAll("[data-action='delete-page']").forEach((button) => {
    button.addEventListener("click", () => {
      const subject = getSelectedSubject();
      const page = getPageById(button.dataset.pageId);
      if (!subject || !page) return;
      openConfirmModal(
        "Oldal törlése",
        `Biztos törölni akarod ezt az oldalt: „${page.title}”?`,
        () => deletePage(subject.id, page.id)
      );
    });
  });
}

function renderHeaderBits() {
  const subject = getSelectedSubject();
  const page = getSelectedPage();
  els.heroTitle.textContent = subject ? subject.name : "Válassz egy tantárgyat";
  els.heroSubtitle.textContent = subject
    ? `${subject.pages.length} oldal • gyorsan szerkeszthető, helyben mentődik, és opcionálisan GitHubra is szinkronizálható.`
    : "Készíts oldalakat, írj jegyzeteket, szúrj be képeket, és mentsd el mindent.";

  els.pageTitleInput.value = page?.title || "";
  renderEditorMeta();
}

function renderEditorMeta() {
  const page = getSelectedPage();
  if (!page) {
    els.pageMeta.textContent = "Még nincs kiválasztott oldal.";
    return;
  }
  els.pageMeta.textContent = `Létrehozva: ${formatDate(page.createdAt)} • Utolsó módosítás: ${formatDate(page.updatedAt)}`;
}

function renderEditor() {
  const page = getSelectedPage();
  const hasPage = Boolean(page);
  els.editor.classList.toggle("hidden", !hasPage);
  els.editorPlaceholder.classList.toggle("hidden", hasPage);
  els.deletePageBtn.disabled = !hasPage;
  els.renameCurrentPageBtn.disabled = !hasPage;
  els.pageTitleInput.disabled = !hasPage;

  if (!hasPage) {
    els.editor.innerHTML = "";
    selectImageFigure(null);
    return;
  }

  if (els.editor.innerHTML !== page.content) {
    els.editor.innerHTML = page.content || "";
  }
  selectImageFigure(null);
}

function addSubject(name) {
  const subject = {
    id: uid("subj"),
    name,
    pages: [],
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };
  state.data.subjects.push(subject);
  state.selectedSubjectId = subject.id;
  state.selectedPageId = null;
  markDirty("Tantárgy létrehozva.");
}

function deleteSubject(subjectId) {
  state.data.subjects = state.data.subjects.filter((subject) => subject.id !== subjectId);
  if (state.selectedSubjectId === subjectId) {
    state.selectedSubjectId = state.data.subjects[0]?.id || null;
    state.selectedPageId = getSelectedSubject()?.pages[0]?.id || null;
  }
  markDirty("Tantárgy törölve.");
}

function addPage(subjectId, title) {
  const subject = getSubjectById(subjectId);
  if (!subject) return;
  const page = {
    id: uid("page"),
    title,
    content: "<p></p>",
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };
  subject.pages.push(page);
  subject.updatedAt = nowIso();
  state.selectedSubjectId = subject.id;
  state.selectedPageId = page.id;
  markDirty("Oldal létrehozva.");
  focusEditorSoon();
}

function deletePage(subjectId, pageId) {
  const subject = getSubjectById(subjectId);
  if (!subject) return;
  subject.pages = subject.pages.filter((page) => page.id !== pageId);
  subject.updatedAt = nowIso();
  if (state.selectedPageId === pageId) {
    state.selectedPageId = subject.pages[0]?.id || null;
  }
  markDirty("Oldal törölve.");
}

function selectSubject(subjectId) {
  saveCurrentEditorToState();
  state.selectedSubjectId = subjectId;
  const subject = getSubjectById(subjectId);
  state.selectedPageId = subject?.pages[0]?.id || null;
  render();
}

function selectPage(pageId) {
  saveCurrentEditorToState();
  state.selectedPageId = pageId;
  render();
  focusEditorSoon();
}

function ensureSelection() {
  if (!state.selectedSubjectId) {
    state.selectedSubjectId = state.data.subjects[0]?.id || null;
  }
  const subject = getSelectedSubject();
  if (subject && !subject.pages.some((page) => page.id === state.selectedPageId)) {
    state.selectedPageId = subject.pages[0]?.id || null;
  }
}

function saveCurrentEditorToState() {
  const page = getSelectedPage();
  if (!page) return;
  page.content = sanitizeEditorHtml(els.editor.innerHTML);
  page.updatedAt = nowIso();
  renderEditorMeta();
}

function sanitizeEditorHtml(html) {
  return html
    .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, "")
    .replace(/ on\w+="[^"]*"/g, "")
    .replace(/ on\w+='[^']*'/g, "");
}

function handlePaste(event) {
  const items = Array.from(event.clipboardData?.items || []);
  const imageItem = items.find((item) => item.type.startsWith("image/"));
  if (!imageItem) return;
  event.preventDefault();
  const file = imageItem.getAsFile();
  if (file) insertImageFile(file);
}

function handleDrop(event) {
  event.preventDefault();
  const file = Array.from(event.dataTransfer?.files || []).find((item) => item.type.startsWith("image/"));
  if (file) insertImageFile(file);
}

async function insertImageFile(file) {
  const dataUrl = await readFileAsDataUrl(file);
  focusEditor();
  const figureHtml = `
    <figure class="page-figure" data-width="75" data-align="center">
      <img src="${dataUrl}" alt="Beillesztett kép" />
    </figure>
    <p></p>
  `;
  insertHtmlAtCursor(figureHtml);
  saveCurrentEditorToState();
  toast("Kép beszúrva.", "success");
}

function insertHtmlAtCursor(html) {
  const selection = window.getSelection();
  if (!selection || !selection.rangeCount) {
    els.editor.insertAdjacentHTML("beforeend", html);
    return;
  }
  const range = selection.getRangeAt(0);
  range.deleteContents();
  const temp = document.createElement("div");
  temp.innerHTML = html;
  const fragment = document.createDocumentFragment();
  let node;
  let lastNode;
  while ((node = temp.firstChild)) {
    lastNode = fragment.appendChild(node);
  }
  range.insertNode(fragment);
  if (lastNode) {
    range.setStartAfter(lastNode);
    range.setEndAfter(lastNode);
    selection.removeAllRanges();
    selection.addRange(range);
  }
}

function selectImageFigure(figure) {
  if (state.selectedImageFigure) {
    state.selectedImageFigure.classList.remove("selected");
  }
  state.selectedImageFigure = figure;
  if (figure) {
    figure.classList.add("selected");
    els.imageControls.classList.remove("hidden");
  } else {
    els.imageControls.classList.add("hidden");
  }
}

function openItemModal(title, placeholder, onSubmit, initialValue = "") {
  state.modalSubmitHandler = onSubmit;
  els.itemModalTitle.textContent = title;
  els.itemModalInput.placeholder = placeholder;
  els.itemModalInput.value = initialValue;
  openModal(els.itemModal);
  window.setTimeout(() => els.itemModalInput.focus(), 20);
}

function openConfirmModal(title, message, onConfirm) {
  state.confirmHandler = onConfirm;
  els.confirmTitle.textContent = title;
  els.confirmMessage.textContent = message;
  openModal(els.confirmModal);
}

function openModal(modal) {
  els.modalBackdrop.classList.remove("hidden");
  modal.classList.remove("hidden");
  modal.setAttribute("aria-hidden", "false");
}

function closeModal(modal) {
  modal.classList.add("hidden");
  modal.setAttribute("aria-hidden", "true");
  if (document.querySelectorAll(".modal:not(.hidden)").length === 0) {
    els.modalBackdrop.classList.add("hidden");
  }
}

function closeAllModals() {
  document.querySelectorAll(".modal").forEach((modal) => {
    modal.classList.add("hidden");
    modal.setAttribute("aria-hidden", "true");
  });
  els.modalBackdrop.classList.add("hidden");
}

function hydrateSettingsForm() {
  els.cfgOwner.value = state.githubConfig.owner || "";
  els.cfgRepo.value = state.githubConfig.repo || "";
  els.cfgBranch.value = state.githubConfig.branch || "main";
  els.cfgToken.value = state.githubConfig.token || "";
  els.cfgAutoSync.checked = Boolean(state.githubConfig.autoSync);
}

async function syncToGithub({ showToast = true } = {}) {
  if (!isGithubConfigured()) {
    if (showToast) toast("A GitHub sync nincs teljesen beállítva.", "warning");
    return;
  }

  try {
    setSyncState("warning", "GitHub mentés folyamatban...");
    const contentPath = "data/content.json";
    const backupPath = `backup/${timestampForFilename()}.json`;
    const serialized = JSON.stringify(state.data, null, 2);

    await upsertRepoFile(contentPath, serialized, `Frissítés: ${contentPath}`);
    await createBackupFile(backupPath, serialized);

    setSyncState("success", "GitHub sync aktív");
    if (showToast) toast("GitHub mentés és backup kész.", "success");
  } catch (error) {
    console.error(error);
    setSyncState("error", "GitHub sync hiba");
    if (showToast) toast(`GitHub mentési hiba: ${error.message}`, "error");
  }
}

async function createBackupFile(path, content) {
  const existing = await getFileShaIfExists(path);
  if (existing) {
    return upsertRepoFile(path, content, `Backup frissítés: ${path}`);
  }
  return upsertRepoFile(path, content, `Backup létrehozás: ${path}`);
}

async function upsertRepoFile(path, content, message) {
  const sha = await getFileShaIfExists(path);
  const payload = {
    message,
    content: btoa(unescape(encodeURIComponent(content))),
    branch: state.githubConfig.branch,
  };
  if (sha) payload.sha = sha;

  await githubRequest(state.githubConfig, `/repos/${state.githubConfig.owner}/${state.githubConfig.repo}/contents/${path}`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}

async function getFileShaIfExists(path) {
  try {
    const response = await githubRequest(state.githubConfig, `/repos/${state.githubConfig.owner}/${state.githubConfig.repo}/contents/${path}?ref=${encodeURIComponent(state.githubConfig.branch)}`);
    return response.sha || null;
  } catch (error) {
    if (String(error.message).includes("404")) return null;
    throw error;
  }
}

async function githubRequest(config, path, options = {}) {
  const response = await fetch(`https://api.github.com${path}`, {
    ...options,
    headers: {
      "Accept": "application/vnd.github+json",
      "Authorization": `Bearer ${config.token}`,
      "X-GitHub-Api-Version": "2022-11-28",
      ...(options.headers || {}),
    },
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`${response.status} ${response.statusText} – ${text}`);
  }

  if (response.status === 204) return null;
  return response.json();
}

function updateSyncIndicator() {
  if (isGithubConfigured()) {
    setSyncState("success", "GitHub sync beállítva");
  } else {
    setSyncState("success", "Helyi mentés aktív");
  }
}

function setSyncState(type, message) {
  els.syncDot.className = "sync-dot";
  if (type === "warning") els.syncDot.classList.add("warning");
  if (type === "error") els.syncDot.classList.add("error");
  els.syncStatus.textContent = message;
}

function getSelectedSubject() {
  return state.data.subjects.find((subject) => subject.id === state.selectedSubjectId) || null;
}

function getSelectedPage() {
  const subject = getSelectedSubject();
  return subject?.pages.find((page) => page.id === state.selectedPageId) || null;
}

function getSubjectById(id) {
  return state.data.subjects.find((subject) => subject.id === id) || null;
}

function getPageById(id) {
  for (const subject of state.data.subjects) {
    const page = subject.pages.find((item) => item.id === id);
    if (page) return page;
  }
  return null;
}

function loadGithubConfig() {
  try {
    return JSON.parse(localStorage.getItem(CONFIG_KEY)) || { branch: "main", autoSync: false };
  } catch {
    return { branch: "main", autoSync: false };
  }
}

function isGithubConfigured(config = state.githubConfig) {
  return Boolean(config?.owner && config?.repo && config?.branch && config?.token);
}

function toast(message, type = "success") {
  const item = document.createElement("div");
  item.className = `toast ${type}`;
  item.textContent = message;
  els.toastContainer.appendChild(item);
  window.setTimeout(() => {
    item.style.opacity = "0";
    item.style.transform = "translateY(8px)";
  }, 2600);
  window.setTimeout(() => item.remove(), 3200);
}

function uid(prefix) {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}-${Date.now().toString(36)}`;
}

function nowIso() {
  return new Date().toISOString();
}

function timestampForFilename() {
  const date = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}_${pad(date.getHours())}-${pad(date.getMinutes())}-${pad(date.getSeconds())}`;
}

function formatDate(value) {
  if (!value) return "–";
  return new Intl.DateTimeFormat("hu-HU", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function focusEditor() {
  els.editor.focus();
}

function focusEditorSoon() {
  window.setTimeout(() => els.editor.focus(), 40);
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
