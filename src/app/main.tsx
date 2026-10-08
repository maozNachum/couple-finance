import React from 'react';
import ReactDOM from 'react-dom/client';
import { applicationContext } from '@finance/contracts/application-context';
import { App } from './App';
import './styles/global.css';
import './styles/identity.css';

document.documentElement.lang = applicationContext.locale;
document.documentElement.dir = applicationContext.direction;
const root = document.getElementById('root');
if (!root) throw new Error('Application root is missing');
ReactDOM.createRoot(root).render(<React.StrictMode><App /></React.StrictMode>);
