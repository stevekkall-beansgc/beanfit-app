import { registerBrowser } from "../browser/register.js";
import { configureDevice } from "../browser/configurator.js";
import { javascript } from "../lib/http.js";

const registerSource = `(${registerBrowser.toString()})();\n`;
const configuratorSource = `(${configureDevice.toString()})();\n`;

export function makeAssetHandlers() {
  return {
    register: () => javascript(registerSource),
    configurator: () => javascript(configuratorSource),
  };
}
