import * as vscode from "vscode";
import { PlutoAIChatProvider, ChatMessage } from "./chatProvider";

export class PlutoAIChatPanel {
  public static currentPanel: PlutoAIChatPanel | undefined;
  private readonly _panel: vscode.WebviewPanel;
  private readonly _extensionUri: vscode.Uri;
  private readonly _provider: PlutoAIChatProvider;
  private readonly _context: vscode.ExtensionContext;
  private _disposables: vscode.Disposable[] = [];

  public static sendMessageToChat(message: string) {
    if (PlutoAIChatPanel.currentPanel) {
      PlutoAIChatPanel.currentPanel._panel.webview.postMessage({
        type: "quickFixMessage",
        message: message,
      });

      setTimeout(() => {
        PlutoAIChatPanel.currentPanel?._panel.webview.postMessage({
          type: "focusInput",
        });
      }, 100);
    }
  }

  public static createOrShow(
    extensionUri: vscode.Uri,
    provider: PlutoAIChatProvider,
    context: vscode.ExtensionContext
  ) {
    const column =
      vscode.window.activeTextEditor?.viewColumn ?? vscode.ViewColumn.Beside;

    if (PlutoAIChatPanel.currentPanel) {
      PlutoAIChatPanel.currentPanel._panel.reveal(column);
      return PlutoAIChatPanel.currentPanel;
    }

    const panel = vscode.window.createWebviewPanel(
      "plutoAiChat",
      "GoPluto AI Chat",
      column,
      {
        enableScripts: true,
        localResourceRoots: [extensionUri],
        retainContextWhenHidden: true,
      }
    );

    PlutoAIChatPanel.currentPanel = new PlutoAIChatPanel(
      panel,
      extensionUri,
      provider,
      context
    );
    return PlutoAIChatPanel.currentPanel;
  }

  private constructor(
    panel: vscode.WebviewPanel,
    extensionUri: vscode.Uri,
    provider: PlutoAIChatProvider,
    context: vscode.ExtensionContext
  ) {
    this._panel = panel;
    this._extensionUri = extensionUri;
    this._provider = provider;
    this._context = context;

    this._update();

    this._panel.onDidDispose(() => this.dispose(), null, this._disposables);

    this._panel.webview.onDidReceiveMessage(
      async (data) => {
        switch (data.type) {
          case "sendMessage":
            await this._handleSendMessage(data.message);
            break;
          case "clearChat":
            await this._handleClearChat();
            break;
          case "newChat":
            await this._handleNewChat();
            break;
          case "copyCode":
            await vscode.env.clipboard.writeText(data.code);
            vscode.window.showInformationMessage("Code copied to clipboard!");
            break;
          case "openDashboard":
            vscode.commands.executeCommand("gopluto-ai-chat.openDashboard");
            break;
          case "getApiKey":
            vscode.commands.executeCommand("gopluto-ai-chat.getApiKey");
            break;
          case "hideWelcomeBanner":
            vscode.workspace
              .getConfiguration("goplutoAiChat")
              .update("showWelcomeBanner", false, true);
            break;
        }
      },
      null,
      this._disposables
    );

    this._panel.onDidChangeViewState(
      (e) => {
        if (e.webviewPanel.visible) {
          this._panel.webview.postMessage({ type: "panelFocused" });
        }
      },
      null,
      this._disposables
    );
  }

