import React from 'react';
import styles from './StepBar.module.css';

const StepBar = ({ steps, current, onStepClick }) => {
  return (
    <div className={styles.stepBar}>
      {steps.map((step, idx) => (
        <React.Fragment key={step.label}>
          <div
            className={
              styles.step + ' ' + (idx <= current ? styles.active : '')
            }
            style={{ cursor: onStepClick ? 'pointer' : 'default' }}
            onClick={onStepClick ? () => onStepClick(idx) : undefined}
          >
            <div className={styles.icon}>{step.icon}</div>
          </div>
          {idx < steps.length - 1 && (
            <div
              className={
                styles.connector + ' ' + (idx < current ? styles.active : '')
              }
            />
          )}
        </React.Fragment>
      ))}
    </div>
  );
};

export default StepBar;
