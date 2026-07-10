import React from 'react';
import ReactDOM from 'react-dom/client';
import Toast from './components/Toast';
import './styles/index.css';

ReactDOM.createRoot(document.getElementById('toast-root')!).render(
  <React.StrictMode>
    <Toast />
  </React.StrictMode>
);
