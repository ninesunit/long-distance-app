import React from 'react';
import ReactDOM from 'react-dom/client';
import PetPopup from './features/pet/PetPopup';
import ErrorBoundary from './components/ErrorBoundary';
import './styles/index.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode><ErrorBoundary><PetPopup /></ErrorBoundary></React.StrictMode>
);
