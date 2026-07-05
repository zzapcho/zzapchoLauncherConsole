import React from "react";
import { createRoot } from "react-dom/client";
import { MinimalApp } from "./MinimalApp";
import "./styles.css";
import "./polish.css";

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <MinimalApp />
  </React.StrictMode>,
);
