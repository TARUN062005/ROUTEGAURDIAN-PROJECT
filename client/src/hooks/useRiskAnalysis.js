import { useState, useCallback } from 'react';

export const useRiskAnalysis = (origin, destination, mode) => {
  const [status, setStatus] = useState('idle');
  const [result, setResult] = useState(null);
  const [jobId, setJobId] = useState(null);
  const [error, setError] = useState(null);
  
  const startPolling = useCallback((jId) => {
    const interval = setInterval(async () => {
      try {
        const response = await fetch(`/api/ai/risk/status/${jId}`);
        const data = await response.json();
        
        if (data.status === 'completed') {
          setResult(data.result);
          setStatus('completed');
          clearInterval(interval);
        } else if (data.status === 'failed') {
          setStatus('failed');
          setError(data.error);
          clearInterval(interval);
        }
      } catch (err) {
        setStatus('failed');
        setError(err.message);
        clearInterval(interval);
      }
    }, 5000);
  }, []);

  const startAnalysis = useCallback(async () => {
    setStatus('processing');
    setError(null);
    
    try {
      const response = await fetch('/api/ai/risk/analyze', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ origin, destination, mode })
      });
      
      const data = await response.json();
      
      if (data.status === 'completed') {
        setResult(data.result || data.intelligence);
        setStatus('completed');
      } else if (data.status === 'processing') {
        setJobId(data.jobId);
        startPolling(data.jobId);
      } else if (data.status === 'failed') {
        setStatus('failed');
        setError(data.error || 'Job failed');
      }
    } catch (err) {
      setStatus('failed');
      setError(err.message);
    }
  }, [origin, destination, mode, startPolling]);
  
  return { status, result, startAnalysis };
};

export default useRiskAnalysis;
