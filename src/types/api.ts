/**
 * Type definitions for Computer API and SSE events
 */

/**
 * Model types supported
 */
export type ComputerModel = "openai" | "anthropic";

/**
 * SSE event types for client communication
 */
export enum SSEEventType {
  UPDATE = "update",
  ACTION = "action",
  REASONING = "reasoning",
  DONE = "done",
  ERROR = "error",
  SANDBOX_CREATED = "sandbox_created",
  ACTION_COMPLETED = "action_completed",
}

/**
 * Base interface for all SSE events
 */
export interface BaseSSEEvent {
  type: SSEEventType;
}

/**
 * Action event with details about computer action being performed
 */
export interface ActionEvent<T extends ComputerModel> extends BaseSSEEvent {
  type: SSEEventType.ACTION;
  action: any; // Will be specific to the model
}

/**
 * Reasoning event with AI's explanation for an action
 */
export interface ReasoningEvent extends BaseSSEEvent {
  type: SSEEventType.REASONING;
  content: string;
}

/**
 * Done event indicating completion
 */
export interface DoneEvent extends BaseSSEEvent {
  type: SSEEventType.DONE;
  content?: string;
}

/**
 * Error event with error details
 */
export interface ErrorEvent extends BaseSSEEvent {
  type: SSEEventType.ERROR;
  content: string;
}

/**
 * Sandbox created event with sandbox details
 */
export interface SandboxCreatedEvent extends BaseSSEEvent {
  type: SSEEventType.SANDBOX_CREATED;
  sandboxId: string;
  vncUrl: string;
}

/**
 * Action completed event
 */
export interface ActionCompletedEvent extends BaseSSEEvent {
  type: SSEEventType.ACTION_COMPLETED;
}

/**
 * Union type of all possible SSE events
 */
export type SSEEvent<T extends ComputerModel = ComputerModel> =
  | ActionEvent<T>
  | ReasoningEvent
  | DoneEvent
  | ErrorEvent
  | SandboxCreatedEvent
  | ActionCompletedEvent;

/**
 * Response from action execution
 */
export type ActionResponse = {
  action: string;
  data: {
    type: "computer_screenshot";
    image_url: string;
  };
};

/**
 * Helper function to sleep for a specified duration
 */
export async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
} 