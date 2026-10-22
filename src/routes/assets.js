import { registerSource } from "../browser/register.js";
import { configuratorSource } from "../browser/configurator.js";
import { javascript } from "../lib/http.js";

export function makeAssetHandlers() {
  return {
    register: () => javascript(registerSource),
    configurator: () => javascript(configuratorSource),
  };
}
