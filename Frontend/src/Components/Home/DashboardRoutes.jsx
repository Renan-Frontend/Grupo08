import React from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import DashboardStart from './DashboardStart';

const Dashboard = React.lazy(() => import('./Dashboard/index'));

const DashboardRoutes = () => {
  return (
    <Routes>
      <Route index element={<DashboardStart key="dashboard-list" />} />
      <Route path="criar" element={<DashboardStart key="dashboard-criar" />} />
      <Route path=":dashboardSlug" element={<Dashboard />} />
      <Route path="*" element={<Navigate to="." replace />} />
    </Routes>
  );
};

export default DashboardRoutes;
