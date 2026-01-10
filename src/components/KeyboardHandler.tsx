import { useKeyboard } from '../hooks/useKeyboard.js';

// Separate component just for keyboard handling - doesn't render anything
// This isolates useKeyboard from AppContent to prevent re-renders
export function KeyboardHandler() {
  useKeyboard();
  return null;
}
