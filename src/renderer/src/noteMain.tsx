import React from 'react';
import ReactDOM from 'react-dom/client';
import NotePopup from './features/note/NotePopup';
import ErrorBoundary from './components/ErrorBoundary';
import { installUiClickSounds } from './lib/uiSounds';
import './styles/index.css';

installUiClickSounds();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode><ErrorBoundary><NotePopup /></ErrorBoundary></React.StrictMode>
);
