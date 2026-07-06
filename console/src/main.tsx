import React from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { registerPwa } from "./pwa";
import "./index.css";
import "./launcherContent.css";
import "./homeFlow.css";
import "./modal.css";
import "./editorRefine.css";
import "./assetLayoutFix.css";
import "./mobile.css";
import "./mobileEditorTabs.css";
import "./profileOrder.css";
import "./mobileComfort.css";
import "./mobilePolish.css";
import "./mobileFixes.css";
import "./mobileReset.css";
import "./consoleMinimal.css";

registerPwa();

const appRoot = document.getElementById("root");
if (!appRoot) throw new Error("app root element not found");
createRoot(appRoot).render(<React.StrictMode><App /></React.StrictMode>);
