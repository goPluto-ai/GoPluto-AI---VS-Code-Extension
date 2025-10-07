import * as vscode from "vscode";

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
}

export interface PlutoAIResponse {
  status: string;
  reply: string;
  probableReplyByUser?: string[];
  memory?: any;
  convId?: string;
  id?: string;
}

export class PlutoAIChatProvider {
  private conversationId: string | null = null;
  private messageHistory: ChatMessage[] = [];
  private apiKey: string;

  constructor(private context: vscode.ExtensionContext, apiKey: string) {
    this.apiKey = apiKey;
  }

  updateApiKey(newApiKey: string) {
    this.apiKey = newApiKey;
  }

  async sendMessage(message: string): Promise<string> {
    if (!this.apiKey || this.apiKey.trim().length < 10) {
      throw new Error(
        "GoPluto AI API key not configured or invalid. " +
          "Please check your settings and ensure you have a valid API key from https://gopluto.ai"
      );
    }

    try {
      // Add user message to history
      const userMessage: ChatMessage = {
        role: "user",
        content: message,
        timestamp: new Date(),
      };
      this.messageHistory.push(userMessage);

      // Prepare the request URL with conversation ID if available
      let url = "https://api.gopluto.ai/api/users/llm-response";
      if (this.conversationId) {
        url += `?convId=${this.conversationId}`;
      }

      console.log("Sending request to GoPluto AI:", url);

      const response = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
          "User-Agent": "VSCode-GoPluto-Extension/1.0.0",
        },
        body: JSON.stringify({
          query: message,
        }),
      });

      if (!response.ok) {
        let errorText = "Unknown error";
        try {
          errorText = await response.text();
        } catch (e) {
          // Ignore text parsing errors
        }

        console.error("GoPluto AI API Error:", response.status, errorText);

        if (response.status === 401) {
          throw new Error(
            "Authentication failed: Invalid API key. Please check your API key in settings."
          );
        } else if (response.status === 403) {
          throw new Error(
            "Access forbidden: Your API key does not have permission to access this resource."
          );
        } else if (response.status === 429) {
          throw new Error("Rate limit exceeded: Please try again in a moment.");
        } else if (response.status >= 500) {
          throw new Error(
            "GoPluto AI service is temporarily unavailable. Please try again later."
          );
        } else {
          throw new Error(
            `API request failed: ${response.status} - ${errorText}`
          );
        }
      }

      const data: PlutoAIResponse = await response.json();
      console.log("GoPluto AI Response:", data);

      // Validate response structure
      if (!data.status) {
        throw new Error("Invalid response format from GoPluto AI API");
      }

      // Extract conversation ID from response
      if (data.convId) {
        this.conversationId = data.convId;
        console.log("Conversation ID updated:", this.conversationId);
      }

      // Handle different statuses
      if (data.status === "complete" && data.reply) {
        const assistantMessage: ChatMessage = {
          role: "assistant",
          content: data.reply,
          timestamp: new Date(),
        };
        this.messageHistory.push(assistantMessage);
        return data.reply;
      } else if (data.status === "error") {
        throw new Error(data.reply || "Unknown error from GoPluto AI");
      } else {
        throw new Error(`Unexpected response status: ${data.status}`);
      }
    } catch (error: any) {
      console.error("GoPluto AI API Error:", error);

      // Remove the user message from history if the request failed
      this.messageHistory.pop();

      // Re-throw with more user-friendly messages
      if (
        error.message.includes("network") ||
        error.message.includes("fetch")
      ) {
        throw new Error(
          "Network error: Please check your internet connection and try again."
        );
      } else if (error.message.includes("timeout")) {
        throw new Error(
          "Request timeout: The request took too long. Please try again."
        );
      } else {
        throw error; // Re-throw our already formatted errors
      }
    }
  }

  getMessageHistory(): ChatMessage[] {
    return [...this.messageHistory];
  }

  clearConversation(): void {
    this.messageHistory = [];
    this.conversationId = null;
  }

  getConversationId(): string | null {
    return this.conversationId;
  }

  // Get probable replies for quick responses
  getProbableReplies(): string[] {
    // This would need to be stored from the last API response
    return [];
  }

  // Test API key validity
  async testApiKey(): Promise<boolean> {
    if (!this.apiKey) {
      return false;
    }

    try {
      const response = await fetch(
        "https://api.gopluto.ai/api/users/llm-response",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${this.apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            query: "test",
          }),
        }
      );

      return response.status !== 401 && response.status !== 403;
    } catch {
      return false;
    }
  }
}
