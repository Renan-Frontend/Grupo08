import React from "react";
import { UserContext } from "../../Context/UserContext";
import { Navigate, useLocation } from "react-router-dom";

const ProtectedRoute = ({ children, requiredRole, requiredPermission }) => {
  const location = useLocation();
  const { user, authLoading, hasRole, hasPermission } =
    React.useContext(UserContext);

  if (authLoading) {
    return null;
  }

  if (!user) {
    return <Navigate to="/" state={{ from: location }} replace />;
  }

  if (requiredRole && !hasRole(requiredRole)) {
    return <Navigate to="/ia" replace />;
  }

  if (requiredPermission && !hasPermission(requiredPermission)) {
    return <Navigate to="/ia" replace />;
  }

  return children;
};

export default ProtectedRoute;
