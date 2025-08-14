import React from 'react';
import LoadingPage from '@/components/LoadingPage';
import { useResults } from '@/contexts/ResultsContext';

const Loading: React.FC = () => {
  const { cvFiles } = useResults();
  const completedFiles = cvFiles.filter(f => f.status === 'completed').length;
  
  return (
    <LoadingPage 
      totalFiles={cvFiles.length} 
      completedFiles={completedFiles}
      currentFile={cvFiles.find(f => f.status === 'evaluating')?.name}
    />
  );
};

export default Loading;