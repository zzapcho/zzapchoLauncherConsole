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

registerPwa();

const root = document.getElementById("root");
if (!root) throw new Error("root element not found");
createRoot(root).render(<React.StrictMode><App /></React.StrictMode>);
