import { useEffect } from "react";
import { ConsoleAppFresh } from "./ConsoleAppFresh";
import { registerFreshAssetVersionEnhancer } from "./freshAssetVersionEnhancer";
import "./freshConsole.css";
import "./freshConsoleFix.css";
import "./freshMobile.css";
import "./freshToggleFix.css";
import "./freshAssetVersion.css";

export function App() {
  useEffect(() => {
    registerFreshAssetVersionEnhancer();
  }, []);

  return <ConsoleAppFresh />;
}
