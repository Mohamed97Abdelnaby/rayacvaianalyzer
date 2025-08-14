import React, { createContext, useContext, useState, ReactNode } from 'react';

export interface CriteriaEvaluation {
  criterionId: string;
  criterionText: string;
  isMet: boolean;
  justification: string;
  score: number;
}

export interface CVFile {
  id: string;
  name: string;
  file: File;
  status: 'uploading' | 'uploaded' | 'extracting' | 'extracted' | 'evaluating' | 'completed' | 'error';
  extractionStatus: 'pending' | 'extracting' | 'completed' | 'error';
  extractedText?: string;
  llmScore?: number;
  atsScore?: number;
  isApproved?: boolean;
  justification?: string;
  yearsOfExperience?: number;
  detailedScores?: Record<string, number>;
  criteriaEvaluations?: CriteriaEvaluation[];
  strengths?: string[];
  weaknesses?: string[];
  recommendations?: string[];
}

export interface EvaluationCriteria {
  id: string;
  text: string;
  isMandatory: boolean;
  weight: number;
}

interface ResultsContextType {
  cvFiles: CVFile[];
  setCvFiles: React.Dispatch<React.SetStateAction<CVFile[]>>;
  selectedCandidate: CVFile | null;
  setSelectedCandidate: (candidate: CVFile | null) => void;
  criteria: EvaluationCriteria[];
  setCriteria: React.Dispatch<React.SetStateAction<EvaluationCriteria[]>>;
  overallScore: number;
  setOverallScore: (score: number) => void;
  enableATS: boolean;
  setEnableATS: (enabled: boolean) => void;
}

const ResultsContext = createContext<ResultsContextType | undefined>(undefined);

export const useResults = () => {
  const context = useContext(ResultsContext);
  if (context === undefined) {
    throw new Error('useResults must be used within a ResultsProvider');
  }
  return context;
};

export const ResultsProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [cvFiles, setCvFiles] = useState<CVFile[]>([]);
  const [selectedCandidate, setSelectedCandidate] = useState<CVFile | null>(null);
  const [criteria, setCriteria] = useState<EvaluationCriteria[]>([]);
  const [overallScore, setOverallScore] = useState(70);
  const [enableATS, setEnableATS] = useState(false);

  return (
    <ResultsContext.Provider
      value={{
        cvFiles,
        setCvFiles,
        selectedCandidate,
        setSelectedCandidate,
        criteria,
        setCriteria,
        overallScore,
        setOverallScore,
        enableATS,
        setEnableATS,
      }}
    >
      {children}
    </ResultsContext.Provider>
  );
};