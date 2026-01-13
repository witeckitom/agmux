import React, { useEffect, useState, useMemo } from 'react';
import { Box, Text } from 'ink';
import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

interface SplashScreenProps {
  version: string;
  onComplete: () => void;
}

export function SplashScreen({ version, onComplete }: SplashScreenProps) {
  const [visible, setVisible] = useState(true);

  // Read logo from file - try agmux installation directory, not project directory
  const logoContent = useMemo(() => {
    try {
      // Get the directory where this module is located
      const __filename = fileURLToPath(import.meta.url);
      const __dirname = dirname(__filename);
      // Try to find logo relative to the dist directory (when built) or src (when running with tsx)
      const possiblePaths = [
        join(__dirname, '..', 'agmux_logo'), // When running from dist/components/
        join(__dirname, '..', '..', 'src', 'agmux_logo'), // When running from dist/
        join(__dirname, 'agmux_logo'), // When running from src/components/ (development)
      ];
      
      for (const logoPath of possiblePaths) {
        if (existsSync(logoPath)) {
          return readFileSync(logoPath, 'utf-8').trim();
        }
      }
      return '';
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
