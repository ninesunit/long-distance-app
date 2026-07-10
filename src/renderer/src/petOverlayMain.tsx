import React from 'react';
import ReactDOM from 'react-dom/client';
import PetOverlay from './features/pet/PetOverlay';
import './styles/index.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <PetOverlay />
  </React.StrictMode>
);
