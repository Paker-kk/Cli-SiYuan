<script lang="ts">
    import { onMount } from 'svelte';
    import { Terminal } from 'xterm';
    import { FitAddon } from 'xterm-addon-fit';
    import 'xterm/css/xterm.css';
    import { TerminalShell } from './terminal-shell';

    export let onClose: (() => void) | undefined = undefined;

    let container: HTMLDivElement;
    let terminal: Terminal;
    let fitAddon: FitAddon;
    let shell: TerminalShell;
    let resizeObserver: ResizeObserver;

    onMount(() => {
        terminal = new Terminal({
            cursorBlink: true,
            fontSize: 14,
            fontFamily: 'Consolas, "Courier New", "Noto Color Emoji", monospace',
            theme: {
                background: '#1e1e1e',
                foreground: '#d4d4d4',
                cursor: '#d4d4d4',
                selectionBackground: '#264f78',
                black: '#000000',
                red: '#cd3131',
                green: '#0dbc79',
                yellow: '#e5e510',
                blue: '#2472c8',
                magenta: '#bc3fbc',
                cyan: '#11a8cd',
                white: '#e5e5e5',
                brightBlack: '#666666',
                brightRed: '#f14c4c',
                brightGreen: '#23d18b',
                brightYellow: '#f5f543',
                brightBlue: '#3b8eea',
                brightMagenta: '#d670d6',
                brightCyan: '#29b8db',
                brightWhite: '#e5e5e5',
            },
            allowProposedApi: true,
            windowsMode: true,
        });

        fitAddon = new FitAddon();
        terminal.loadAddon(fitAddon);
        terminal.open(container);

        setTimeout(() => {
            try { fitAddon.fit(); } catch { /* ignore */ }
        }, 50);

        resizeObserver = new ResizeObserver(() => {
            try {
                fitAddon.fit();
            } catch {
                // ignore resize errors during shutdown
            }
        });
        resizeObserver.observe(container);

        startShell();

        return () => {
            resizeObserver.disconnect();
            shell.kill();
            terminal.dispose();
        };
    });

    function startShell() {
        shell = new TerminalShell();

        shell.onData((data: string) => {
            try {
                terminal.write(data);
            } catch {
                // terminal may be disposed
            }
        });

        shell.onExit((code: number | null) => {
            try {
                terminal.write(`\r\n\x1b[33m[Shell exited with code ${code ?? 'null'}]\x1b[0m\r\n`);
                terminal.write('\x1b[33mPress Enter to restart...\x1b[0m\r\n');
            } catch {
                return;
            }

            const restartKeyHandler = terminal.onData((data: string) => {
                if (data === '\r') {
                    restartKeyHandler.dispose();
                    startShell();
                }
            });
        });

        shell.start();

        const inputHandler = terminal.onData((data: string) => {
            if (shell.isRunning()) {
                shell.write(data);
            }
        });
    }
</script>

<div class="terminal-wrapper">
    <div class="terminal-header">
        <div class="terminal-header-left">
            <svg class="terminal-header-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="4 17 10 11 4 5"/>
                <line x1="12" y1="19" x2="20" y2="19"/>
            </svg>
            <span class="terminal-header-title">终端</span>
        </div>
        <button class="terminal-header-close" on:click={() => onClose?.()} title="关闭终端">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <line x1="18" y1="6" x2="6" y2="18"/>
                <line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
        </button>
    </div>
    <div class="terminal-body" bind:this={container}></div>
</div>

<style>
    .terminal-wrapper {
        display: flex;
        flex-direction: column;
        width: 100%;
        height: 100%;
        background: #1e1e1e;
    }

    .terminal-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        height: 32px;
        padding: 0 8px 0 12px;
        background: #252526;
        border-bottom: 1px solid #3c3c3c;
        user-select: none;
        flex-shrink: 0;
    }

    .terminal-header-left {
        display: flex;
        align-items: center;
        gap: 6px;
    }

    .terminal-header-icon {
        width: 14px;
        height: 14px;
        color: #cccccc;
        flex-shrink: 0;
    }

    .terminal-header-title {
        font-size: 12px;
        font-weight: 500;
        color: #cccccc;
        letter-spacing: 0.3px;
    }

    .terminal-header-close {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 24px;
        height: 24px;
        padding: 0;
        border: none;
        background: transparent;
        cursor: pointer;
        border-radius: 4px;
        color: #cccccc;
    }

    .terminal-header-close:hover {
        background: #3c3c3c;
        color: #ffffff;
    }

    .terminal-header-close svg {
        width: 14px;
        height: 14px;
    }

    .terminal-body {
        flex: 1;
        min-height: 0;
        padding: 4px 0 0 4px;
    }
</style>
