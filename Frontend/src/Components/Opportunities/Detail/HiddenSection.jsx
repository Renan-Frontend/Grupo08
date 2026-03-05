import React from 'react';
import styles from '../OpportunityDetail.module.css';

const HiddenSection = ({ label, buttonLabel, onShow, bordered = false }) => {
  return (
    <div
      className={
        bordered
          ? `${styles.hiddenSection} ${styles.editableSection}`
          : styles.hiddenSection
      }
    >
      <span>{label}</span>
      <button type="button" className={styles.editButton} onClick={onShow}>
        {buttonLabel}
      </button>
    </div>
  );
};

export default HiddenSection;
