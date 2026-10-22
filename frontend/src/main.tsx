import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.js';
import { LegalPage, NotFoundPage, SupportPage } from './LegalPages.js';
import './styles.css';

const path = window.location.pathname.replace(/\/+$/, '');
const screen =
  path === '/privacy' ? (
    <LegalPage kind="privacy" />
  ) : path === '/terms' ? (
    <LegalPage kind="terms" />
  ) : path === '/support' ? (
    <SupportPage />
  ) : path === '' || path === '/' ? (
    <App />
  ) : (
    <NotFoundPage />
  );

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>{screen}</React.StrictMode>,
);
