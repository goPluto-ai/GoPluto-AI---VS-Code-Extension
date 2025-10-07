import * as vscode from "vscode";

export class PlutoAICodeActionProvider implements vscode.CodeActionProvider {
  public static readonly providedCodeActionKinds = [
    vscode.CodeActionKind.QuickFix,
  ];

  provideCodeActions(
    document: vscode.TextDocument,
    range: vscode.Range | vscode.Selection,
    context: vscode.CodeActionContext,
    token: vscode.CancellationToken
  ): vscode.CodeAction[] {
    const actions: vscode.CodeAction[] = [];

    // Check if quick fixes are enabled
    const config = vscode.workspace.getConfiguration("goplutoAiChat");
    if (!config.get<boolean>("enableQuickFixes", true)) {
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

  private shouldProvideFix(diagnostic: vscode.Diagnostic): boolean {
    return (
      diagnostic.severity === vscode.DiagnosticSeverity.Error ||
      diagnostic.severity === vscode.DiagnosticSeverity.Warning
    );
  }

  private createPlutoAIFixAction(
    diagnostic: vscode.Diagnostic,
    document: vscode.TextDocument,
    range: vscode.Range
  ): vscode.CodeAction | null {
    try {
      const problemCode = document.getText(diagnostic.range);
      const lineNumber = diagnostic.range.start.line + 1;
      const fileName = document.fileName.split("/").pop() || "unknown";
      const language = this.getLanguageFromFileName(fileName);

      const contextMessage = this.createContextMessage(
        diagnostic,
        problemCode,
        fileName,
        lineNumber,
        language
      );

      const action = new vscode.CodeAction(
        `🚀 Get help from GoPluto AI Experts`,
        vscode.CodeActionKind.QuickFix
      );

      action.command = {
        command: "gopluto-ai-chat.quickFixWithExpert",
        title: "Get help from GoPluto AI Experts",
        arguments: [diagnostic],
      };

      action.diagnostics = [diagnostic];
      action.isPreferred = true;

      return action;
    } catch (error) {
      console.error("Error creating code action:", error);
      return null;
    }
  }

  private createSelectedCodeAction(
    document: vscode.TextDocument,
    range: vscode.Range
  ): vscode.CodeAction {
    const selectedText = document.getText(range);
    const fileName = document.fileName.split("/").pop() || "unknown";
    const language = document.languageId;

    const contextMessage = this.createSelectedCodeMessage(
      selectedText,
      fileName,
      language
    );

    const action = new vscode.CodeAction(
      `💬 Ask GoPluto AI about this code`,
      vscode.CodeActionKind.Empty
    );

    action.command = {
      command: "gopluto-ai-chat.quickFixWithExpert",
      title: "Get help from GoPluto AI Experts",
      arguments: [undefined, contextMessage],
    };

    return action;
  }

  private createContextMessage(
    diagnostic: vscode.Diagnostic,
    problemCode: string,
    fileName: string,
    lineNumber: number,
    language: string
  ): string {
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

  private createSelectedCodeMessage(
    selectedText: string,
    fileName: string,
    language: string
  ): string {
    return `
I'd like help with this ${language} code from ${fileName}:

\`\`\`${language}
${selectedText}
\`\`\`

Please help me understand this code, suggest improvements, or explain any issues you see.
`;
  }

  private getCodeContext(code: string, linesAround: number): string {
    // This would extract surrounding code context
    // For now, return a simple message
    return "The code above is causing the issue. Please analyze it and provide a fix.";
  }

  private getLanguageFromFileName(fileName: string): string {
    const ext = fileName.split(".").pop()?.toLowerCase();
    const languageMap: { [key: string]: string } = {
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
