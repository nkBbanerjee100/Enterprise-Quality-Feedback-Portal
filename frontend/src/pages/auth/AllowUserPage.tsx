/**
 * Allow User Page — standalone route (/allow-user).
 * The actual content now lives in SettingsAllowUser.tsx so that both
 * this page AND the Settings page can use it without duplication.
 */
import React from 'react';
import { PageWrapper } from '../../components/layout/PageWrapper';
import { AllowUserContent } from '../settings/SettingsAllowUser';

export { AllowUserContent };

export const AllowUserPage: React.FC = () => {
  return (
    <PageWrapper>
      <div className="max-w-3xl mx-auto">
        <AllowUserContent />
      </div>
    </PageWrapper>
  );
};

export default AllowUserPage;