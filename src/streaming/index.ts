import { Sandbox } from "@e2b/desktop";

export function formatSSE(event: any): string {
  return `data: ${JSON.stringify(event)}\n\n`;
}

export interface ComputerInteractionStreamerFacadeStreamProps {
  signal: AbortSignal;
  messages: { role: "user" | "assistant"; content: string }[];
}

export abstract class ComputerInteractionStreamerFacade {
  abstract instructions: string;
  abstract desktop: Sandbox;
  abstract resolutionScaler: any;

  abstract stream(
    props: ComputerInteractionStreamerFacadeStreamProps
  ): AsyncGenerator<any>;

  abstract executeAction(action: unknown): Promise<any>;
}

export function createStreamingResponse(
  generator: AsyncGenerator<any>
): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      try {
        for await (const event of generator) {
          const data = formatSSE(event);
          controller.enqueue(encoder.encode(data));
        }
      } catch (error) {
        console.error("Streaming error:", error);
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
} 