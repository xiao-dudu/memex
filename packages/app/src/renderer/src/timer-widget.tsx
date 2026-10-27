import React from 'react';
import ReactDOM from 'react-dom/client';
import { TimerWidgetApp } from './components/timer-widget/TimerWidgetApp';
import './styles.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <TimerWidgetApp />
  </React.StrictMode>,
);
