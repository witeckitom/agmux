import React from 'react';
import { render } from 'ink-testing-library';
import { Textarea } from './Textarea.js';
import { describe, it, expect, vi } from 'vitest';

describe('Textarea', () => {
  it('renders with initial value', () => {
    const onChange = vi.fn();
    const { lastFrame } = render(
      <Textarea value="test" onChange={onChange} />
    );

    expect(lastFrame()).toContain('test');
  });

  it('displays multiple lines correctly', () => {
    const onChange = vi.fn();
    const multiLineValue = 'line1\nline2\nline3';
    const { lastFrame } = render(
      <Textarea value={multiLineValue} onChange={onChange} />
    );

    const output = lastFrame();
    expect(output).toContain('line1');
    expect(output).toContain('line2');
    expect(output).toContain('line3');
  });

  it('calls onChange when value changes', () => {
    const onChange = vi.fn();
    const { stdin, lastFrame } = render(
      <Textarea value="" onChange={onChange} isFocused={true} />
    );

    stdin.write('a');
    expect(onChange).toHaveBeenCalledWith('a');
  });

  it('handles newline input', () => {
    const onChange = vi.fn();
    const { stdin } = render(
      <Textarea value="test" onChange={onChange} isFocused={true} />
    );

    stdin.write('\r'); // Enter key
    expect(onChange).toHaveBeenCalledWith('test\n');
  });

  it('handles backspace', () => {
    const onChange = vi.fn();
    const { stdin } = render(
      <Textarea value="test" onChange={onChange} isFocused={true} />
    );

    stdin.write('\b'); // Backspace
    expect(onChange).toHaveBeenCalledWith('tes');
  });

  it('handles pasted multi-line text', () => {
    const onChange = vi.fn();
    const { stdin } = render(
      <Textarea value="" onChange={onChange} isFocused={true} />
    );

    const pastedText = 'line1\nline2\nline3';
    // Simulate pasting character by character
    for (const char of pastedText) {
      stdin.write(char);
    }

    // Should have called onChange multiple times, last with full text
    expect(onChange).toHaveBeenCalled();
    const lastCall = onChange.mock.calls[onChange.mock.calls.length - 1];
    expect(lastCall[0]).toBe(pastedText);
  });

  it('calls onSubmit on Ctrl+Enter', () => {
    const onChange = vi.fn();
    const onSubmit = vi.fn();
    const { stdin } = render(
      <Textarea value="test" onChange={onChange} onSubmit={onSubmit} isFocused={true} />
    );

    // Ctrl+Enter
    stdin.write('\r', { ctrl: true });
    expect(onSubmit).toHaveBeenCalledWith('test');
  });

  it('shows placeholder when empty and not focused', () => {
    const onChange = vi.fn();
    const { lastFrame } = render(
      <Textarea value="" onChange={onChange} placeholder="Enter text..." isFocused={false} />
    );

    expect(lastFrame()).toContain('Enter text...');
  });

  it('displays cursor on last line when focused', () => {
    const onChange = vi.fn();
    const { lastFrame } = render(
      <Textarea value="line1\nline2" onChange={onChange} isFocused={true} />
    );

    const output = lastFrame();
    expect(output).toContain('line2');
    // Cursor should be visible (█ character)
    expect(output).toContain('█');
  });
});
