import { useCallback } from 'react';

/**
 * PWA Haptic Feedback using the native Vibration API
 * Falls back silently if not supported (iOS Safari prior to 16.4, or disabled)
 */
export function useHaptics() {
  const vibrate = useCallback((pattern: number | number[]) => {
    if (typeof window !== 'undefined' && 'vibrate' in navigator) {
      try {
        navigator.vibrate(pattern);
      } catch (e) {
        // Silently fail on unsupported devices
      }
    }
  }, []);

  return {
    // Light tap (e.g., clicking a tab or small button)
    lightTap: () => vibrate(10),
    
    // Medium tap (e.g., primary action like Save)
    mediumTap: () => vibrate(20),
    
    // Heavy tap (e.g., destructive action warning)
    heavyTap: () => vibrate(30),
    
    // Success feedback (two quick taps)
    success: () => vibrate([15, 30, 20]),
    
    // Error feedback (three quick, sharp taps)
    error: () => vibrate([20, 40, 20, 40, 30]),
    
    // Swipe action (smooth ramp)
    swipe: () => vibrate(15),
  };
}
