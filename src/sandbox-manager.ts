import { Sandbox } from "@e2b/desktop";

export interface SandboxInstance {
  id: string;
  sandbox: Sandbox;
  streamUrl: string;
  createdAt: Date;
  resolution: [number, number];
}

export interface CreateSandboxResult {
  sandboxId: string;
  streamUrl: string;
  resolution: [number, number];
  status: "created" | "error";
  message?: string;
}

export class SandboxManager {
  private activeSandboxes = new Map<string, SandboxInstance>();
  private readonly DEFAULT_TIMEOUT = 300000; // 5 minutes
  private readonly DEFAULT_RESOLUTION: [number, number] = [1024, 768];
  private e2bApiKey: string | null;

  constructor(e2bApiKey: string | null = null) {
    this.e2bApiKey = e2bApiKey;
    
    // Setup cleanup interval for expired sandboxes
    setInterval(() => {
      this.cleanupExpiredSandboxes();
    }, 60000); // Check every minute
  }

  async createSandbox(
    resolution?: [number, number],
    timeout?: number
  ): Promise<CreateSandboxResult> {
    try {
      const finalResolution = resolution || this.DEFAULT_RESOLUTION;
      const finalTimeout = timeout || this.DEFAULT_TIMEOUT;

      console.error(`Creating E2B sandbox with resolution ${finalResolution[0]}x${finalResolution[1]}`);

      // Set the API key for this sandbox creation
      if (this.e2bApiKey) {
        process.env.E2B_API_KEY = this.e2bApiKey;
      }

      if (!process.env.E2B_API_KEY) {
        throw new Error("E2B API key not found. Please provide it as a constructor parameter or set E2B_API_KEY environment variable.");
      }

      const sandbox = await Sandbox.create({
        resolution: finalResolution,
        dpi: 96,
        timeoutMs: finalTimeout,
      });

      await sandbox.stream.start();
      const streamUrl = sandbox.stream.getUrl();

      const instance: SandboxInstance = {
        id: sandbox.sandboxId,
        sandbox,
        streamUrl,
        createdAt: new Date(),
        resolution: finalResolution,
      };

      this.activeSandboxes.set(sandbox.sandboxId, instance);

      console.error(`Sandbox created successfully: ${sandbox.sandboxId}`);
      console.error(`Stream URL: ${streamUrl}`);

      return {
        sandboxId: sandbox.sandboxId,
        streamUrl,
        resolution: finalResolution,
        status: "created",
        message: "Sandbox created successfully",
      };
    } catch (error) {
      console.error("Failed to create sandbox:", error);
      return {
        sandboxId: "",
        streamUrl: "",
        resolution: this.DEFAULT_RESOLUTION,
        status: "error",
        message: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  async connectToSandbox(sandboxId: string): Promise<Sandbox | null> {
    try {
      // Check if we already have this sandbox
      const existing = this.activeSandboxes.get(sandboxId);
      if (existing) {
        return existing.sandbox;
      }

      // Set the API key for this connection
      if (this.e2bApiKey) {
        process.env.E2B_API_KEY = this.e2bApiKey;
      }

      // Try to connect to existing sandbox
      const sandbox = await Sandbox.connect(sandboxId);
      
      // We don't have the stream URL for reconnected sandboxes
      // This is a limitation - ideally E2B would provide a way to get existing stream URLs
      const instance: SandboxInstance = {
        id: sandboxId,
        sandbox,
        streamUrl: "", // Unknown for reconnected sandboxes
        createdAt: new Date(),
        resolution: this.DEFAULT_RESOLUTION, // Unknown for reconnected sandboxes
      };

      this.activeSandboxes.set(sandboxId, instance);
      return sandbox;
    } catch (error) {
      console.error(`Failed to connect to sandbox ${sandboxId}:`, error);
      return null;
    }
  }

  async getStreamUrl(sandboxId: string): Promise<string | null> {
    const instance = this.activeSandboxes.get(sandboxId);
    if (instance) {
      return instance.streamUrl;
    }

    // Try to connect and get stream URL
    const sandbox = await this.connectToSandbox(sandboxId);
    if (sandbox) {
      try {
        await sandbox.stream.start();
        const streamUrl = sandbox.stream.getUrl();
        
        // Update the instance with the stream URL
        const existingInstance = this.activeSandboxes.get(sandboxId);
        if (existingInstance) {
          existingInstance.streamUrl = streamUrl;
        }
        
        return streamUrl;
      } catch (error) {
        console.error(`Failed to get stream URL for ${sandboxId}:`, error);
        return null;
      }
    }

    return null;
  }

  getSandbox(sandboxId: string): Sandbox | null {
    const instance = this.activeSandboxes.get(sandboxId);
    return instance ? instance.sandbox : null;
  }

  async cleanupSandbox(sandboxId: string): Promise<boolean> {
    try {
      const instance = this.activeSandboxes.get(sandboxId);
      if (instance) {
        await instance.sandbox.kill();
        this.activeSandboxes.delete(sandboxId);
        console.error(`Sandbox ${sandboxId} cleaned up successfully`);
        return true;
      }

      // Try to connect and kill if not in our registry
      try {
        // Set the API key for this connection
        if (this.e2bApiKey) {
          process.env.E2B_API_KEY = this.e2bApiKey;
        }
        
        const sandbox = await Sandbox.connect(sandboxId);
        await sandbox.kill();
        console.error(`External sandbox ${sandboxId} cleaned up successfully`);
        return true;
      } catch (connectError) {
        console.error(`Sandbox ${sandboxId} not found or already cleaned up`);
        return false;
      }
    } catch (error) {
      console.error(`Failed to cleanup sandbox ${sandboxId}:`, error);
      return false;
    }
  }

  async listSandboxes(): Promise<{
    active: Array<{
      sandboxId: string;
      streamUrl: string;
      resolution: [number, number];
      createdAt: string;
      uptimeMs: number;
    }>;
    count: number;
  }> {
    const now = new Date();
    const active = Array.from(this.activeSandboxes.values()).map((instance) => ({
      sandboxId: instance.id,
      streamUrl: instance.streamUrl,
      resolution: instance.resolution,
      createdAt: instance.createdAt.toISOString(),
      uptimeMs: now.getTime() - instance.createdAt.getTime(),
    }));

    return {
      active,
      count: active.length,
    };
  }

  private async cleanupExpiredSandboxes(): Promise<void> {
    const now = new Date();
    const expiredThreshold = 10 * 60 * 1000; // 10 minutes

    for (const [sandboxId, instance] of this.activeSandboxes.entries()) {
      const uptime = now.getTime() - instance.createdAt.getTime();
      if (uptime > expiredThreshold) {
        console.error(`Cleaning up expired sandbox: ${sandboxId}`);
        await this.cleanupSandbox(sandboxId);
      }
    }
  }

  // Graceful shutdown
  async shutdown(): Promise<void> {
    console.error("Shutting down sandbox manager...");
    const cleanupPromises = Array.from(this.activeSandboxes.keys()).map((sandboxId) =>
      this.cleanupSandbox(sandboxId)
    );
    await Promise.allSettled(cleanupPromises);
    console.error("All sandboxes cleaned up");
  }
} 