import React from 'react';
import { render } from 'ink-testing-library';
import { MultiLineTextInput } from './MultiLineTextInput.js';
import { describe, it, expect, vi } from 'vitest';

describe('MultiLineTextInput', () => {
  it('renders initial value with cursor at end', () => {
    const { lastFrame } = render(
      <MultiLineTextInput
        value="hello"
        onChange={() => {}}
        onSubmit={() => {}}
      />
    );
    // Cursor should highlight the space after 'hello'
    expect(lastFrame()).toContain('hello');
  });

  it('allows typing characters', () => {
    const onChange = vi.fn();
    const { stdin, lastFrame } = render(
      <MultiLineTextInput
        value=""
        onChange={onChange}
        onSubmit={() => {}}
      />
    );

    stdin.write('a');
    expect(onChange).toHaveBeenCalledWith('a');
  });

  it('handles left arrow navigation and typing mid-string', async () => {
    const onChange = vi.fn();
    const { stdin, lastFrame } = render(
      <MultiLineTextInput
        value="hello"
        onChange={onChange}
        onSubmit={() => {}}
      />
    );

    // Move cursor left 2 times (from end position 5 to position 3)
    stdin.write('\x1b[D'); // left arrow
    stdin.write('\x1b[D'); // left arrow

    // Type 'X' - should insert at position 3
    stdin.write('X');

    // Should be 'helXlo' not 'helloX'
    expect(onChange).toHaveBeenLastCalledWith('helXlo');
  });

  it('handles backspace at cursor position', () => {
    const onChange = vi.fn();
    const { stdin } = render(
      <MultiLineTextInput
        value="hello"
        onChange={onChange}
        onSubmit={() => {}}
      />
    );

    // Move left twice
    stdin.write('\x1b[D');
    stdin.write('\x1b[D');

    // Backspace should delete 'l' at position 2
    stdin.write('\x7f'); // backspace

    expect(onChange).toHaveBeenLastCalledWith('helo');
  });

  it('handles up/down arrow navigation', () => {
    const onChange = vi.fn();
    const { stdin } = render(
      <MultiLineTextInput
        value="line1\nline2"
        onChange={onChange}
        onSubmit={() => {}}
      />
    );

    // Cursor starts at end of line2
    // Move up to line1
    stdin.write('\x1b[A'); // up arrow

    // Type 'X' - should be at end of line1
    stdin.write('X');

    expect(onChange).toHaveBeenLastCalledWith('line1X\nline2');
  });

  it('calls onSubmit on double enter', () => {
    const onSubmit = vi.fn();
    const { stdin } = render(
      <MultiLineTextInput
        value="hello"
        onChange={() => {}}
        onSubmit={onSubmit}
      />
    );

    // First enter adds newline
    stdin.write('\r');
    // Second enter submits
    stdin.write('\r');

    expect(onSubmit).toHaveBeenCalledWith('hello');
  });

  it('calls onCancel on escape', () => {
    const onCancel = vi.fn();
    const { stdin } = render(
      <MultiLineTextInput
        value="hello"
        onChange={() => {}}
        onSubmit={() => {}}
        onCancel={onCancel}
      />
    );

    stdin.write('\x1b'); // escape
    expect(onCancel).toHaveBeenCalled();
  });
});
