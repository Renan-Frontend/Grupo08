import React from 'react';
import { Navigate } from 'react-router-dom';
import { UserContext } from '../Context/UserContext';

const AdminRoute = ({ children }) => {
  const { user, loading } = React.useContext(UserContext);

  // Espera o carregamento do usuário
  if (loading) return null;

  if (user?.role !== 'admin') {
    return <Navigate to="/gerar-bpmn" />;
  }

  return children;
};

export default AdminRoute;
