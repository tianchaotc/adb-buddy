/**
 * Entry point — renders the App inside FluentProvider with the resolved theme.
 */
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import {
  FluentProvider,
  webDarkTheme,
  webLightTheme,
} from '@fluentui/react-components';
import App from './App';
import { useSettingsStore, resolveTheme } from '@/store/settings';
import './styles/global.css';

function Root() {
  const theme = useSettingsStore((s) => s.theme);
  const effective = resolveTheme(theme);
  return (
    <FluentProvider theme={effective === 'dark' ? webDarkTheme : webLightTheme}>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </FluentProvider>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Root />
  </StrictMode>,
);
