import { SandboxManager } from "./sandbox-manager.js";
import { OpenAIComputerStreamer } from "./streaming/openai.js";
import { ResolutionScaler } from "./streaming/resolution.js";
import { SSEEventType } from "./types/api.js";

export interface NaturalLanguageActionRequest {
  sandboxId: string;
  instruction: string;
  messages?: Array<{ role: "user" | "assistant"; content: string }>;
  resolution?: [number, number];
}

export interface NaturalLanguageActionResult {
  success: boolean;
  message: string;
  reasoning?: string[];
  actions?: any[];
  finalScreenshot?: {
    base64: string;
    format: string;
    width: number;
    height: number;
  };
  timestamp: string;
}

export class NaturalLanguageComputerTools {
  constructor(private sandboxManager: SandboxManager) {}

  async executeNaturalLanguageAction(
    request: NaturalLanguageActionRequest
  ): Promise<NaturalLanguageActionResult> {
    const { sandboxId, instruction, messages = [], resolution = [1920, 1080] } = request;
    
    const sandbox = this.sandboxManager.getSandbox(sandboxId);
    if (!sandbox) {
      return {
        success: false,
        message: `Sandbox ${sandboxId} not found. Please create a sandbox first.`,
        timestamp: new Date().toISOString(),
      };
    }

    try {
      console.error(`Executing natural language action on sandbox ${sandboxId}: "${instruction}"`);

      // Create resolution scaler
      const resolutionScaler = new ResolutionScaler(sandbox, resolution);

      // Create OpenAI computer streamer
      const streamer = new OpenAIComputerStreamer(sandbox, resolutionScaler);

      // Build messages array with the current instruction
      const allMessages = [
        ...messages,
        { role: "user" as const, content: instruction }
      ];

      // Take initial screenshot to include in the first message
      const initialScreenshot = await resolutionScaler.takeScreenshot();
      const initialScreenshotBase64 = Buffer.from(initialScreenshot).toString("base64");

      // Add screenshot to the user message (this is how OpenAI computer use expects it)
      const messagesWithScreenshot = [
        ...messages,
        {
          role: "user" as const,
          content: [
            {
              type: "text",
              text: instruction
            },
            {
              type: "image_url",
              image_url: {
                url: `data:image/png;base64,${initialScreenshotBase64}`
              }
            }
          ]
        }
      ];

      // Create abort controller for streaming
      const abortController = new AbortController();
      
      // Set timeout for the operation (5 minutes)
      const timeout = setTimeout(() => {
        abortController.abort();
      }, 5 * 60 * 1000);

      try {
        // Collect results from streaming
        const reasoning: string[] = [];
        const actions: any[] = [];
        let finalScreenshot: NaturalLanguageActionResult["finalScreenshot"] | undefined;

        // Process the streaming response
        for await (const event of streamer.stream({
          messages: messagesWithScreenshot as any,
          signal: abortController.signal,
        })) {
          switch (event.type) {
            case SSEEventType.REASONING:
              if (event.content) {
                reasoning.push(event.content);
              }
              break;
            
            case SSEEventType.ACTION:
              if (event.action) {
                actions.push(event.action);
              }
              break;
            
            case SSEEventType.DONE:
              console.error("Natural language action completed");
              break;
            
            case SSEEventType.ERROR:
              throw new Error(`AI service error: ${event.content}`);
          }
        }

        // Take final screenshot
        try {
          const finalScreenshotData = await resolutionScaler.takeScreenshot();
          const metadata = await import("sharp").then(sharp => sharp.default(finalScreenshotData).metadata());
          
          finalScreenshot = {
            base64: Buffer.from(finalScreenshotData).toString("base64"),
            format: "png",
            width: metadata.width || 0,
            height: metadata.height || 0,
          };
        } catch (screenshotError) {
          console.error("Failed to take final screenshot:", screenshotError);
        }

        return {
          success: true,
          message: `Successfully executed natural language instruction: "${instruction}"`,
          reasoning,
          actions,
          finalScreenshot,
          timestamp: new Date().toISOString(),
        };

      } finally {
        clearTimeout(timeout);
      }

    } catch (error) {
      console.error(`Failed to execute natural language action:`, error);
      return {
        success: false,
        message: error instanceof Error ? error.message : "Unknown error occurred",
        timestamp: new Date().toISOString(),
      };
    }
  }

  // Helper method to validate OpenAI API key
  validateOpenAIApiKey(): boolean {
    return !!process.env.OPENAI_API_KEY;
  }

  // Helper method to get usage information
  getUsageInfo(): {
    hasOpenAIKey: boolean;
    supportedModels: string[];
    recommendations: string[];
  } {
    return {
      hasOpenAIKey: this.validateOpenAIApiKey(),
      supportedModels: ["computer-use-preview"],
      recommendations: [
        "Ensure OPENAI_API_KEY environment variable is set",
        "Use clear, specific instructions for better results",
        "Break complex tasks into smaller steps",
        "The AI can see the screen and perform mouse/keyboard actions",
      ],
    };
  }
} 