import { Sandbox } from '@e2b/code-interpreter';

export interface CodeSandboxInstance {
  id: string;
  sandbox: Sandbox;
  createdAt: Date;
  type: 'code';
}

export interface RunCodeResult {
  success: boolean;
  stdout?: string;
  stderr?: string;
  results?: any[];
  error?: string;
  executionTimeMs?: number;
}

export interface FileResult {
  success: boolean;
  content?: string;
  message?: string;
  path?: string;
}

export class CodeSandboxManager {
  private activeSandboxes = new Map<string, CodeSandboxInstance>();
  private readonly DEFAULT_TIMEOUT = 600000; // 10 minutes for ML work
  private e2bApiKey: string | null;

  constructor(e2bApiKey: string | null = null) {
    this.e2bApiKey = e2bApiKey;
  }

  private ensureApiKey() {
    if (this.e2bApiKey) {
      process.env.E2B_API_KEY = this.e2bApiKey;
    }
    if (!process.env.E2B_API_KEY) {
      throw new Error('E2B API key not found');
    }
  }

  async createCodeSandbox(timeoutMs?: number): Promise<{
    sandboxId: string;
    status: 'created' | 'error';
    message: string;
  }> {
    try {
      this.ensureApiKey();

      const sandbox = await Sandbox.create({
        timeoutMs: timeoutMs || this.DEFAULT_TIMEOUT,
      });

      const instance: CodeSandboxInstance = {
        id: sandbox.sandboxId,
        sandbox,
        createdAt: new Date(),
        type: 'code',
      };

      this.activeSandboxes.set(sandbox.sandboxId, instance);

      console.error(`Code sandbox created: ${sandbox.sandboxId}`);

      return {
        sandboxId: sandbox.sandboxId,
        status: 'created',
        message: 'Code sandbox created successfully',
      };
    } catch (error) {
      console.error('Failed to create code sandbox:', error);
      return {
        sandboxId: '',
        status: 'error',
        message: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  getSandbox(sandboxId: string): Sandbox | null {
    return this.activeSandboxes.get(sandboxId)?.sandbox || null;
  }

  async runCode(
    sandboxId: string,
    code: string,
    language: 'python' | 'javascript' | 'bash' = 'python'
  ): Promise<RunCodeResult> {
    const sandbox = this.getSandbox(sandboxId);
    if (!sandbox) {
      return {
        success: false,
        error: `Code sandbox ${sandboxId} not found. Create one with create_code_sandbox first.`,
      };
    }

    const start = Date.now();

    try {
      if (language === 'bash') {
        const result = await sandbox.commands.run(code);
        return {
          success: result.exitCode === 0,
          stdout: result.stdout,
          stderr: result.stderr,
          executionTimeMs: Date.now() - start,
        };
      }

      // Default: Python via code interpreter
      const execution = await sandbox.runCode(code);

      return {
        success: !execution.error,
        stdout: execution.logs?.stdout?.join('\n') || '',
        stderr: execution.logs?.stderr?.join('\n') || '',
        results: execution.results,
        error: execution.error
          ? `${execution.error.name}: ${execution.error.value}`
          : undefined,
        executionTimeMs: Date.now() - start,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        executionTimeMs: Date.now() - start,
      };
    }
  }

  async writeFile(
    sandboxId: string,
    path: string,
    content: string
  ): Promise<FileResult> {
    const sandbox = this.getSandbox(sandboxId);
    if (!sandbox) {
      return {
        success: false,
        message: `Code sandbox ${sandboxId} not found`,
      };
    }

    try {
      await sandbox.files.write(path, content);
      return {
        success: true,
        path,
        message: `File written: ${path}`,
      };
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : String(error),
      };
    }
  }

  async readFile(sandboxId: string, path: string): Promise<FileResult> {
    const sandbox = this.getSandbox(sandboxId);
    if (!sandbox) {
      return {
        success: false,
        message: `Code sandbox ${sandboxId} not found`,
      };
    }

    try {
      const content = await sandbox.files.read(path);
      return {
        success: true,
        path,
        content: typeof content === 'string' ? content : content.toString(),
      };
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : String(error),
      };
    }
  }

  async listFiles(
    sandboxId: string,
    path: string = '/home/user'
  ): Promise<{ success: boolean; files?: string[]; message?: string }> {
    const sandbox = this.getSandbox(sandboxId);
    if (!sandbox) {
      return {
        success: false,
        message: `Code sandbox ${sandboxId} not found`,
      };
    }

    try {
      const entries = await sandbox.files.list(path);
      return {
        success: true,
        files: entries.map((e: any) => `${e.type === 'dir' ? '[dir] ' : ''}${e.name}`),
      };
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : String(error),
      };
    }
  }

  async cleanup(sandboxId: string): Promise<boolean> {
    try {
      const instance = this.activeSandboxes.get(sandboxId);
      if (instance) {
        await instance.sandbox.kill();
        this.activeSandboxes.delete(sandboxId);
        return true;
      }
      return false;
    } catch (error) {
      console.error(`Failed to cleanup code sandbox ${sandboxId}:`, error);
      return false;
    }
  }

  list(): {
    active: Array<{ sandboxId: string; createdAt: string; type: string }>;
    count: number;
  } {
    const active = Array.from(this.activeSandboxes.values()).map((i) => ({
      sandboxId: i.id,
      createdAt: i.createdAt.toISOString(),
      type: i.type,
    }));
    return { active, count: active.length };
  }
}
