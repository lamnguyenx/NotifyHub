import { createTheme } from '@mantine/core';

export const theme = createTheme({
  fontFamily: 'Inter, sans-serif',
  colors: {
    blue: ['#eff6ff', '#dbeafe', '#bfdbfe', '#93c5fd', '#60a5fa', '#3b82f6', '#2563eb', '#1d4ed8', '#1e40af', '#1e3a8a', '#172554'],
  },
  primaryColor: 'blue',
  scale: 0.9,
  components: {
    Card: {
      styles: {
        root: {
          border: '1px solid var(--mantine-color-gray-6)',
        },
      },
    },
  },
});