"use strict";
/**
 * Re-export types and functions from policy engine
 * This maintains backward compatibility while using the shared package
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.defaultRules = exports.createDefaultPolicy = void 0;
exports.evaluateRules = evaluateRules;
const policy_engine_1 = require("@neurcode-ai/policy-engine");
var policy_engine_2 = require("@neurcode-ai/policy-engine");
Object.defineProperty(exports, "createDefaultPolicy", { enumerable: true, get: function () { return policy_engine_2.createDefaultPolicy; } });
Object.defineProperty(exports, "defaultRules", { enumerable: true, get: function () { return policy_engine_2.defaultRules; } });
/**
 * Evaluate rules using default policy
 * This maintains backward compatibility with existing CLI code
 */
function evaluateRules(diffFiles) {
    const defaultPolicy = (0, policy_engine_1.createDefaultPolicy)();
    return (0, policy_engine_1.evaluateRules)(diffFiles, defaultPolicy.rules);
}
//# sourceMappingURL=rules.js.map