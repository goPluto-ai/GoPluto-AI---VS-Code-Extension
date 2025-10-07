import * as vscode from "vscode";
import { PlutoAIChatPanel } from "./chatPanel";
import { PlutoAICodeActionProvider } from "./codeActionProvider";
import { PlutoAIChatProvider } from "./chatProvider";

export function activate(context: vscode.ExtensionContext) {
  console.log("GoPluto AI extension is now active!");

  const config = vscode.workspace.getConfiguration("goplutoAiChat");
  const apiKey = config.get<string>("apiKey");

  // Register providers and commands
  const provider = new PlutoAIChatProvider(context, apiKey || "");
  const codeActionProvider = new PlutoAICodeActionProvider();

  // Check API key on activation
  if (!apiKey) {
    vscode.window
      .showWarningMessage(
        "GoPluto AI: API key not configured. " +
          "Please set it in settings to use all features.",
        "Open Settings",
        "Get API Key"
      )
      .then((selection) => {
        if (selection === "Open Settings") {
          vscode.commands.executeCommand(
            "workbench.action.openSettings",
            "goplutoAiChat.apiKey"
          );
        } else if (selection === "Get API Key") {
          vscode.commands.executeCommand("gopluto-ai-chat.getApiKey");
        }
      });
  }

  // Register commands
  const commands = [
    vscode.commands.registerCommand("gopluto-ai-chat.openChat", () => {
      if (!validateApiKey()) {
        return;
      }
      PlutoAIChatPanel.createOrShow(context.extensionUri, provider, context);
    }),

    vscode.commands.registerCommand("gopluto-ai-chat.newChat", () => {
      if (!validateApiKey()) {
        return;
      }
      provider.clearConversation();
      PlutoAIChatPanel.createOrShow(context.extensionUri, provider, context);
      vscode.window.showInformationMessage(
        "GoPluto AI: Started new chat session"
      );
    }),

    vscode.commands.registerCommand("gopluto-ai-chat.clearAll", () => {
      provider.clearConversation();
      vscode.window.showInformationMessage(
        "GoPluto AI: All conversations cleared"
      );
    }),

    vscode.commands.registerCommand(
      "gopluto-ai-chat.quickFixWithExpert",
      async (diagnostic?: vscode.Diagnostic) => {
        if (!validateApiKey()) {
          return;
        }

        const config = vscode.workspace.getConfiguration("goplutoAiChat");
        const autoOpen = config.get<boolean>("autoOpenChat", true);

        const contextMessage = await getContextMessage(diagnostic);

        if (autoOpen) {
          PlutoAIChatPanel.createOrShow(
            context.extensionUri,
            provider,
            context
          );

          // Send message after a short delay to ensure panel is ready
          setTimeout(() => {
            PlutoAIChatPanel.sendMessageToChat(contextMessage);
          }, 500);
        } else {
          const action = await vscode.window.showInformationMessage(
            "GoPluto AI: Code issue ready for expert help",
            "Open Chat",
            "Copy to Clipboard"
          );

          if (action === "Open Chat") {
            PlutoAIChatPanel.createOrShow(
              context.extensionUri,
              provider,
              context
            );
            setTimeout(() => {
              PlutoAIChatPanel.sendMessageToChat(contextMessage);
            }, 500);
          } else if (action === "Copy to Clipboard") {
            vscode.env.clipboard.writeText(contextMessage);
            vscode.window.showInformationMessage(
              "Code context copied to clipboard"
            );
          }
        }
      }
    ),

    vscode.commands.registerCommand("gopluto-ai-chat.getApiKey", () => {
      vscode.env.openExternal(
        vscode.Uri.parse("https://gopluto.ai/dashboard/api-keys")
      );
    }),

    vscode.commands.registerCommand("gopluto-ai-chat.openDashboard", () => {
      vscode.env.openExternal(
        vscode.Uri.parse("https://gopluto.ai/dashboard/chat")
      );
    }),
  ];

  // Register code action provider for multiple languages
  const supportedLanguages = [
    "javascript",
    "typescript",
    "python",
    "java",
    "cpp",
    "c",
    "csharp",
    "go",
    "php",
    "ruby",
    "html",
    "css",
    "json",
    "yaml",
    "markdown",
  ];

  const codeActionDisposables = supportedLanguages.map((language) =>
    vscode.languages.registerCodeActionsProvider(language, codeActionProvider, {
      providedCodeActionKinds:
        PlutoAICodeActionProvider.providedCodeActionKinds,
    })
  );

  // Register diagnostic listener for error help
  const diagnosticDisposable = vscode.languages.onDidChangeDiagnostics(
    async (e) => {
      const config = vscode.workspace.getConfiguration("goplutoAiChat");
      if (!config.get<boolean>("enableQuickFixes", true)) {
        return;
      }

      for (const uri of e.uris) {
        const diagnostics = vscode.languages.getDiagnostics(uri);
        const errors = diagnostics.filter(
          (d) => d.severity === vscode.DiagnosticSeverity.Error
        );

        if (errors.length > 0) {
          // Show help for persistent errors
          showErrorHelpIfNeeded(errors, uri);
        }
      }
    }
  );

  // Configuration change listener
  const configDisposable = vscode.workspace.onDidChangeConfiguration((e) => {
    if (e.affectsConfiguration("goplutoAiChat.apiKey")) {
      const newApiKey = vscode.workspace
        .getConfiguration("goplutoAiChat")
        .get<string>("apiKey");
      provider.updateApiKey(newApiKey || "");

      if (newApiKey) {
        vscode.window.showInformationMessage(
          "GoPluto AI: API key updated successfully"
        );
      }
    }
  });

  // Add all disposables to context
  context.subscriptions.push(
    ...commands,
    ...codeActionDisposables,
    diagnosticDisposable,
    configDisposable
  );
}

