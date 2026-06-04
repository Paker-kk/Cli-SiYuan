type ChildProcessModule = typeof import("child_process");
type OSModule = typeof import("os");

type DataCallback = (data: string) => void;
type ExitCallback = (code: number | null) => void;

let cpModule: ChildProcessModule | undefined;
let osModule: OSModule | undefined;

function ensureNodeModules(): boolean {
    if (cpModule && osModule) return true;
    if (typeof require !== "function") return false;
    try {
        require("child_process");
        require("os");
        cpModule = require("child_process");
        osModule = require("os");
        return true;
    } catch {
        return false;
    }
}

export class TerminalShell {
    private process: import("child_process").ChildProcess | null = null;
    private dataCallbacks: DataCallback[] = [];
    private exitCallbacks: ExitCallback[] = [];
    private platform: string = "win32";

    constructor() {
        if (!ensureNodeModules()) {
            throw new Error("TerminalShell requires Node.js runtime");
        }
        this.platform = osModule!.platform();
    }

    start(): void {
        if (this.process && !this.process.killed) {
            return;
        }

        let shellCmd: string;
        let shellArgs: string[];

        if (this.platform === "win32") {
            shellCmd = process.env.COMSPEC || "cmd.exe";
            shellArgs = [];
        } else {
            shellCmd = process.env.SHELL || "/bin/bash";
            shellArgs = ["--login"];
        }

        this.process = cpModule!.spawn(shellCmd, shellArgs, {
            stdio: ["pipe", "pipe", "pipe"],
            env: { ...process.env },
            windowsHide: true,
        });

        this.process.stdout?.on("data", (data: Buffer) => {
            this.emitData(data.toString("utf-8"));
        });

        this.process.stderr?.on("data", (data: Buffer) => {
            this.emitData(data.toString("utf-8"));
        });

        this.process.on("exit", (code) => {
            this.emitExit(code);
            this.process = null;
        });

        this.process.on("error", (err: Error) => {
            this.emitData(`\r\n\x1b[31mShell error: ${err.message}\x1b[0m\r\n`);
        });
    }

    write(data: string): void {
        if (!this.process?.stdin?.writable) return;
        if (this.platform === "win32") {
            data = data.replace(/\r(?!\n)/g, "\r\n");
        } else {
            data = data.replace(/\r/g, "\n");
        }
        this.process.stdin.write(data);
    }

    onData(callback: DataCallback): void {
        this.dataCallbacks.push(callback);
    }

    offData(callback: DataCallback): void {
        this.dataCallbacks = this.dataCallbacks.filter(cb => cb !== callback);
    }

    onExit(callback: ExitCallback): void {
        this.exitCallbacks.push(callback);
    }

    offExit(callback: ExitCallback): void {
        this.exitCallbacks = this.exitCallbacks.filter(cb => cb !== callback);
    }

    private emitData(data: string): void {
        for (const cb of this.dataCallbacks) {
            cb(data);
        }
    }

    private emitExit(code: number | null): void {
        for (const cb of this.exitCallbacks) {
            cb(code);
        }
    }

    isRunning(): boolean {
        return this.process !== null && !this.process.killed;
    }

    kill(): void {
        if (!this.process) return;
        if (this.platform === "win32") {
            try {
                cpModule!.execSync(`taskkill /PID ${this.process.pid} /T /F`, { stdio: "ignore" });
            } catch {
                this.process.kill();
            }
        } else {
            this.process.kill("SIGTERM");
        }
        this.process = null;
        this.dataCallbacks = [];
        this.exitCallbacks = [];
    }
}
