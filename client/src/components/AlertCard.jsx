import React from 'react';
import AlertBadge from './AlertBadge';

const AlertCard = ({ alert }) => (
  <div className="border border-slate-800 rounded-xl p-4 mb-2 bg-slate-900/40">
    <div className="flex justify-between items-start gap-4 mb-2">
      <h4 className="font-semibold text-sm text-white">{alert.headline || alert.title}</h4>
      <AlertBadge sourceType={alert.sourceType} />
    </div>
    <p className="text-xs text-slate-400 mb-2 leading-relaxed">{alert.description || alert.reason || 'No additional details available.'}</p>
    {alert.distanceToRoute && (
      <span className="text-[10px] text-slate-500 font-bold block">
        {alert.distanceToRoute}km from route
      </span>
    )}
  </div>
);

export default AlertCard;
