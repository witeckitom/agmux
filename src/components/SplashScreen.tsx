import React, { useEffect, useState, useMemo } from 'react';
import { Box, Text } from 'ink';
import { readFileSync } from 'fs';
import { join } from 'path';

interface SplashScreenProps {
  version: string;
  onComplete: () => void;
}

export function SplashScreen({ version, onComplete }: SplashScreenProps) {
  const [visible, setVisible] = useState(true);

  // Read logo from file - try src/agmux_logo relative to project root
  const logoContent = useMemo(() => {
    try {
      const projectRoot = process.cwd();
      const logoPath = join(projectRoot, 'src', 'agmux_logo');
      return readFileSync(logoPath, 'utf-8').trim();
    } catch {
      // Fallback to empty string if file can't be read
      return '';
    }
  }, []);

  useEffect(() => {
    // Show splash for 0.8 seconds
    const timer = setTimeout(() => {
      setVisible(false);
      onComplete();
    }, 800);

    return () => clearTimeout(timer);
  }, [onComplete]);

  if (!visible) {
    return null;
  }

  const terminalWidth = process.stdout.columns || 80;
  const logoLines = logoContent ? logoContent.split('\n') : [];
  const logoWidth = logoLines.length > 0 ? Math.max(...logoLines.map(line => line.length)) : 0;

  return (
    <Box
      width={terminalWidth}
      height="100%"
      justifyContent="center"
      alignItems="center"
      flexDirection="column"
    >
      <Box flexDirection="column" alignItems="center">
        <Text color="cyan" bold>
          {logoContent}
        </Text>
        <Box marginTop={1}>
          <Text color="gray" dimColor>
            Version {version}
          </Text>
        </Box>
      </Box>
    </Box>
  );
}
