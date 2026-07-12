import { useEffect } from "react";
import { ConsoleAppFresh } from "./ConsoleAppFresh";
import { registerFreshMobileDockSafe } from "./freshMobileDockSafe";
import "./curseForgeVersionCache";
import "./freshConsole.css";
import "./freshConsoleFix.css";
import "./freshMobile.css";
import "./freshToggleFix.css";
import "./freshAssetVersion.css";
import "./freshMobileFinal.css";
import "./freshMobileDock.css";
import "./freshMobileDockSafe.css";
import "./freshUiFixes.css";

export function App() {
  useEffect(() => {
    registerFreshMobileDockSafe();
  }, []);

  return <ConsoleAppFresh />;
}
