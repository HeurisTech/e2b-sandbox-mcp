import { Sandbox } from "@e2b/desktop";
import OpenAI from "openai";
import { SSEEventType, SSEEvent } from "../types/api.js";
import {
  ComputerInteractionStreamerFacade,
  ComputerInteractionStreamerFacadeStreamProps,
} from "./index.js";
import { ActionResponse } from "../types/api.js";
import { ResolutionScaler } from "./resolution.js";

const INSTRUCTIONS = `
You are an AI assistant that can use a computer to help the user with their tasks.
You can use the computer to search the web, write code, edit files, and more.

You are operating in a secure, isolated sandbox micro VM based on Ubuntu 22.04, so you can execute most commands and operations without worrying about security concerns.

The sandbox comes with many pre-installed applications including:
- Firefox browser
- Visual Studio Code
- LibreOffice suite
- Python 3 with common libraries
- Terminal with standard Linux utilities
- File manager (PCManFM)
- Text editor (Gedit)
- Calculator and other basic utilities

IMPORTANT: When typing commands in the terminal, ALWAYS send a KEYPRESS ENTER action immediately after typing the command to execute it. Terminal commands will not run until you press Enter.

IMPORTANT: When editing files, prefer to use Visual Studio Code (VS Code) as it provides a better editing experience.
`;

export class OpenAIComputerStreamer implements ComputerInteractionStreamerFacade {
  public instructions: string;
  public desktop: Sandbox;
  public resolutionScaler: ResolutionScaler;

  private openai: OpenAI;

  constructor(desktop: Sandbox, resolutionScaler: ResolutionScaler) {
    this.desktop = desktop;
    this.resolutionScaler = resolutionScaler;
    this.openai = new OpenAI();
    this.instructions = INSTRUCTIONS;
  }

  async executeAction(action: any): Promise<ActionResponse | void> {
    const desktop = this.desktop;

    switch (action.type) {
      case "screenshot": {
        break;
      }
      case "double_click": {
        const coordinate = this.resolutionScaler.scaleToOriginalSpace([
          action.x,
          action.y,
        ]);
        await desktop.doubleClick(coordinate[0], coordinate[1]);
        break;
      }
      case "click": {
        const coordinate = this.resolutionScaler.scaleToOriginalSpace([
          action.x,
          action.y,
        ]);

        if (action.button === "left") {
          await desktop.leftClick(coordinate[0], coordinate[1]);
        } else if (action.button === "right") {
          await desktop.rightClick(coordinate[0], coordinate[1]);
        } else if (action.button === "wheel") {
          await desktop.middleClick(coordinate[0], coordinate[1]);
        }
        break;
      }
      case "type": {
        await desktop.write(action.text);
        break;
      }
      case "keypress": {
        await desktop.press(action.keys);
        break;
      }
      case "move": {
        const coordinate = this.resolutionScaler.scaleToOriginalSpace([
          action.x,
          action.y,
        ]);
        await desktop.moveMouse(coordinate[0], coordinate[1]);
        break;
      }
      case "scroll": {
        if (action.scroll_y < 0) {
          await desktop.scroll("up", Math.abs(action.scroll_y));
        } else if (action.scroll_y > 0) {
          await desktop.scroll("down", action.scroll_y);
        }
        break;
      }
      case "wait": {
        break;
      }
      case "drag": {
        const startCoordinate = this.resolutionScaler.scaleToOriginalSpace([
          action.path[0].x,
          action.path[0].y,
        ]);

        const endCoordinate = this.resolutionScaler.scaleToOriginalSpace([
          action.path[1].x,
          action.path[1].y,
        ]);

        await desktop.drag(startCoordinate, endCoordinate);
        break;
      }
      default: {
        console.error("Unknown action type:", action);
      }
    }
  }

  async *stream(
    props: ComputerInteractionStreamerFacadeStreamProps
  ): AsyncGenerator<SSEEvent<"openai">> {
    const { messages, signal } = props;

    try {
      const modelResolution = this.resolutionScaler.getScaledResolution();

      const computerTool: any = {
        type: "computer_use_preview",
        display_width: modelResolution[0],
        display_height: modelResolution[1],
        environment: "linux",
      };

      let response = await this.openai.responses.create({
        model: "computer-use-preview",
        tools: [computerTool],
        input: [...(messages as any)],
        truncation: "auto",
        instructions: this.instructions,
        reasoning: {
          effort: "medium",
          generate_summary: "concise",
        },
      });

      while (true) {
        if (signal.aborted) {
          yield {
            type: SSEEventType.DONE,
            content: "Generation stopped by user",
          };
          break;
        }

        const computerCalls = response.output.filter(
          (item: any) => item.type === "computer_call"
        );

        if (computerCalls.length === 0) {
          yield {
            type: SSEEventType.REASONING,
            content: response.output_text,
          };
          yield {
            type: SSEEventType.DONE,
          };
          break;
        }

        const computerCall = computerCalls[0] as any;
        const callId = computerCall.call_id;
        const action = computerCall.action;

        const reasoningItems = response.output.filter(
          (item: any) => item.type === "message" && "content" in item
        );

        if (reasoningItems.length > 0 && "content" in reasoningItems[0]) {
          const content = reasoningItems[0].content;

          yield {
            type: SSEEventType.REASONING,
            content:
              reasoningItems[0].content[0].type === "output_text"
                ? reasoningItems[0].content[0].text
                : JSON.stringify(reasoningItems[0].content),
          };
        }

        yield {
          type: SSEEventType.ACTION,
          action,
        };

        await this.executeAction(action);

        yield {
          type: SSEEventType.ACTION_COMPLETED,
        };

        const newScreenshotData = await this.resolutionScaler.takeScreenshot();
        const newScreenshotBase64 = Buffer.from(newScreenshotData).toString("base64");

        const computerCallOutput: any = {
          call_id: callId,
          type: "computer_call_output",
          output: {
            type: "input_image",
            image_url: `data:image/png;base64,${newScreenshotBase64}`,
          },
        };

        response = await this.openai.responses.create({
          model: "computer-use-preview",
          previous_response_id: response.id,
          instructions: this.instructions,
          tools: [computerTool],
          input: [computerCallOutput],
          truncation: "auto",
          reasoning: {
            effort: "medium",
            generate_summary: "concise",
          },
        });
      }
    } catch (error) {
      console.error("OPENAI_STREAMER", error);
      if (error instanceof OpenAI.APIError && error.status === 429) {
        yield {
          type: SSEEventType.ERROR,
          content: "API quota exceeded. Please try again later.",
        };
        yield {
          type: SSEEventType.DONE,
        };
        return;
      }
      yield {
        type: SSEEventType.ERROR,
        content: "An error occurred with the AI service. Please try again.",
      };
    }
  }
} 