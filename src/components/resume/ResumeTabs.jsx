import React, { useRef, useEffect, useCallback } from 'react';

/**
 * ResumeTabs component provides keyboard-accessible tab list.
 * Compliance with WAI-ARIA tab pattern (arrow key navigation, Home/End buttons).
 */
export const ResumeTabs = React.memo(({ activeTab, tabs, onChange }) => {
  const tabRefs = useRef([]);

  const handleKeyDown = useCallback((e, index) => {
    let nextIndex = index;
    if (e.key === 'ArrowRight') {
      nextIndex = (index + 1) % tabs.length;
    } else if (e.key === 'ArrowLeft') {
      nextIndex = (index - 1 + tabs.length) % tabs.length;
    } else if (e.key === 'Home') {
      nextIndex = 0;
    } else if (e.key === 'End') {
      nextIndex = tabs.length - 1;
    } else {
      return; // Do nothing for other keys
    }

    e.preventDefault();
    onChange(tabs[nextIndex].id);
    // Move visual focus to the new active tab
    setTimeout(() => {
      tabRefs.current[nextIndex]?.focus();
    }, 0);
  }, [tabs, onChange]);

  return (
    <div 
      className="resume-tabs-list" 
      role="tablist" 
      aria-label="Resume Analysis Modules"
    >
      {tabs.map((tab, idx) => {
        const isActive = activeTab === tab.id;
        return (
          <button
            key={tab.id}
            ref={el => tabRefs.current[idx] = el}
            role="tab"
            aria-selected={isActive}
            aria-controls={`panel-${tab.id}`}
            id={`tab-${tab.id}`}
            tabIndex={isActive ? 0 : -1}
            onClick={() => onChange(tab.id)}
            onKeyDown={(e) => handleKeyDown(e, idx)}
            className={`resume-tab-btn ${isActive ? 'active' : ''}`}
          >
            <span style={{ marginRight: '6px' }}>{tab.icon}</span>
            {tab.label}
          </button>
        );
      })}
    </div>
  );
});

ResumeTabs.displayName = 'ResumeTabs';
export default ResumeTabs;
