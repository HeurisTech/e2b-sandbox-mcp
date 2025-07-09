import { SandboxManager } from "./sandbox-manager.js";
import sharp from "sharp";

export interface ComputerAction {
  type: "click" | "double_click" | "type" | "keypress" | "move" | "scroll" | "drag" | "screenshot";
  x?: number;
  y?: number;
  text?: string;
  keys?: string;
  button?: "left" | "right" | "middle";
  scroll_x?: number;
  scroll_y?: number;
  path?: Array<{ x: number; y: number }>;
}

export interface ActionResult {
  success: boolean;
  message: string;
  screenshot?: {
    base64: string;
    format: string;
    width: number;
    height: number;
  };
  action: ComputerAction;
  timestamp: string;
}

export interface ScreenshotResult {
  base64: string;
  format: string;
  width: number;
  height: number;
  timestamp: string;
}

export class ComputerUseTools {
  constructor(private sandboxManager: SandboxManager) {}

  async executeAction(sandboxId: string, action: ComputerAction): Promise<ActionResult> {
    const sandbox = this.sandboxManager.getSandbox(sandboxId);
    if (!sandbox) {
      return {
        success: false,
        message: `Sandbox ${sandboxId} not found. Please create a sandbox first.`,
        action,
        timestamp: new Date().toISOString(),
      };
    }

    try {
      console.error(`Executing ${action.type} action on sandbox ${sandboxId}`);

      switch (action.type) {
        case "click":
          await this.executeClick(sandbox, action);
          break;

        case "double_click":
          await this.executeDoubleClick(sandbox, action);
          break;

        case "type":
          await this.executeType(sandbox, action);
          break;

        case "keypress":
          await this.executeKeypress(sandbox, action);
          break;

        case "move":
          await this.executeMove(sandbox, action);
          break;

        case "scroll":
          await this.executeScroll(sandbox, action);
          break;

        case "drag":
          await this.executeDrag(sandbox, action);
          break;

        case "screenshot":
          // Screenshot is handled separately
          break;

        default:
          throw new Error(`Unknown action type: ${(action as any).type}`);
      }

      // Take a screenshot after the action (except for screenshot action itself)
      let screenshot: ActionResult["screenshot"] | undefined;
      if (action.type !== "screenshot") {
        try {
          const screenshotResult = await this.takeScreenshot(sandboxId);
          screenshot = screenshotResult;
        } catch (screenshotError) {
          console.error("Failed to take post-action screenshot:", screenshotError);
        }
      }

      return {
        success: true,
        message: `Successfully executed ${action.type} action`,
        screenshot,
        action,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      console.error(`Failed to execute ${action.type} action:`, error);
      return {
        success: false,
        message: error instanceof Error ? error.message : "Unknown error",
        action,
        timestamp: new Date().toISOString(),
      };
    }
  }

  private async executeClick(sandbox: any, action: ComputerAction): Promise<void> {
    if (action.x === undefined || action.y === undefined) {
      throw new Error("Click action requires x and y coordinates");
    }

    const button = action.button || "left";
    switch (button) {
      case "left":
        await sandbox.leftClick(action.x, action.y);
        break;
      case "right":
        await sandbox.rightClick(action.x, action.y);
        break;
      case "middle":
        await sandbox.middleClick(action.x, action.y);
        break;
      default:
        throw new Error(`Unknown button: ${button}`);
    }
  }

  private async executeDoubleClick(sandbox: any, action: ComputerAction): Promise<void> {
    if (action.x === undefined || action.y === undefined) {
      throw new Error("Double click action requires x and y coordinates");
    }
    await sandbox.doubleClick(action.x, action.y);
  }

  private async executeType(sandbox: any, action: ComputerAction): Promise<void> {
    if (!action.text) {
      throw new Error("Type action requires text");
    }
    await sandbox.write(action.text);
  }

  private async executeKeypress(sandbox: any, action: ComputerAction): Promise<void> {
    if (!action.keys) {
      throw new Error("Keypress action requires keys");
    }
    await sandbox.press(action.keys);
  }

  private async executeMove(sandbox: any, action: ComputerAction): Promise<void> {
    if (action.x === undefined || action.y === undefined) {
      throw new Error("Move action requires x and y coordinates");
    }
    await sandbox.moveMouse(action.x, action.y);
  }

  private async executeScroll(sandbox: any, action: ComputerAction): Promise<void> {
    const scrollY = action.scroll_y || 0;
    
    if (scrollY < 0) {
      await sandbox.scroll("up", Math.abs(scrollY));
    } else if (scrollY > 0) {
      await sandbox.scroll("down", scrollY);
    }

    // Note: E2B desktop doesn't seem to support horizontal scrolling directly
    // If scroll_x is needed, you might need to use keyboard shortcuts or other methods
  }

  private async executeDrag(sandbox: any, action: ComputerAction): Promise<void> {
    if (!action.path || action.path.length < 2) {
      throw new Error("Drag action requires a path with at least 2 points");
    }

    const startPoint = action.path[0];
    const endPoint = action.path[action.path.length - 1];

    await sandbox.drag(
      [startPoint.x, startPoint.y],
      [endPoint.x, endPoint.y]
    );
  }

  async takeScreenshot(sandboxId: string): Promise<ScreenshotResult> {
    const sandbox = this.sandboxManager.getSandbox(sandboxId);
    if (!sandbox) {
      throw new Error(`Sandbox ${sandboxId} not found`);
    }

    try {
      console.error(`Taking screenshot of sandbox ${sandboxId}`);
      
      // Take screenshot using E2B's screenshot method
      const screenshotBuffer = await sandbox.screenshot();
      
      // Ensure we have a Buffer object
      let buffer: Buffer;
      if (Buffer.isBuffer(screenshotBuffer)) {
        buffer = screenshotBuffer;
      } else if (typeof screenshotBuffer === 'string') {
        // If it's already a base64 string, decode it first to get metadata
        buffer = Buffer.from(screenshotBuffer, 'base64');
      } else {
        // If it's a Uint8Array or similar, convert to Buffer
        buffer = Buffer.from(screenshotBuffer);
      }
      
      // Get image metadata
      const metadata = await sharp(buffer).metadata();
      const width = metadata.width || 0;
      const height = metadata.height || 0;

      // Convert to base64
      const base64 = buffer.toString("base64");

      return {
        base64,
        format: "png",
        width,
        height,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      console.error(`Failed to take screenshot of sandbox ${sandboxId}:`, error);
      throw error;
    }
  }

  // Helper method to validate coordinates
  private validateCoordinates(x?: number, y?: number): void {
    if (x !== undefined && (x < 0 || !Number.isInteger(x))) {
      throw new Error("X coordinate must be a non-negative integer");
    }
    if (y !== undefined && (y < 0 || !Number.isInteger(y))) {
      throw new Error("Y coordinate must be a non-negative integer");
    }
  }

  // Helper method to get sandbox dimensions (if available)
  async getSandboxDimensions(sandboxId: string): Promise<{ width: number; height: number } | null> {
    try {
      const screenshot = await this.takeScreenshot(sandboxId);
      return {
        width: screenshot.width,
        height: screenshot.height,
      };
    } catch (error) {
      console.error("Failed to get sandbox dimensions:", error);
      return null;
    }
  }
} 