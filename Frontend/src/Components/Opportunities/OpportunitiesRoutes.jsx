import React from 'react';
import { Route, Routes } from 'react-router-dom';
import Opportunities from './Opportunities';
import OpportunityDetail from './OpportunityDetail';

const OpportunitiesRoutes = () => {
  return (
    <Routes>
      <Route index element={<Opportunities />} />
      <Route path="criar" element={<OpportunityDetail />} />
      <Route path=":slug" element={<OpportunityDetail />} />
    </Routes>
  );
};

export default OpportunitiesRoutes;
