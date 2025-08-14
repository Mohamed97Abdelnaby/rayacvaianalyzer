import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { FileText, Brain, CheckCircle, Clock } from 'lucide-react';

interface LoadingPageProps {
  totalFiles: number;
  completedFiles: number;
  currentFile?: string;
  onComplete?: () => void;
}

const LoadingPage: React.FC<LoadingPageProps> = ({
  totalFiles,
  completedFiles,
  currentFile,
  onComplete
}) => {
  const [progress, setProgress] = useState(0);
  const [currentStep, setCurrentStep] = useState(0);
  const navigate = useNavigate();

  const steps = [
    { label: 'Extracting text from CVs', icon: FileText, description: 'Reading and parsing document content' },
    { label: 'Analyzing candidates', icon: Brain, description: 'AI evaluation in progress' },
    { label: 'Generating insights', icon: CheckCircle, description: 'Creating detailed assessments' },
  ];

  useEffect(() => {
    const calculatedProgress = (completedFiles / totalFiles) * 100;
    setProgress(calculatedProgress);
    
    if (calculatedProgress < 30) {
      setCurrentStep(0);
    } else if (calculatedProgress < 80) {
      setCurrentStep(1);
    } else {
      setCurrentStep(2);
    }

    if (completedFiles === totalFiles && totalFiles > 0) {
      setTimeout(() => {
        onComplete?.();
        navigate('/results');
      }, 1000);
    }
  }, [completedFiles, totalFiles, navigate, onComplete]);

  return (
    <div className="min-h-screen bg-gradient-subtle flex items-center justify-center p-4">
      <Card className="w-full max-w-md shadow-elegant animate-scale-in">
        <CardContent className="p-8 space-y-6">
          <div className="text-center space-y-2">
            <div className="w-16 h-16 mx-auto mb-4 relative">
              <div className="absolute inset-0 rounded-full bg-primary/20 animate-pulse"></div>
              <div className="absolute inset-2 rounded-full bg-primary/40 animate-pulse animation-delay-200"></div>
              <div className="absolute inset-4 rounded-full bg-primary animate-pulse animation-delay-400"></div>
            </div>
            <h2 className="text-2xl font-bold text-foreground">Evaluating CVs</h2>
            <p className="text-muted-foreground">
              Processing {totalFiles} candidate{totalFiles !== 1 ? 's' : ''}
            </p>
          </div>

          <div className="space-y-4">
            <div className="flex justify-between items-center text-sm">
              <span className="text-muted-foreground">Progress</span>
              <Badge variant="outline">
                {completedFiles}/{totalFiles}
              </Badge>
            </div>
            
            <Progress value={progress} className="h-3" />
            
            <div className="text-center text-sm font-medium">
              {Math.round(progress)}% Complete
            </div>
          </div>

          <div className="space-y-3">
            {steps.map((step, index) => {
              const Icon = step.icon;
              const isActive = index === currentStep;
              const isCompleted = index < currentStep;
              
              return (
                <div
                  key={index}
                  className={`flex items-center space-x-3 p-3 rounded-lg transition-all duration-300 ${
                    isActive 
                      ? 'bg-primary/10 border border-primary/20' 
                      : isCompleted 
                      ? 'bg-success/10 border border-success/20' 
                      : 'bg-muted/50'
                  }`}
                >
                  <div className={`p-2 rounded-full ${
                    isActive 
                      ? 'bg-primary text-primary-foreground' 
                      : isCompleted 
                      ? 'bg-success text-success-foreground' 
                      : 'bg-muted text-muted-foreground'
                  }`}>
                    {isCompleted ? (
                      <CheckCircle className="w-4 h-4" />
                    ) : isActive ? (
                      <Icon className="w-4 h-4 animate-pulse" />
                    ) : (
                      <Clock className="w-4 h-4" />
                    )}
                  </div>
                  <div className="flex-1">
                    <div className={`font-medium ${
                      isActive ? 'text-primary' : isCompleted ? 'text-success' : 'text-muted-foreground'
                    }`}>
                      {step.label}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {step.description}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {currentFile && (
            <div className="text-center text-sm text-muted-foreground">
              Currently processing: <span className="font-medium">{currentFile}</span>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default LoadingPage;