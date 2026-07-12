type AssetLabel = "모드" | "리팩" | "쉐이더";

let registered = false;
let timer = 0;

function root() {
  return document.getElementById("fresh-console");
}

function mobile() {
  return window.matchMedia("(max-width: 860px)").matches;
}

function cleanLabel(value: string) {
  return value.replace(/\d+/g, "").trim();
}

function activeEditor() {
  return document.querySelector<HTMLElement>("#fresh-console .fc-editor");
}

function currentLoader() {
  const labels = Array.from(document.querySelectorAll<HTMLElement>("#fresh-console .fc-field > span"));
  const loaderLabel = labels.find((label) => label.textContent?.trim() === "로더");
  const select = loaderLabel?.parentElement?.querySelector<HTMLSelectElement>("select");
  return select?.value ?? "";
}

function assetTabButtons() {
  return Array.from(document.querySelectorAll<HTMLButtonElement>("#fresh-console .fc-tabs button"));
}

function tabLabel(button: HTMLElement) {
  return cleanLabel(button.textContent ?? "") as AssetLabel;
}

function clickResourcePackTab() {
  const target = assetTabButtons().find((button) => tabLabel(button) === "리팩");
  if (target && !target.classList.contains("active")) target.click();
}

function applyVanillaMode() {
  const shell = root();
  const isVanilla = currentLoader() === "vanilla";
  shell?.classList.toggle("fc-profile-vanilla", isVanilla);

  for (const button of assetTabButtons()) {
    const label = tabLabel(button);
    const blocked = isVanilla && (label === "모드" || label === "쉐이더");
    button.style.setProperty("display", blocked ? "none" : "", blocked ? "important" : "");
    button.disabled = blocked;
    if (blocked && button.classList.contains("active")) clickResourcePackTab();
  }
}

function quietStatus() {
  const state = document.querySelector<HTMLElement>("#fresh-console .fc-save-state");
  if (state && ["저장됨", "불러옴", "불러오는 중..."].includes(state.textContent?.trim() ?? "")) {
    state.textContent = "";
    state.classList.add("quiet");
  } else if (state && state.textContent?.trim()) {
    state.classList.remove("quiet");
  }

  for (const toast of Array.from(document.querySelectorAll<HTMLElement>("#fresh-console .fc-toast"))) {
    const text = toast.textContent?.trim() ?? "";
    if (["저장됨", "불러옴", "불러오는 중..."].includes(text)) toast.remove();
  }
}

function ensureScrollTopButton() {
  const shell = root();
  const editor = activeEditor();
  let button = document.querySelector<HTMLButtonElement>("#fresh-console .fc-scroll-top-button");
  if (!shell || !editor || !mobile()) {
    button?.remove();
    return;
  }

  const showingAssetPanel = getComputedStyle(editor.querySelector<HTMLElement>(".fc-main-panel") ?? editor).display !== "none";
  if (!showingAssetPanel || shell.classList.contains("fc-profile-vanilla") && !document.querySelector("#fresh-console .fc-main-panel")) {
    button?.remove();
    return;
  }

  if (!button) {
    button = document.createElement("button");
    button.type = "button";
    button.className = "fc-scroll-top-button";
    button.textContent = "↑";
    button.title = "맨 위로";
    button.addEventListener("click", () => {
      const target = document.querySelector<HTMLElement>("#fresh-console .fc-main-panel") ?? editor;
      const top = Math.max(0, target.getBoundingClientRect().top + window.scrollY - 78);
      window.scrollTo({ top, behavior: "smooth" });
    });
    shell.append(button);
  }
}

function apply() {
  window.clearTimeout(timer);
  timer = window.setTimeout(() => {
    applyVanillaMode();
    quietStatus();
    ensureScrollTopButton();
  }, 40);
}

export function registerFreshUiBehaviorFixes() {
  if (registered || typeof window === "undefined") return;
  registered = true;
  const observer = new MutationObserver(apply);
  observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["class", "style", "value"] });
  document.addEventListener("change", apply, true);
  document.addEventListener("input", apply, true);
  window.addEventListener("resize", apply, { passive: true });
  window.addEventListener("orientationchange", apply, { passive: true });
  apply();
}
