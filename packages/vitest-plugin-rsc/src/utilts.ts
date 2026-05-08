import { ESModulesEvaluator, ModuleRunner } from "vite/module-runner";
import websocketConfig from "virtual:vitest-plugin-rsc/react-client-websocket-config";
import { createReactClientWebSocketInvokeTransport } from "./react-client-websocket";

const runner = new ModuleRunner(
  {
    sourcemapInterceptor: false,
    transport: createReactClientWebSocketInvokeTransport(websocketConfig),
    hmr: false,
  },
  new ESModulesEvaluator(),
);

export const importReactClient = runner.import.bind(runner);
