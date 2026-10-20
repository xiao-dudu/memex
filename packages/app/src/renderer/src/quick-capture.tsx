import React from 'react';
import ReactDOM from 'react-dom/client';
import QuickCaptureApp from './components/quick-capture/QuickCaptureApp';
import './styles.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QuickCaptureApp />
  </React.StrictMode>,
);
