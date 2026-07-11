function getCurrentMinecraftVersion() {
  const fields = Array.from(document.querySelectorAll<HTMLLabelElement>("#fresh-console .fc-field"));
  const field = fields.find((item) => item.querySelector("span")?.textContent?.trim() === "마크 버전");
  return field?.querySelector<HTMLSelectElement>("select")?.value ?? "";
}

function applyWarnings() {
  const current = getCurrentMinecraftVersion();
  if (!current) return;

  for (const meta of Array.from(document.querySelectorAll<HTMLElement>("#fresh-console .fc-asset-row main small"))) {
    const text = meta.textContent ?? "";
    if (!text.includes("지원 ")) continue;
    if (text.includes("현재 ")) continue;

    const supportText = text.split("지원 ")[1] ?? "";
    const supported = supportText.split(" · ")[0] ?? supportText;
    if (!supported.includes(current)) meta.textContent = `${text} · ⚠ 현재 ${current}와 다름`;
  }
}

export function registerCompatibilityWarnings() {
  applyWarnings();
  const observer = new MutationObserver(applyWarnings);
  observer.observe(document.body, { childList: true, subtree: true, characterData: true });
  window.setInterval(applyWarnings, 700);
}