  private async _handleSendMessage(message: string) {
    if (!message.trim()) return;

    // Show user message immediately
    this._panel.webview.postMessage({
      type: "userMessage",
      message: message,
      timestamp: Date.now(),
    });

    // Show typing indicator
    this._panel.webview.postMessage({ type: "typing", isTyping: true });

    try {
      const response = await this._provider.sendMessage(message);

      this._panel.webview.postMessage({
        type: "response",
        message: response,
        conversationId: this._provider.getConversationId(),
      });

      const messages = this._provider.getMessageHistory();
      if (messages.length === 2) {
        vscode.window.showInformationMessage(
          "GoPluto AI: Expert help provided!"
        );
      }
    } catch (error: any) {
      console.error("Error in _handleSendMessage:", error);

      let userMessage = error.message;
      if (error.message.includes("401") || error.message.includes("403")) {
        userMessage =
          "Invalid API key. Please check your GoPluto AI API key in settings.";
        vscode.window
          .showErrorMessage(`GoPluto AI: ${userMessage}`, "Open Settings")
          .then((selection) => {
            if (selection === "Open Settings") {
              vscode.commands.executeCommand(
                "workbench.action.openSettings",
                "goplutoAiChat.apiKey"
              );
            }
          });
      } else if (error.message.includes("network")) {
        userMessage = "Network error. Please check your internet connection.";
        vscode.window.showErrorMessage(`GoPluto AI: ${userMessage}`);
      } else {
        vscode.window.showErrorMessage(`GoPluto AI: ${error.message}`);
      }

      this._panel.webview.postMessage({ type: "error", message: userMessage });
    } finally {
      this._panel.webview.postMessage({ type: "typing", isTyping: false });
    }
  }

  private async _handleClearChat() {
    this._provider.clearConversation();
    this._update();
    vscode.window.showInformationMessage("GoPluto AI: Chat cleared");
  }

  private async _handleNewChat() {
    this._provider.clearConversation();
    this._update();
    vscode.window.showInformationMessage("GoPluto AI: New chat started");
  }

  public dispose() {
    PlutoAIChatPanel.currentPanel = undefined;
    this._panel.dispose();
    while (this._disposables.length) {
      const x = this._disposables.pop();
      if (x) x.dispose();
    }
  }

  private _update() {
    const webview = this._panel.webview;
    this._panel.webview.html = this._getHtmlForWebview(webview);

    const messages = this._provider.getMessageHistory();
    webview.postMessage({
      type: "initialData",
      messages: messages,
      conversationId: this._provider.getConversationId(),
      showWelcomeBanner: vscode.workspace
        .getConfiguration("goplutoAiChat")
        .get("showWelcomeBanner", true),
    });
  }

  private _getHtmlForWebview(webview: vscode.Webview): string {
    const nonce = getNonce();

    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';">
    <title>GoPluto AI Chat</title>
    <style>
        :root {
            --vscode-font-size: 13px;
            --border-radius: 6px;
            --spacing: 12px;
        }
        
        body {
            font-family: var(--vscode-font-family);
            font-size: var(--vscode-font-size);
            color: var(--vscode-foreground);
            background: var(--vscode-editor-background);
            margin: 0;
            padding: 0;
            height: 100vh;
            display: flex;
            flex-direction: column;
        }
        
        .chat-container {
            flex: 1;
            display: flex;
            flex-direction: column;
            height: 100%;
        }
        
        .header {
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: var(--spacing);
            border-bottom: 1px solid var(--vscode-panel-border);
            background: var(--vscode-panel-background);
        }
        
        .header h1 {
            margin: 0;
            font-size: 14px;
            font-weight: 600;
        }
        
        .header-buttons {
            display: flex;
            gap: 8px;
        }
        
        .welcome-banner {
            background: var(--vscode-textBlockQuote-background);
            border: 1px solid var(--vscode-textBlockQuote-border);
            border-radius: var(--border-radius);
            padding: var(--spacing);
            margin: var(--spacing);
            margin-bottom: 0;
        }
        
        .welcome-banner.hidden {
            display: none;
        }
        
        .messages-container {
            flex: 1;
            overflow-y: auto;
            margin: var(--spacing);
            margin-bottom: 0;
            border: 1px solid var(--vscode-input-border);
            border-radius: var(--border-radius);
            background: var(--vscode-input-background);
        }
        
        .messages {
            padding: var(--spacing);
            min-height: 100%;
        }
        
        .message {
            margin-bottom: 16px;
            padding: var(--spacing);
            border-radius: var(--border-radius);
            line-height: 1.5;
        }
        
        .user-message {
            background: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            margin-left: 20%;
        }
        
        .assistant-message {
            background: var(--vscode-input-background);
            border: 1px solid var(--vscode-input-border);
            margin-right: 20%;
        }
        
        .message-header {
            display: flex;
            justify-content: space-between;
            margin-bottom: 8px;
            font-size: 11px;
            opacity: 0.8;
        }
        
        .message-content {
            white-space: pre-wrap;
            word-wrap: break-word;
        }
        
        .input-area {
            display: flex;
            gap: 8px;
            padding: var(--spacing);
            border-top: 1px solid var(--vscode-panel-border);
            background: var(--vscode-panel-background);
        }
        
        #messageInput {
            flex: 1;
            padding: 8px 12px;
            border: 1px solid var(--vscode-input-border);
            border-radius: var(--border-radius);
            background: var(--vscode-input-background);
            color: var(--vscode-input-foreground);
            font-family: inherit;
            resize: none;
            min-height: 36px;
        }
        
