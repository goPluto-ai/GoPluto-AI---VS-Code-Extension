"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.PlutoAICodeActionProvider = void 0;
const vscode = __importStar(require("vscode"));
class PlutoAICodeActionProvider {
    provideCodeActions(document, range, context, token) {
        const actions = [];
        // Check if quick fixes are enabled
        const config = vscode.workspace.getConfiguration("goplutoAiChat");
        if (!config.get("enableQuickFixes", true)) {
            return actions;
        }
        // Add Pluto AI quick fix for each diagnostic
        context.diagnostics.forEach((diagnostic) => {
            if (this.shouldProvideFix(diagnostic)) {
                const aiFix = this.createPlutoAIFixAction(diagnostic, document, range);
                if (aiFix) {
                    actions.push(aiFix);
                }
            }
        });
        // Add context menu action for selected code
        if (!range.isEmpty) {
            const selectedAction = this.createSelectedCodeAction(document, range);
            actions.push(selectedAction);
        }
        return actions;
    }
    shouldProvideFix(diagnostic) {
        return (diagnostic.severity === vscode.DiagnosticSeverity.Error ||
            diagnostic.severity === vscode.DiagnosticSeverity.Warning);
    }
    createPlutoAIFixAction(diagnostic, document, range) {
        try {
            const problemCode = document.getText(diagnostic.range);
            const lineNumber = diagnostic.range.start.line + 1;
            const fileName = document.fileName.split("/").pop() || "unknown";
            const language = this.getLanguageFromFileName(fileName);
            const contextMessage = this.createContextMessage(diagnostic, problemCode, fileName, lineNumber, language);
            const action = new vscode.CodeAction(`🚀 Get help from GoPluto AI Experts`, vscode.CodeActionKind.QuickFix);
            action.command = {
                command: "gopluto-ai-chat.quickFixWithExpert",
                title: "Get help from GoPluto AI Experts",
                arguments: [diagnostic],
            };
            action.diagnostics = [diagnostic];
            action.isPreferred = true;
            return action;
        }
        catch (error) {
            console.error("Error creating code action:", error);
            return null;
        }
    }
    createSelectedCodeAction(document, range) {
        const selectedText = document.getText(range);
        const fileName = document.fileName.split("/").pop() || "unknown";
        const language = document.languageId;
        const contextMessage = this.createSelectedCodeMessage(selectedText, fileName, language);
        const action = new vscode.CodeAction(`💬 Ask GoPluto AI about this code`, vscode.CodeActionKind.Empty);
        action.command = {
            command: "gopluto-ai-chat.quickFixWithExpert",
            title: "Get help from GoPluto AI Experts",
            arguments: [undefined, contextMessage],
        };
        return action;
    }
    createContextMessage(diagnostic, problemCode, fileName, lineNumber, language) {
        return `
I'm encountering an issue in my ${language} code:

**File:** ${fileName}
**Line:** ${lineNumber}
**Error:** ${diagnostic.message}

**Problematic Code:**
\`\`\`${language}
${problemCode}
\`\`\`

**Context:**
${this.getCodeContext(problemCode, 3)}

Please help me understand and fix this issue. Explain the solution clearly.
`;
    }
    createSelectedCodeMessage(selectedText, fileName, language) {
        return `
I'd like help with this ${language} code from ${fileName}:

\`\`\`${language}
${selectedText}
\`\`\`

Please help me understand this code, suggest improvements, or explain any issues you see.
`;
    }
    getCodeContext(code, linesAround) {
        // This would extract surrounding code context
        // For now, return a simple message
        return "The code above is causing the issue. Please analyze it and provide a fix.";
    }
    getLanguageFromFileName(fileName) {
        const ext = fileName.split(".").pop()?.toLowerCase();
        const languageMap = {
            js: "javascript",
            ts: "typescript",
            py: "python",
            java: "java",
            cpp: "cpp",
            c: "c",
            cs: "csharp",
            go: "go",
            php: "php",
            rb: "ruby",
            html: "html",
            css: "css",
            json: "json",
            yaml: "yaml",
            yml: "yaml",
            md: "markdown",
        };
        return languageMap[ext || ""] || ext || "unknown";
    }
}
exports.PlutoAICodeActionProvider = PlutoAICodeActionProvider;
PlutoAICodeActionProvider.providedCodeActionKinds = [
    vscode.CodeActionKind.QuickFix,
];
//# sourceMappingURL=codeActionProvider.js.map