import React from 'react';
import ReactDOM from 'react-dom/client';
import NotePopup from './features/note/NotePopup';
import ErrorBoundary from './components/ErrorBoundary';
import './styles/index.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode><ErrorBoundary><NotePopup /></ErrorBoundary></React.StrictMode>
);
