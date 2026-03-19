import React from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import IaIntro from './IaIntro';
import IaConfigurar from './IaConfigurar';

const IaRoutes = () => {
  return (
    <Routes>
      <Route index element={<IaIntro />} />
      <Route path="configurar" element={<IaConfigurar />} />
      <Route path="*" element={<Navigate to="." replace />} />
    </Routes>
  );
};

export default IaRoutes;
