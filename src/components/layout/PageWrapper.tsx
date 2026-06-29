/**
 * Layout — Page Wrapper
 * Wraps all protected pages with Sidebar + Navbar
 */
import React from 'react';
import { Sidebar } from './Sidebar';
import { Navbar } from './Navbar';

interface PageWrapperProps {
  children: React.ReactNode;
}

export const PageWrapper: React.FC<PageWrapperProps> = ({ children }) => {
  return (
    <div style={{ display: 'flex', height: '100vh', background: '#F7F9F8' }}>
      <Sidebar />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <Navbar />
        <main style={{ flex: 1, overflowY: 'auto', padding: '28px 32px' }}>
          {children}
        </main>
      </div>
    </div>
  );
};