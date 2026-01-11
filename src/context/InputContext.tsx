import React, { createContext, useContext, useRef, ReactNode, useCallback } from 'react';

interface InputContextValue {
  getCommandInput: () => string;
  setCommandInput: (value: string) => void;
  renderCommandInput: (callback?: () => void) => void;
  commandInputVersion: number;
}

const InputContext = createContext<InputContextValue | null>(null);

export function InputProvider({ children }: { children: ReactNode }) {
  const commandInputRef = useRef<string>('');
  const versionRef = useRef<number>(0);
  const renderCallbackRef = useRef<(() => void) | null>(null);

  const setCommandInput = useCallback((value: string) => {
    commandInputRef.current = value;
    versionRef.current += 1;
    // Call render callback if set (for CommandMode)
    if (renderCallbackRef.current) {
      renderCallbackRef.current();
    }
  }, []);

  const getCommandInput = useCallback(() => {
    return commandInputRef.current;
  }, []);

  const renderCommandInput = useCallback((callback?: () => void) => {
    if (callback) {
      renderCallbackRef.current = callback;
    }
  }, []);

  return (
    <InputContext.Provider value={{ 
      getCommandInput, 
      setCommandInput, 
      renderCommandInput,
      commandInputVersion: versionRef.current 
    }}>
      {children}
    </InputContext.Provider>
  );
}

export function useInputContext() {
  const context = useContext(InputContext);
  if (!context) {
    throw new Error('useInputContext must be used within InputProvider');
  }
  return context;
}
