import React from 'react';
import styles from './Dashboard.module.css';

const Dashboard = () => {
  return (
    <div className={styles.dashboardContainer}>
      <h1 className={styles.pageTitle}>Dashboard</h1>

      <div className={styles.metricsGrid}>
        <div className={styles.metricCard}>
          <div className={styles.metricIcon}>💰</div>
          <div className={styles.metricContent}>
            <p className={styles.metricLabel}>FATURAMENTO TOTAL</p>
            <h3 className={styles.metricValue}>R$ 847.250</h3>
            <p className={styles.metricChange}>↑ 12.5%</p>
          </div>
        </div>

        <div className={styles.metricCard}>
          <div className={styles.metricIcon}>👥</div>
          <div className={styles.metricContent}>
            <p className={styles.metricLabel}>TOTAL DE CLIENTES</p>
            <h3 className={styles.metricValue}>1.284</h3>
            <p className={styles.metricChange}>↑ 8.2%</p>
          </div>
        </div>

        <div className={styles.metricCard}>
          <div className={styles.metricIcon}>🛒</div>
          <div className={styles.metricContent}>
            <p className={styles.metricLabel}>TOTAL DE VENDAS</p>
            <h3 className={styles.metricValue}>3.647</h3>
            <p className={styles.metricChange}>↑ 15.3%</p>
          </div>
        </div>
      </div>

      <div className={styles.chartSection}>
        <div className={styles.chartHeader}>
          <h2 className={styles.chartTitle}>Evolução de Faturamento</h2>
          <p className={styles.chartSubtitle}>
            Acompanhamento do faturamento ao longo do ano
          </p>
        </div>

        <svg viewBox="0 0 800 300" className={styles.chart}>
          <line
            x1="50"
            y1="20"
            x2="50"
            y2="250"
            stroke="#eee"
            strokeWidth="1"
          />
          <line
            x1="50"
            y1="250"
            x2="750"
            y2="250"
            stroke="#eee"
            strokeWidth="1"
          />
          <polyline
            points="50,200 100,190 150,185 200,175 250,160 300,150 350,145 400,140 450,130 500,120 550,115 600,110 650,100 700,90 750,80"
            fill="none"
            stroke="#27ae60"
            strokeWidth="3"
          />
          <polygon
            points="50,200 100,190 150,185 200,175 250,160 300,150 350,145 400,140 450,130 500,120 550,115 600,110 650,100 700,90 750,80 750,250 50,250"
            fill="#27ae60"
            opacity="0.1"
          />
          <text x="50" y="270" fontSize="12" fill="#999">
            Fev
          </text>
          <text x="150" y="270" fontSize="12" fill="#999">
            Mar
          </text>
          <text x="250" y="270" fontSize="12" fill="#999">
            Mai
          </text>
          <text x="350" y="270" fontSize="12" fill="#999">
            Jul
          </text>
          <text x="450" y="270" fontSize="12" fill="#999">
            Ago
          </text>
          <text x="550" y="270" fontSize="12" fill="#999">
            Set
          </text>
          <text x="650" y="270" fontSize="12" fill="#999">
            Out
          </text>
          <text x="750" y="270" fontSize="12" fill="#999">
            Dez
          </text>
          <text x="10" y="55" fontSize="12" fill="#999">
            R$ 100k
          </text>
          <text x="10" y="130" fontSize="12" fill="#999">
            R$ 80k
          </text>
          <text x="10" y="220" fontSize="12" fill="#999">
            R$ 0k
          </text>
        </svg>

        <div className={styles.chartFooter}>
          <p className={styles.chartGrowth}>
            <span className={styles.chartGrowthValue}>▲ 126.7%</span>{' '}
            crescimento no ano
          </p>
          <p className={styles.chartTotal}>Total anual: R$ 847.250</p>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
