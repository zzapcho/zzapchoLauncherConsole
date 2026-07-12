import { useEffect } from "react";
import { ConsoleAppFresh } from "./ConsoleAppFresh";
import { registerFreshAssetVersionEnhancer } from "./freshAssetVersionEnhancer";
import { registerFreshMobileDock } from "./freshMobileDock";
import "./curseForgeVersionCache";
import "./freshConsole.css";
import "./freshConsoleFix.css";
import "./freshMobile.css";
import "./freshToggleFix.css";
import "./freshAssetVersion.css";
import "./freshMobileFinal.css";
import "./freshMobileDock.css";

export function App() {
  useEffect(() => {
    registerFreshAssetVersionEnhancer();
    registerFreshMobileDock();
  }, []);

  return <ConsoleAppFresh />;
}
