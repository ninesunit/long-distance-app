import React from 'react';
import ReactDOM from 'react-dom/client';
import DockApp from './DockApp';
import { installUiClickSounds } from './lib/uiSounds';
import './styles/index.css';

installUiClickSounds();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode><DockApp /></React.StrictMode>
);
