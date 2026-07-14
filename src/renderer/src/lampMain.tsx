import React from 'react';
import ReactDOM from 'react-dom/client';
import LampPopup from './features/lamp/LampPopup';
import ErrorBoundary from './components/ErrorBoundary';
import { installUiClickSounds } from './lib/uiSounds';
import './styles/index.css';

installUiClickSounds();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode><ErrorBoundary><LampPopup /></ErrorBoundary></React.StrictMode>
);
