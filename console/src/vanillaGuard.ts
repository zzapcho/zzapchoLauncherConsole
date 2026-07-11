function readLoaderValue() {
  const labels = Array.from(document.querySelectorAll<HTMLLabelElement>("#fresh-console .fc-field"));
  const loaderField = labels.find((label) => label.querySelector("span")?.textContent?.trim() === "로더");
  const select = loaderField?.querySelector<HTMLSelectElement>("select");
  return select?.value ?? "";
}

function setBlocked(button: HTMLButtonElement, blocked: boolean) {
  button.disabled = blocked;
  button.classList.toggle("fc-vanilla-blocked-tab", blocked);
  if (blocked) button.title = "바닐라 로더에서는 사용할 수 없습니다.";
  else button.removeAttribute("title");
}

function applyVanillaGuard() {
  const root = document.getElementById("fresh-console");
  if (!root) return;
  const isVanilla = readLoaderValue() === "vanilla";
  root.classList.toggle("fc-loader-vanilla", isVanilla);

  for (const button of Array.from(root.querySelectorAll<HTMLButtonElement>(".fc-tabs button"))) {
    const label = (button.textContent ?? "").replace(/\d+/g, "").trim();
    setBlocked(button, isVanilla && (label.startsWith("모드") || label.startsWith("쉐이더")));
  }
}

export function registerVanillaGuard() {
  applyVanillaGuard();
  window.addEventListener("resize", applyVanillaGuard, { passive: true });
  window.setInterval(applyVanillaGuard, 500);
}
