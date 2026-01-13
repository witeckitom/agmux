import React from 'react';
import { Box, Text } from 'ink';

interface TestingBannerProps {
  visible: boolean;
}

/**
 * TestingBanner component displays a large yellow banner at the top
 * when running from a worktree branch to indicate testing mode
 */
export function TestingBanner({ visible }: TestingBannerProps) {
  if (!visible) {
    return null;
  }

  const bannerText = '⚠️  TESTING MODE - Running from worktree branch  ⚠️';
  const width = process.stdout.columns || 80;
  const padding = Math.max(0, Math.floor((width - bannerText.length) / 2));
  const paddedText = ' '.repeat(padding) + bannerText + ' '.repeat(padding);

  return (
    <Box
      width="100%"
      backgroundColor="yellow"
      paddingY={1}
      flexShrink={0}
    >
      <Text bold color="black">
        {paddedText}
      </Text>
    </Box>
  );
}