        button {
            padding: 8px 16px;
            background: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            border: none;
            border-radius: var(--border-radius);
            cursor: pointer;
        }
        
        button:hover {
            background: var(--vscode-button-hoverBackground);
        }
        
        button.secondary {
            background: var(--vscode-button-secondaryBackground);
        }
        
        .typing-indicator {
            display: none;
            align-items: center;
            gap: 8px;
            padding: var(--spacing);
            color: var(--vscode-descriptionForeground);
            font-style: italic;
        }
        
        .error {
            background: var(--vscode-inputValidation-errorBackground);
            border: 1px solid var(--vscode-inputValidation-errorBorder);
            color: var(--vscode-errorForeground);
            padding: var(--spacing);
            border-radius: var(--border-radius);
            margin: 8px 0;
        }
        
        .empty-state {
            text-align: center;
            padding: 40px 20px;
            color: var(--vscode-descriptionForeground);
        }
    </style>
</head>
<body>
    <div class="chat-container">
        <div class="header">
            <h1>Ask Pluto</h1>
            <div class="header-buttons">
                <button id="newChat" class="secondary">New Chat</button>
                <button id="clearChat" class="secondary">Clear</button>
            </div>
        </div>
        
        <div class="welcome-banner" id="welcomeBanner">
            <h3>Get Code Expert Help</h3>
            <p>Connect with GoPluto AI experts for instant assistance.</p>
            <div class="banner-buttons">
                <button id="getApiKey" class="secondary">Get API Key</button>
                <button id="closeBanner" class="secondary">Dismiss</button>
            </div>
        </div>
        
        <div class="messages-container">
            <div class="messages" id="messages">
                <div class="empty-state" id="emptyState">
                    <h3>Start a conversation with GoPluto AI</h3>
                    <p>Ask for help with code issues, debugging, or any development questions.</p>
                </div>
            </div>
        </div>
        
        <div class="typing-indicator" id="typingIndicator">
            <span>Pluto is thinking</span>
            <div class="typing-dots">
                <div class="typing-dot"></div>
                <div class="typing-dot"></div>
                <div class="typing-dot"></div>
            </div>
        </div>
        
        <div class="input-area">
            <textarea id="messageInput" placeholder="Describe your code issue..." rows="1"></textarea>
            <button id="sendButton">Send</button>
        </div>
    </div>

    <script nonce="${nonce}">
        const vscode = acquireVsCodeApi();
        
        // Get DOM elements
        const elements = {
            messages: document.getElementById('messages'),
            messageInput: document.getElementById('messageInput'),
            sendButton: document.getElementById('sendButton'),
            clearButton: document.getElementById('clearChat'),
            newChatButton: document.getElementById('newChat'),
            typingIndicator: document.getElementById('typingIndicator'),
            emptyState: document.getElementById('emptyState'),
            welcomeBanner: document.getElementById('welcomeBanner'),
            getApiKeyButton: document.getElementById('getApiKey'),
            closeBannerButton: document.getElementById('closeBanner')
        };

