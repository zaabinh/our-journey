import React from 'react';
import ReactDOM from 'react-dom/client';
import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import { App } from './app/App';
import './styles/tokens.css';
import { JourneyProvider } from './app/JourneyProvider';
const router = createBrowserRouter([{ path: '*', element: <App /> }]);
ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <JourneyProvider>
      <RouterProvider router={router} />
    </JourneyProvider>
  </React.StrictMode>,
);
