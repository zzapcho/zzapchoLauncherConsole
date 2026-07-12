import { useEffect } from "react";
import { ConsoleAppFresh } from "./ConsoleAppFresh";
import { registerFreshAssetVersionEnhancer } from "./freshAssetVersionEnhancer";
import { registerFreshMobileDock } from "./freshMobileDock";
import { registerFreshUiBehaviorFixes } from "./freshUiBehaviorFixes";
import "./curseForgeVersionCache";
import "./freshConsole.css";
import "./freshConsoleFix.css";
import "./freshMobile.css";
import "./freshToggleFix.css";
import "./freshAssetVersion.css";
import "./freshMobileFinal.css";
import "./freshMobileDock.css";
import "./freshUiFixes.css";

export function App() {
  useEffect(() => {
    registerFreshAssetVersionEnhancer();
    registerFreshUiBehaviorFixes();
    registerFreshMobileDock();
  }, []);

  return <ConsoleAppFresh />;
}
