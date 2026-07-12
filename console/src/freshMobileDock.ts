type DockPanel = "settings" | "mods" | "resourcePacks" | "shaders";

const dockItems: Array<{ id: DockPanel; label: string; tabLabel?: string }> = [
  { id: "settings", label: "기본설정" },
  { id: "mods", label: "모드", tabLabel: "모드" },
  { id: "resourcePacks", label: "리팩", tabLabel: "리팩" },
  { id: "shaders", label: "쉐이더", tabLabel: "쉐이더" },
];

let activePanel: DockPanel = "settings";
let lastEditorKey = "";
let raf = 0;
let registered = false;

function mobile() {
  return window.matchMedia("(max-width: 860px)").matches;
}

function root() {
  return document.getElementById("fresh-console");
}

function editorRoot() {
  return document.querySelector<HTMLElement>("#fresh-console .fc-editor");
}

function editorKey(editor: HTMLElement) {
  return editor.querySelector<HTMLElement>(".fc-editor-title h2")?.textContent?.trim() ?? "editor";
}

function vanillaMode() {
  return Boolean(root()?.classList.contains("fc-profile-vanilla"));
}

function visibleDockItems() {
  if (!vanillaMode()) return dockItems;
  return dockItems.filter((item) => item.id !== "mods" && item.id !== "shaders");
}

function normalizeActivePanel() {
  if (vanillaMode() && (activePanel === "mods" || activePanel === "shaders")) activePanel = "resourcePacks";
}

function cleanLabel(value: string) {
  return value.replace(/\d+/g, "").trim();
}

function selectRealTab(editor: HTMLElement, panel: DockPanel) {
  const item = dockItems.find((candidate) => candidate.id === panel);
  if (!item?.tabLabel) return;
  const buttons = Array.from(editor.querySelectorAll<HTMLButtonElement>(".fc-tabs button"));
  const target = buttons.find((button) => cleanLabel(button.textContent ?? "") === item.tabLabel);
  if (target && !target.classList.contains("active")) target.click();
}

function countFor(editor: HTMLElement, panel: DockPanel) {
  if (panel === "settings") return "";
  const item = dockItems.find((candidate) => candidate.id === panel);
  const button = Array.from(editor.querySelectorAll<HTMLElement>(".fc-tabs button")).find((node) => cleanLabel(node.textContent ?? "") === item?.tabLabel);
  return button?.querySelector("b")?.textContent?.trim() ?? "0";
}

function resetInlineVisibility(side: HTMLElement, main: HTMLElement) {
  side.style.removeProperty("display");
  main.style.removeProperty("display");
}

function setPanelVisibility(editor: HTMLElement) {
  const side = editor.querySelector<HTMLElement>(".fc-side");
  const main = editor.querySelector<HTMLElement>(".fc-main-panel");
  if (!side || !main) return;

  if (!mobile()) {
    resetInlineVisibility(side, main);
    document.querySelector(".fc-mobile-dock")?.remove();
    return;
  }

  const key = editorKey(editor);
  if (key !== lastEditorKey) {
    lastEditorKey = key;
    activePanel = "settings";
    window.scrollTo({ top: 0, behavior: "auto" });
  }

  normalizeActivePanel();
  if (activePanel === "settings") {
    side.style.setProperty("display", "block", "important");
    side.style.setProperty("visibility", "visible", "important");
    main.style.setProperty("display", "none", "important");
  } else {
    selectRealTab(editor, activePanel);
    side.style.setProperty("display", "none", "important");
    main.style.setProperty("display", "block", "important");
    main.style.setProperty("visibility", "visible", "important");
  }
}

function ensureDock(editor: HTMLElement) {
  let dock = document.querySelector<HTMLElement>('#fresh-console .fc-mobile-dock');
  if (!mobile()) {
    dock?.remove();
    return;
  }

  normalizeActivePanel();
  if (!dock) {
    dock = document.createElement("nav");
    dock.className = "fc-mobile-dock";
    dock.setAttribute("aria-label", "모바일 에디터 메뉴");
    dock.innerHTML = `<div class="fc-mobile-dock-tabs"></div>`;
    root()?.append(dock);
  }

  const tabs = dock.querySelector<HTMLElement>(".fc-mobile-dock-tabs")!;
  tabs.innerHTML = "";
  for (const item of visibleDockItems()) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = item.id === activePanel ? "active" : "";
    button.dataset.panel = item.id;
    button.innerHTML = `<span>${item.label}</span>${item.id === "settings" ? "" : `<b>${countFor(editor, item.id)}</b>`}`;
    button.addEventListener("click", () => {
      activePanel = item.id;
      selectRealTab(editor, activePanel);
      schedule();
    });
    tabs.append(button);
  }
}

function sync() {
  raf = 0;
  const editor = editorRoot();
  if (!editor) {
    lastEditorKey = "";
    activePanel = "settings";
    document.querySelector(".fc-mobile-dock")?.remove();
    return;
  }
  setPanelVisibility(editor);
  ensureDock(editor);
}

function schedule() {
  if (raf) return;
  raf = window.requestAnimationFrame(sync);
}

export function registerFreshMobileDock() {
  if (registered || typeof window === "undefined") return;
  registered = true;
  const observer = new MutationObserver(schedule);
  observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["class", "disabled", "style"] });
  document.addEventListener("click", () => window.setTimeout(schedule, 0), true);
  window.addEventListener("resize", schedule, { passive: true });
  window.addEventListener("orientationchange", schedule, { passive: true });
  schedule();
}
