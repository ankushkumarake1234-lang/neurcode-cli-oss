"use strict";
/**
 * .neurcodeignore support for filtering build artifacts and noise from verification.
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.loadIgnore = loadIgnore;
const ignore_1 = __importDefault(require("ignore"));
const fs_1 = require("fs");
const path_1 = require("path");
const DEFAULT_PATTERNS = [
    '.git',
    'node_modules',
    'dist',
    'build',
    'coverage',
    '*.map',
];
/**
 * Load .neurcodeignore from workingDir and return a filter function.
 * Paths for which the filter returns true should be excluded from verification.
 *
 * @param workingDir - Directory containing .neurcodeignore (e.g. process.cwd())
 * @returns (path: string) => true if path should be ignored
 */
function loadIgnore(workingDir) {
    const ig = (0, ignore_1.default)();
    ig.add(DEFAULT_PATTERNS);
    const neurcodeignorePath = (0, path_1.join)(workingDir, '.neurcodeignore');
    if ((0, fs_1.existsSync)(neurcodeignorePath)) {
        try {
            const content = (0, fs_1.readFileSync)(neurcodeignorePath, 'utf-8');
            const lines = content
                .split(/\r?\n/)
                .map((l) => l.trim())
                .filter((l) => l.length > 0 && !l.startsWith('#'));
            if (lines.length > 0) {
                ig.add(lines);
            }
        }
        catch {
            // If read fails, use defaults only
        }
    }
    return (pathname) => {
        // ignore expects path.relative()-style paths (no leading . or /)
        const normalized = pathname.replace(/^\.\//, '').replace(/\\/g, '/');
        return ig.ignores(normalized);
    };
}
//# sourceMappingURL=ignore.js.map