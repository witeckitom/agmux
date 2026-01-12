import React, { useState, useEffect } from 'react';
import { Text } from 'ink';

interface SpinnerProps {
  /**
   * Whether the spinner should be animating
   */
  active?: boolean;
  /**
   * Spinner characters to cycle through
   */
  frames?: string[];
  /**
   * Animation interval in milliseconds
   */
  interval?: number;
}

/**
 * Animated spinner component for indicating loading/processing state
 */
export function Spinner({ 
  active = true, 
  frames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'],
  interval = 80 
}: SpinnerProps) {
  const [frameIndex, setFrameIndex] = useState(0);

  useEffect(() => {
    if (!active) {
      return;
    }

    const timer = setInterval(() => {
      setFrameIndex(prev => (prev + 1) % frames.length);
    }, interval);

    return () => clearInterval(timer);
  }, [active, frames.length, interval]);

  if (!active) {
    return null;
  }

  return <Text color="cyan">{frames[frameIndex]}</Text>;
}
