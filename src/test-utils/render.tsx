import React from 'react';
import { render as inkRender, Instance } from 'ink';
import { PassThrough } from 'stream';

/**
 * Test renderer for React Ink components that works with ESM
 */
export function render(element: React.ReactElement): {
  lastFrame: () => string;
  frames: string[];
  rerender: (element: React.ReactElement) => void;
  unmount: () => void;
  stdin: {
    write: (data: string) => void;
  };
  waitUntilExit: () => Promise<void>;
} {
  const frames: string[] = [];
  let instance: Instance | null = null;

  const stdout = new PassThrough();
  const stderr = new PassThrough();
  
  // Create a mock stdin that supports isRawMode and ref
  const stdin = new PassThrough() as any;
  stdin.isTTY = true;
  stdin.isRaw = false;
  stdin.setRawMode = (mode: boolean) => {
    stdin.isRaw = mode;
  };
  stdin.ref = () => {};
  stdin.unref = () => {};

  // Capture all output
  let lastOutput = '';
  stdout.on('data', (chunk: Buffer) => {
    const text = chunk.toString();
    frames.push(text);
    lastOutput += text;
  });

  instance = inkRender(element, {
    stdout: stdout as any,
    stderr: stderr as any,
    stdin: stdin,
    debug: false,
    exitOnCtrlC: false,
  });

  return {
    lastFrame: () => {
      // Return accumulated output, or the last frame
      if (lastOutput) {
        return lastOutput;
      }
      return frames.length > 0 ? frames[frames.length - 1] : frames.join('');
    },
    frames,
    rerender: (newElement: React.ReactElement) => {
      frames.length = 0; // Clear frames
      if (instance) {
        instance.rerender(newElement);
      }
    },
    unmount: () => {
      if (instance) {
        instance.unmount();
      }
    },
    stdin: {
      write: (data: string) => {
        stdin.write(data);
      },
    },
    waitUntilExit: async () => {
      if (instance) {
        await instance.waitUntilExit();
      }
    },
  };
}
