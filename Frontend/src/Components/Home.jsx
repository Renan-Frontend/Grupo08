import React from 'react';

import Sidebar from './Layout/Sidebar';
import Dashboard from './Home/Dashboard';

const Home = () => {
  return (
    <div className={styles.dashboardWrapper}>
      <Sidebar />
      <main className={styles.mainContent}>
        <Dashboard />
      </main>
    </div>
  );
};

export default Home;
