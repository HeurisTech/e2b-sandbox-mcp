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
  // Human intervention fields
  requiresHumanIntervention?: boolean;
  reason?: string;
  instructions?: string;
  error?: string;
}

export class NaturalLanguageComputerTools {
  constructor(private sandboxManager: SandboxManager) {}

  private needsHumanIntervention(instruction: string, error?: any): { needed: boolean; reason?: string; instructions?: string } {
    const lowerInstruction = instruction.toLowerCase();
    
    // Check for tasks that require human judgment
    const sensitiveOperations = [
      'delete important files',
      'format drive',
      'rm -rf',
      'sudo rm',
      'install software',
      'download and install',
      'enter password',
      'enter credit card',
      'make payment',
      'send email',
      'post on social media',
      'sign document',
      'approve transaction'
    ];

    const requiresHumanJudgment = [
      'decide',
      'choose between',
      'what should i',
      'recommend',
      'is this safe',
      'should i trust',
      'personal opinion',
      'private information'
    ];

    // reCAPTCHA and verification challenge patterns that require human intervention
    const verificationChallenges = [
      'captcha',
      'recaptcha',
      'prove you are human',
      'verify you are not a robot',
      'i\'m not a robot',
      'unusual traffic',
      'verify your identity',
      'complete the verification',
      'human verification',
      'security challenge',
      'click to verify',
      'solve the puzzle',
      'verify to continue',
      'complete captcha',
      'click the checkbox',
      'select all images',
      'click until none remain',
      'verify that you are human',
      'security check'
    ];

    // Check for sensitive operations
    for (const operation of sensitiveOperations) {
      if (lowerInstruction.includes(operation)) {
        return {
          needed: true,
          reason: 'Sensitive Operation Detected',
          instructions: `The requested action "${instruction}" involves a sensitive operation that requires human oversight. Please:
1. Review the request carefully
2. Consider the security implications
3. If safe, perform the action manually
4. If unsafe, do not proceed and consider alternative approaches`
        };
      }
    }

    // Check for tasks requiring human judgment
    for (const judgment of requiresHumanJudgment) {
      if (lowerInstruction.includes(judgment)) {
        return {
          needed: true,
          reason: 'Human Judgment Required',
          instructions: `The requested action "${instruction}" requires human judgment or decision-making. Please:
1. Review the context and options
2. Make an informed decision based on your expertise
3. Proceed with the chosen action manually`
        };
      }
    }

    // Check for verification challenges (reCAPTCHA, etc.)
    for (const challenge of verificationChallenges) {
      if (lowerInstruction.includes(challenge)) {
        return {
          needed: true,
          reason: 'Human Verification Required',
          instructions: `The action involves a verification challenge (reCAPTCHA/security check): "${challenge}". These are specifically designed to prevent automated interactions. Please:
1. Navigate to the page manually
2. Complete the verification challenge (click "I'm not a robot", solve image puzzles, etc.)
3. Continue with your intended action after verification is complete
4. Note: Automated systems cannot reliably complete these challenges`
        };
      }
    }

    // Check for specific error conditions
    if (error) {
      const errorMessage = error.message || error.toString();
      
      // Permission denied errors
      if (errorMessage.includes('permission denied') || errorMessage.includes('access denied')) {
        return {
          needed: true,
          reason: 'Permission Denied',
          instructions: `Permission was denied for the requested action. Please:
1. Check if you have the necessary permissions
2. Run with elevated privileges if needed (sudo, admin rights)
3. Verify file/folder ownership and permissions
4. Consider if this action requires manual authentication`
        };
      }

      // Authentication required
      if (errorMessage.includes('authentication') || errorMessage.includes('login required')) {
        return {
          needed: true,
          reason: 'Authentication Required',
          instructions: `The action requires authentication. Please:
1. Log in to the required service/application manually
2. Enter any required credentials
3. Complete any two-factor authentication if needed
4. Then retry the original action`
        };
      }

      // Network/connectivity issues
      if (errorMessage.includes('network') || errorMessage.includes('connection') || errorMessage.includes('timeout')) {
        return {
          needed: true,
          reason: 'Network/Connectivity Issue',
          instructions: `There appears to be a network or connectivity issue. Please:
1. Check your internet connection
2. Verify the target service is accessible
3. Check for firewall or proxy restrictions
4. Wait a moment and retry if it's a temporary issue`
        };
      }

      // Captcha or human verification
      if (errorMessage.includes('captcha') || errorMessage.includes('human verification')) {
        return {
          needed: true,
          reason: 'Human Verification Required',
          instructions: `The action requires human verification (CAPTCHA, etc.). Please:
1. Navigate to the page manually
2. Complete the human verification challenge
3. Continue with the intended action`
        };
      }
    }

    // Check for ambiguous instructions
    const ambiguousTerms = ['something', 'anything', 'whatever', 'some stuff', 'things'];
    for (const term of ambiguousTerms) {
      if (lowerInstruction.includes(term)) {
        return {
          needed: true,
          reason: 'Ambiguous Instructions',
          instructions: `The instruction "${instruction}" is too ambiguous for automated execution. Please:
1. Provide more specific details about what you want to accomplish
2. Specify exact steps or targets
3. Clarify any uncertain aspects of the task`
        };
      }
    }

    return { needed: false };
  }

