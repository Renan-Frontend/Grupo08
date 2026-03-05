import React from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import GerarBPMNStart from './GerarBPMNStart';
import GerarBPMNCreate from './GerarBPMNCreate';

const GerarBPMNRoutes = () => {
  return (
    <Routes>
      <Route index element={<GerarBPMNStart />} />
      <Route path="criar" element={<GerarBPMNCreate />} />
      <Route path=":bpmnSlug" element={<GerarBPMNCreate />} />
      <Route path="pipeline" element={<Navigate to="../criar" replace />} />
      <Route
        path="pipeline/:opportunityId"
        element={<Navigate to="../../criar" replace />}
      />
      <Route path="*" element={<Navigate to="." replace />} />
    </Routes>
  );
};

export default GerarBPMNRoutes;
