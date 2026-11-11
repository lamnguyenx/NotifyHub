import { createTheme } from '@mantine/core';

/**
 * Mantine supplies the provider and popups; the notification feed itself is
 * styled with the TUI's CSS tokens in `index.css` / `notification.css`.
 */
export const theme = createTheme({
  fontFamily: 'Inter, sans-serif',
  colors: {
    accent: [
      '#eaf7fb',
      '#d3eef7',
      '#b9e4f1',
      '#9cd9ea',
      '#82cfe3',
      '#6fc3df',
      '#4aa8c8',
      '#2f8aa8',
      '#1f6c85',
      '#14505f',
    ],
  },
  primaryColor: 'accent',
  defaultRadius: 'md',
});