  private needsHumanInterventionFromReasoning(reasoning: string): { needed: boolean; reason?: string; instructions?: string } {
    const lowerReasoning = reasoning.toLowerCase();
    
    // Check if AI reasoning mentions verification challenges
    const verificationMentions = [
      'captcha',
      'recaptcha',
      'verify that you are human',
      'prove you are not a robot',
      'i need to verify',
      'verification required',
      'security challenge',
      'unusual traffic',
      'blocked by security',
      'cannot proceed without verification',
      'human verification needed',
      'click i\'m not a robot',
      'complete the verification',
      'solve the captcha',
      'access denied',
      'verification step',
      'human intervention',
      'manual verification'
    ];

    for (const mention of verificationMentions) {
      if (lowerReasoning.includes(mention)) {
        return {
          needed: true,
          reason: 'AI Detected Verification Challenge',
          instructions: `The AI has detected a verification challenge that requires human intervention. Based on the AI's analysis: "${reasoning.substring(0, 200)}..."
          
Please:
1. Review the current screen state
2. Complete any verification challenges (reCAPTCHA, etc.) manually
3. Continue with your intended action after verification
4. These challenges are specifically designed to prevent automated interactions`
        };
      }
    }

    // Check for other scenarios that AI might mention needing help with
    const helpNeededMentions = [
      'cannot complete',
      'unable to proceed',
      'requires manual',
      'need human help',
      'cannot handle',
      'permission denied',
      'access restricted',
      'authentication required',
      'login needed'
    ];

    for (const mention of helpNeededMentions) {
      if (lowerReasoning.includes(mention)) {
        return {
          needed: true,
          reason: 'AI Cannot Complete Action',
          instructions: `The AI has indicated it cannot complete the action. Based on the AI's analysis: "${reasoning.substring(0, 200)}..."
          
Please review the current state and take manual action as needed.`
        };
      }
    }

    return { needed: false };
  }

  async executeNaturalLanguageAction(
    request: NaturalLanguageActionRequest
  ): Promise<NaturalLanguageActionResult> {
    try {
      // Check for situations requiring human intervention before proceeding
      const interventionCheck = this.needsHumanIntervention(request.instruction);
      if (interventionCheck.needed) {
        return {
          success: false,
          requiresHumanIntervention: true,
          reason: interventionCheck.reason,
          instructions: interventionCheck.instructions,
          message: `Human intervention required: ${interventionCheck.reason}`,
          timestamp: new Date().toISOString()
        };
      }

      const { sandboxId, instruction, messages = [], resolution = [1920, 1080] } = request;
    
      const sandbox = this.sandboxManager.getSandbox(sandboxId);
      if (!sandbox) {
        return {
          success: false,
          message: `Sandbox ${sandboxId} not found. Please create a sandbox first.`,
          timestamp: new Date().toISOString(),
        };
      }

      console.error(`Executing natural language action on sandbox ${sandboxId}: "${instruction}"`);

      // Create resolution scaler
      const resolutionScaler = new ResolutionScaler(sandbox, resolution);

      // Create OpenAI computer streamer
      const streamer = new OpenAIComputerStreamer(sandbox, resolutionScaler);

      // Build simple messages array - OpenAI computer use API handles screenshots automatically
      const allMessages = [
        ...messages,
        { role: "user" as const, content: instruction }
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
          messages: allMessages,
          signal: abortController.signal,
        })) {
          switch (event.type) {
            case SSEEventType.REASONING:
              if (event.content) {
                reasoning.push(event.content);
                
                // Check if the AI's reasoning indicates human intervention is needed
                const reasoningInterventionCheck = this.needsHumanInterventionFromReasoning(event.content);
                if (reasoningInterventionCheck.needed) {
                  clearTimeout(timeout);
                  return {
                    success: false,
                    requiresHumanIntervention: true,
                    reason: reasoningInterventionCheck.reason,
                    instructions: reasoningInterventionCheck.instructions,
                    message: `Human intervention required: ${reasoningInterventionCheck.reason}`,
                    reasoning,
                    actions,
                    timestamp: new Date().toISOString()
                  };
                }
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
              // Check if this error requires human intervention
              const errorInterventionCheck = this.needsHumanIntervention(instruction, new Error(event.content));
              if (errorInterventionCheck.needed) {
                return {
                  success: false,
                  requiresHumanIntervention: true,
                  reason: errorInterventionCheck.reason,
                  instructions: errorInterventionCheck.instructions,
                  message: `Human intervention required due to error: ${errorInterventionCheck.reason}`,
                  error: event.content,
                  timestamp: new Date().toISOString()
                };
              }
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

    } catch (error: any) {
      // Final check for human intervention on any caught errors
      const errorInterventionCheck = this.needsHumanIntervention(request.instruction, error);
      if (errorInterventionCheck.needed) {
        return {
          success: false,
          requiresHumanIntervention: true,
          reason: errorInterventionCheck.reason,
          instructions: errorInterventionCheck.instructions,
          message: `Human intervention required due to error: ${errorInterventionCheck.reason}`,
          error: error.message,
          timestamp: new Date().toISOString()
        };
      }

      console.error(`Failed to execute natural language action:`, error);
      
      // Provide more detailed error information
      let errorMessage = "Unknown error occurred";
      if (error instanceof Error) {
        errorMessage = error.message;
        if (error.stack) {
          console.error("Full error stack:", error.stack);
        }
      }
      
      return {
        success: false,
        message: `Natural language action failed: ${errorMessage}`,
        timestamp: new Date().toISOString(),
      };
    }
  }

  // Helper method to validate OpenAI API key
  validateOpenAIApiKey(): boolean {
    return !!(process.env.OPEN_AI_API_KEY || process.env.OPENAI_API_KEY);
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
        "Ensure OPEN_AI_API_KEY environment variable is set",
        "Use clear, specific instructions for better results",
        "Break complex tasks into smaller steps",
        "The AI can see the screen and perform mouse/keyboard actions",
      ],
    };
  }
} 