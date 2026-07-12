type DockPanel = "settings" | "mods" | "resourcePacks" | "shaders";

const items: Array<{ id: DockPanel; label: string; tabLabel?: string }> = [
  { id: "settings", label: "기본설정" },
  { id: "mods", label: "모드", tabLabel: "모드" },
  { id: "resourcePacks", label: "리팩", tabLabel: "리팩" },
  { id: "shaders", label: "쉐이더", tabLabel: "쉐이더" },
];

let active: DockPanel = "settings";
let lastProfile = "";
let frame = 0;
let registered = false;

const isMobile = () => window.matchMedia("(max-width: 860px)").matches;
const appRoot = () => document.getElementById("fresh-console");
const editor = () => document.querySelector<HTMLElement>("#fresh-console .fc-editor");
const clean = (value: string) => value.replace(/\d+/g, "").trim();
const isVanilla = () => Boolean(appRoot()?.classList.contains("fc-profile-vanilla"));
const visibleItems = () => isVanilla() ? items.filter((item) => item.id !== "mods" && item.id !== "shaders") : items;

function profileName(target: HTMLElement) {
  return target.querySelector<HTMLElement>(".fc-editor-title h2")?.textContent?.trim() ?? "";
}

function normalizeActive() {
  if (isVanilla() && (active === "mods" || active === "shaders")) active = "resourcePacks";
}

function selectTab(target: HTMLElement, panel: DockPanel) {
  const tab = items.find((item) => item.id === panel)?.tabLabel;
  if (!tab) return;
  const button = Array.from(target.querySelectorAll<HTMLButtonElement>(".fc-tabs button")).find((node) => clean(node.textContent ?? "") === tab);
  if (button && !button.classList.contains("active")) button.click();
}

function count(target: HTMLElement, panel: DockPanel) {
  const tab = items.find((item) => item.id === panel)?.tabLabel;
  if (!tab || panel === "settings") return "";
  const button = Array.from(target.querySelectorAll<HTMLElement>(".fc-tabs button")).find((node) => clean(node.textContent ?? "") === tab);
  return button?.querySelector("b")?.textContent?.trim() ?? "0";
}

function showPanel(target: HTMLElement) {
  const side = target.querySelector<HTMLElement>(".fc-side");
  const main = target.querySelector<HTMLElement>(".fc-main-panel");
  if (!side || !main) return;

  if (!isMobile()) {
    side.style.removeProperty("display");
    side.style.removeProperty("visibility");
    main.style.removeProperty("display");
    main.style.removeProperty("visibility");
    document.querySelector("body > .fc-mobile-dock")?.remove();
    return;
  }

  const name = profileName(target);
  if (name && name !== lastProfile) {
    lastProfile = name;
    active = "settings";
  }

  normalizeActive();
  if (active === "settings") {
    side.style.setProperty("display", "block", "important");
    side.style.setProperty("visibility", "visible", "important");
    main.style.setProperty("display", "none", "important");
  } else {
    selectTab(target, active);
    side.style.setProperty("display", "none", "important");
    main.style.setProperty("display", "block", "important");
    main.style.setProperty("visibility", "visible", "important");
  }
}

function renderDock(target: HTMLElement) {
  let dock = document.querySelector<HTMLElement>("body > .fc-mobile-dock");
  if (!isMobile()) {
    dock?.remove();
    return;
  }
  if (!dock) {
    dock = document.createElement("nav");
    dock.className = "fc-mobile-dock";
    dock.setAttribute("aria-label", "모바일 에디터 메뉴");
    dock.innerHTML = `<div class="fc-mobile-dock-tabs"></div>`;
    document.body.appendChild(dock);
  }
  const tabs = dock.querySelector<HTMLElement>(".fc-mobile-dock-tabs");
  if (!tabs) return;
  tabs.replaceChildren();
  for (const item of visibleItems()) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = item.id === active ? "active" : "";
    button.dataset.panel = item.id;
    button.innerHTML = `<span>${item.label}</span>${item.id === "settings" ? "" : `<b>${count(target, item.id)}</b>`}`;
    button.addEventListener("click", () => {
      active = item.id;
      selectTab(target, active);
      requestSync();
      window.scrollTo({ top: 0, behavior: "smooth" });
    });
    tabs.appendChild(button);
  }
}

function sync() {
  frame = 0;
  const target = editor();
  if (!target) {
    lastProfile = "";
    active = "settings";
    document.querySelector("body > .fc-mobile-dock")?.remove();
    return;
  }
  showPanel(target);
  renderDock(target);
}

function requestSync() {
  if (frame) return;
  frame = window.requestAnimationFrame(sync);
}

export function registerFreshMobileDockSafe() {
  if (registered || typeof window === "undefined") return;
  registered = true;
  const observer = new MutationObserver(requestSync);
  observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["class", "disabled"] });
  document.addEventListener("click", () => window.setTimeout(requestSync, 0), true);
  window.addEventListener("resize", requestSync, { passive: true });
  window.addEventListener("orientationchange", requestSync, { passive: true });
  requestSync();
}
