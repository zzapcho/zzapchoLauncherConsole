import React from "react";
import { createRoot } from "react-dom/client";
import { BoardApp } from "./BoardApp";
import "./styles.css";
import "./polish.css";
import "./board.css";

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BoardApp />
  </React.StrictMode>,
);
