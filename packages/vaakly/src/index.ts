/**
 * @vaagatech/vaakly — clear API summaries for Anvesh (plugin + library).
 * VaagaTech · https://www.vaagatech.com
 */
export { correctSummary, type CorrectSummaryInput } from "./correct.js";
export {
  formatMessage,
  apiEnvelope,
  AnveshError,
  type FormattedMessage,
  type MessageVars,
  type MessageCode,
} from "./format.js";
export { TEMPLATES, type MessageTemplate } from "./templates.js";
export {
  createVaaklyPlugin,
  VAAKLY_PLUGIN_NAME,
  VAAKLY_PLUGIN_VERSION,
} from "./plugin.js";
