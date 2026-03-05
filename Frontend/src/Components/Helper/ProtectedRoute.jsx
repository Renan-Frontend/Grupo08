import React from 'react';
import { UserContext } from '../../Context/UserContext';
import { Navigate, useLocation } from 'react-router-dom';

const ProtectedRoute = ({ children }) => {
  const location = useLocation();
  const { user, authLoading } = React.useContext(UserContext);

  if (authLoading) {
    return null;
  }

  if (!user) {
    return <Navigate to="/" state={{ from: location }} replace />;
  }
  return children;
};

export default ProtectedRoute;
