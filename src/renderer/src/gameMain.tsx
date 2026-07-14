import React from 'react';
import ReactDOM from 'react-dom/client';
import GamePopup from './features/game/GamePopup';
import ErrorBoundary from './components/ErrorBoundary';
import { installUiClickSounds } from './lib/uiSounds';
import './styles/index.css';

installUiClickSounds();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode><ErrorBoundary><GamePopup /></ErrorBoundary></React.StrictMode>
);
