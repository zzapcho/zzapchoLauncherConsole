function readLoaderValue() {
  const labels = Array.from(document.querySelectorAll<HTMLLabelElement>("#fresh-console .fc-field"));
  const loaderField = labels.find((label) => label.querySelector("span")?.textContent?.trim() === "로더");
  const select = loaderField?.querySelector<HTMLSelectElement>("select");
  return select?.value ?? "";
}

function cleanLabel(button: HTMLButtonElement) {
  return (button.textContent ?? "").replace(/\d+/g, "").trim();
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

  const buttons = Array.from(root.querySelectorAll<HTMLButtonElement>(".fc-tabs button"));
  for (const button of buttons) {
    const label = cleanLabel(button);
    setBlocked(button, isVanilla && (label.startsWith("모드") || label.startsWith("쉐이더")));
  }

  if (isVanilla && buttons.some((button) => button.classList.contains("active") && button.disabled)) {
    buttons.find((button) => cleanLabel(button).startsWith("리팩"))?.click();
  }
}

export function registerVanillaGuard() {
  applyVanillaGuard();
  window.addEventListener("resize", applyVanillaGuard, { passive: true });
  window.setInterval(applyVanillaGuard, 500);
}
