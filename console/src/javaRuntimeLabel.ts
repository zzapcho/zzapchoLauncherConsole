function applyJavaRuntimeLabels() {
  document.querySelectorAll<HTMLLabelElement>(".ui-field").forEach((field) => {
    const label = field.querySelector("span");
    const input = field.querySelector<HTMLInputElement>("input[readonly]");
    if (!label || !input) return;

    const raw = input.value.trim();
    const match = raw.match(/^(?:자동:\s*)?Java\s+(\d+)/i);
    if (!match) return;

    label.textContent = "Java 런타임";
    input.value = `자동: Java ${match[1]}`;
  });
}

export function registerJavaRuntimeLabelFix() {
  applyJavaRuntimeLabels();

  const observer = new MutationObserver(() => applyJavaRuntimeLabels());
  observer.observe(document.body, { childList: true, subtree: true });

  window.setInterval(applyJavaRuntimeLabels, 500);
}
