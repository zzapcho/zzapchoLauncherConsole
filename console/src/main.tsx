import React from "react";
import { createRoot } from "react-dom/client";
import { LauncherStyleConsole } from "./LauncherStyleConsole";
import "./styles.css";
import "./polish.css";
import "./launcherStyleConsole.css";

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <LauncherStyleConsole />
  </React.StrictMode>,
);
