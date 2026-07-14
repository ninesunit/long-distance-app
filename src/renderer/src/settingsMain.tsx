import React from 'react';
import ReactDOM from 'react-dom/client';
import SettingsPopup from './features/settings/SettingsPopup';
import ErrorBoundary from './components/ErrorBoundary';
import { installUiClickSounds } from './lib/uiSounds';
import './styles/index.css';

installUiClickSounds();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode><ErrorBoundary><SettingsPopup /></ErrorBoundary></React.StrictMode>
);