function validateApiKey(): boolean {
  const config = vscode.workspace.getConfiguration("goplutoAiChat");
  const apiKey = config.get<string>("apiKey");

  if (!apiKey) {
    vscode.window
      .showErrorMessage(
        "GoPluto AI: API key required. Please configure it in settings.",
        "Open Settings",
        "Get API Key"
      )
      .then((selection) => {
        if (selection === "Open Settings") {
          vscode.commands.executeCommand(
            "workbench.action.openSettings",
            "goplutoAiChat.apiKey"
          );
        } else if (selection === "Get API Key") {
          vscode.commands.executeCommand("gopluto-ai-chat.getApiKey");
        }
      });
    return false;
  }

  return true;
}

async function getContextMessage(
  diagnostic?: vscode.Diagnostic
): Promise<string> {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    return "I need help with some code.";
  }

  const document = editor.document;
  const selection = editor.selection;
  const selectedText = document.getText(selection);
  const fileName = document.fileName.split("/").pop() || "unknown";
  const language = document.languageId;

  let message = `I need help with ${language} code`;

  if (selectedText) {
    message += `:\n\n\`\`\`${language}\n${selectedText}\n\`\`\``;
  }

  if (diagnostic) {
    message += `\n\nError: ${diagnostic.message}`;
    if (diagnostic.range) {
      const lineNumber = diagnostic.range.start.line + 1;
      message += `\nLocation: Line ${lineNumber}`;
    }
  }

  message += `\n\nFile: ${fileName}`;
  return message;
}

async function showErrorHelpIfNeeded(
  errors: vscode.Diagnostic[],
  uri: vscode.Uri
) {
  // Only show help for persistent errors (same errors for more than 2 seconds)
  setTimeout(async () => {
    const currentDiagnostics = vscode.languages.getDiagnostics(uri);
    const currentErrors = currentDiagnostics.filter(
      (d) => d.severity === vscode.DiagnosticSeverity.Error
    );

    if (currentErrors.length > 0) {
      const action = await vscode.window.showWarningMessage(
        `Found ${currentErrors.length} error(s) in your code. Get expert help from GoPluto AI?`,
        "Get Help",
        "Dismiss"
      );

      if (action === "Get Help") {
        vscode.commands.executeCommand(
          "gopluto-ai-chat.quickFixWithExpert",
          currentErrors[0]
        );
      }
    }
  }, 2000);
}

export function deactivate() {}
