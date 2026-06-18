import React from 'react';

const AlertBadge = ({ sourceType }) => {
  const styles = {
    LIVE: 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/20 px-2 py-0.5 text-[10px] font-black rounded-full tracking-wider',
    CACHED: 'bg-amber-500/15 text-amber-400 border border-amber-500/20 px-2 py-0.5 text-[10px] font-black rounded-full tracking-wider',
    SEEDED: 'bg-slate-500/15 text-slate-400 border border-slate-500/20 px-2 py-0.5 text-[10px] font-black rounded-full tracking-wider'
  };
  
  const labels = {
    LIVE: 'LIVE',
    CACHED: 'CACHED',
    SEEDED: 'DEMO'
  };
  
  const source = sourceType?.toUpperCase() || 'SEEDED';
  const styleClass = styles[source] || styles.SEEDED;
  const labelText = labels[source] || 'DEMO';
  
  return (
    <span className={styleClass}>
      {labelText}
    </span>
  );
};

export default AlertBadge;
