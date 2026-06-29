/**
 * Create CSAT Cycle Page — creation is handled via modal on the list page.
 * This route just redirects back there.
 */
import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

export const CreateCsatCyclePage: React.FC = () => {
  const navigate = useNavigate();
  useEffect(() => { navigate('/csat-cycles', { replace: true }); }, [navigate]);
  return null;
};
