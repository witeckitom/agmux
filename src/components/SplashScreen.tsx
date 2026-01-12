import React, { useEffect, useState } from 'react';
import { Box, Text } from 'ink';

interface SplashScreenProps {
  version: string;
  onComplete: () => void;
}

const AMUX_LOGO = `
    █████╗  ██████╗ ███╗   ███╗██╗   ██╗██╗  ██╗
   ██╔══██╗██╔════╝ ████╗ ████║██║   ██║╚██╗██╔╝
   ███████║██║  ███╗██╔████╔██║██║   ██║ ╚███╔╝ 
   ██╔══██║██║   ██║██║╚██╔╝██║██║   ██║ ██╔██╗ 
   ██║  ██║╚██████╔╝██║ ╚═╝ ██║╚██████╔╝██╔╝ ██╗
   ╚═╝  ╚═╝ ╚═════╝ ╚═╝     ╚═╝ ╚═════╝ ╚═╝  ╚═╝
`;

export function SplashScreen({ version, onComplete }: SplashScreenProps) {
  const [visible, setVisible] = useState(true);

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
  const logoLines = AMUX_LOGO.trim().split('\n');
  const logoWidth = Math.max(...logoLines.map(line => line.length));

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
          {AMUX_LOGO}
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