        // Initialize
        function init() {
            setupEventListeners();
            elements.messageInput.focus();
        }

        // Setup event listeners
        function setupEventListeners() {
            // Input events
            elements.messageInput.addEventListener('input', function() {
                this.style.height = 'auto';
                this.style.height = Math.min(this.scrollHeight, 120) + 'px';
                elements.sendButton.disabled = !this.value.trim();
            });

            elements.messageInput.addEventListener('keydown', function(e) {
                if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                    e.preventDefault();
                    sendMessage();
                }
            });

            // Button events
            elements.sendButton.addEventListener('click', sendMessage);
            elements.clearButton.addEventListener('click', () => vscode.postMessage({ type: 'clearChat' }));
            elements.newChatButton.addEventListener('click', () => vscode.postMessage({ type: 'newChat' }));
            elements.getApiKeyButton.addEventListener('click', () => vscode.postMessage({ type: 'getApiKey' }));
            elements.closeBannerButton.addEventListener('click', () => {
                elements.welcomeBanner.classList.add('hidden');
                vscode.postMessage({ type: 'hideWelcomeBanner' });
            });
        }

        // Add message to chat
        function addMessage(content, isUser = false, timestamp = new Date()) {
            if (elements.emptyState.style.display !== 'none') {
                elements.emptyState.style.display = 'none';
            }

            const messageDiv = document.createElement('div');
            messageDiv.className = 'message ' + (isUser ? 'user-message' : 'assistant-message');
            
            const headerDiv = document.createElement('div');
            headerDiv.className = 'message-header';
            headerDiv.innerHTML = '<strong>' + (isUser ? 'You' : '🚀 GoPluto AI') + '</strong><span>' + timestamp.toLocaleTimeString() + '</span>';
            
            const contentDiv = document.createElement('div');
            contentDiv.className = 'message-content';
            contentDiv.textContent = content;
            
            messageDiv.appendChild(headerDiv);
            messageDiv.appendChild(contentDiv);
            elements.messages.appendChild(messageDiv);
            
            elements.messages.scrollTop = elements.messages.scrollHeight;
        }

        // Send message
        function sendMessage() {
            const message = elements.messageInput.value.trim();
            if (!message) return;
            
            elements.messageInput.value = '';
            elements.messageInput.style.height = 'auto';
            elements.sendButton.disabled = true;
            
            vscode.postMessage({ type: 'sendMessage', message: message });
        }

        // Handle messages from extension
        window.addEventListener('message', event => {
            const message = event.data;
            
            switch (message.type) {
                case 'initialData':
                    elements.messages.innerHTML = '';
                    if (message.messages && message.messages.length > 0) {
                        elements.emptyState.style.display = 'none';
                        message.messages.forEach(msg => {
                            addMessage(msg.content, msg.role === 'user', new Date(msg.timestamp));
                        });
                    }
                    if (!message.showWelcomeBanner) {
                        elements.welcomeBanner.classList.add('hidden');
                    }
                    break;
                    
                case 'userMessage':
                    addMessage(message.message, true, new Date(message.timestamp));
                    break;
                    
                case 'response':
                    addMessage(message.message, false);
                    elements.sendButton.disabled = false;
                    break;
                    
                case 'error':
                    const errorDiv = document.createElement('div');
                    errorDiv.className = 'error';
                    errorDiv.textContent = message.message;
                    elements.messages.appendChild(errorDiv);
                    elements.sendButton.disabled = false;
                    break;
                    
                case 'typing':
                    elements.typingIndicator.style.display = message.isTyping ? 'flex' : 'none';
                    break;
                    
                case 'quickFixMessage':
                    elements.messageInput.value = message.message;
                    elements.messageInput.focus();
                    break;
                    
                case 'focusInput':
                case 'panelFocused':
                    elements.messageInput.focus();
                    break;
            }
        });

        // Start the application
        init();
    </script>
</body>
</html>`;
  }
}

function getNonce() {
  let text = "";
  const possible =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  for (let i = 0; i < 32; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
}
