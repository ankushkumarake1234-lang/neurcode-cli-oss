"use strict";
/**
 * Git Utility Functions
 *
 * Wraps git command execution with debug logging and large buffer support
 * to prevent ENOBUFS errors in large repositories.
 * Handles initial-commit case by falling back to empty tree when base is invalid.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.GIT_EMPTY_TREE = void 0;
exports.execGitCommand = execGitCommand;
exports.getDiffFromBase = getDiffFromBase;
const child_process_1 = require("child_process");
/** Git's canonical empty tree hash - safe to use when repo has only one commit */
exports.GIT_EMPTY_TREE = '4b825dc642cb6eb9a060e54bf8d69288fbee4904';
const EXEC_OPTS = {
    encoding: 'utf-8',
    maxBuffer: 1024 * 1024 * 1024, // 1GB buffer
};
/**
 * Execute a git command with large buffer
 */
function execGitCommand(command, options = {}) {
    const execOptions = {
        ...EXEC_OPTS,
        ...options,
    };
    return (0, child_process_1.execSync)(command, execOptions);
}
/**
 * Get diff from a base ref to current work tree.
 * If base is invalid (e.g. HEAD~1 on initial commit), falls back to diff from empty tree to HEAD
 * so all files are treated as newly added and the policy engine can scan them.
 */
function getDiffFromBase(base) {
    try {
        return (0, child_process_1.execSync)(`git diff ${base}`, EXEC_OPTS);
    }
    catch {
        console.warn('Initial commit detected. Comparing against empty tree.');
        return (0, child_process_1.execSync)(`git diff ${exports.GIT_EMPTY_TREE} HEAD`, EXEC_OPTS);
    }
}
//# sourceMappingURL=git.js.map