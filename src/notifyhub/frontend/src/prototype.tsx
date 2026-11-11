import React from 'react';
import ReactDOM from 'react-dom/client';
import { ColorSchemeScript, MantineProvider } from '@mantine/core';

import { PrototypeApp } from './prototypes/PrototypeApp';
import { theme } from './theme';
import './index.css';
import './notification.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <>
      <ColorSchemeScript defaultColorScheme="dark" />
      <MantineProvider theme={theme} defaultColorScheme="dark">
        <PrototypeApp />
      </MantineProvider>
    </>
  </React.StrictMode>,
);
