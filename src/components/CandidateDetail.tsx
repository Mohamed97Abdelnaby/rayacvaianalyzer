import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import { 
  FileText, 
  Award, 
  TrendingUp, 
  TrendingDown, 
  Lightbulb, 
  Copy,
  Download,
  Star,
  CheckCircle,
  XCircle,
  AlertCircle
} from 'lucide-react';
import { CVFile, EvaluationCriteria } from '@/contexts/ResultsContext';

interface CandidateDetailProps {
  candidate: CVFile;
  criteria: EvaluationCriteria[];
  enableATS: boolean;
}

const CandidateDetail: React.FC<CandidateDetailProps> = ({ 
  candidate, 
  criteria, 
  enableATS 
}) => {
  const { toast } = useToast();

  const getScoreColor = (score: number) => {
    if (score >= 80) return 'text-success';
    if (score >= 60) return 'text-warning';
    return 'text-destructive';
  };

  const copyToClipboard = (text: string, type: string) => {
    navigator.clipboard.writeText(text);
    toast({
      title: "Copied to clipboard",
      description: `${type} copied successfully`,
    });
  };

  const exportCandidate = () => {
    const exportData = {
      name: candidate.name.replace(/\.[^/.]+$/, ""),
      score: candidate.llmScore,
      atsScore: candidate.atsScore,
      approved: candidate.isApproved,
      experience: candidate.yearsOfExperience,
      justification: candidate.justification,
      strengths: candidate.strengths,
      weaknesses: candidate.weaknesses,
      recommendations: candidate.recommendations,
      detailedScores: candidate.detailedScores,
    };

    const blob = new Blob([JSON.stringify(exportData, null, 2)], { 
      type: 'application/json' 
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${candidate.name.replace(/\.[^/.]+$/, "")}_evaluation.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    toast({
      title: "Export successful",
      description: "Candidate evaluation exported successfully",
    });
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <Card className="shadow-medium">
        <CardHeader>
          <div className="flex items-start justify-between">
            <div className="space-y-2">
              <CardTitle className="text-2xl flex items-center space-x-2">
                <FileText className="w-6 h-6 text-primary" />
                <span>{candidate.name.replace(/\.[^/.]+$/, "")}</span>
              </CardTitle>
              <div className="flex items-center space-x-3">
                <Badge variant="outline">
                  {candidate.yearsOfExperience || 'N/A'} years experience
                </Badge>
                <Badge 
                  variant={candidate.isApproved ? "default" : "destructive"}
                  className={candidate.isApproved ? "bg-success text-white" : ""}
                >
                  {candidate.isApproved ? "Approved" : "Not Approved"}
                </Badge>
              </div>
            </div>
            <Button onClick={exportCandidate} variant="outline">
              <Download className="w-4 h-4 mr-2" />
              Export
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-4">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium">Overall Score</span>
                  <span className={`text-2xl font-bold ${getScoreColor(candidate.llmScore!)}`}>
                    {candidate.llmScore}%
                  </span>
                </div>
                <Progress value={candidate.llmScore} className="h-3" />
              </div>
              
              {enableATS && candidate.atsScore && (
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium">ATS Score</span>
                    <span className={`text-xl font-bold ${getScoreColor(candidate.atsScore)}`}>
                      {candidate.atsScore}%
                    </span>
                  </div>
                  <Progress value={candidate.atsScore} className="h-2" />
                </div>
              )}
            </div>

            {candidate.detailedScores && (
              <div className="space-y-3">
                <h4 className="font-medium flex items-center space-x-2">
                  <Star className="w-4 h-4 text-warning" />
                  <span>Criteria Scores</span>
                </h4>
                {Object.entries(candidate.detailedScores).map(([criteriaId, score]) => {
                  const criterion = criteria.find(c => c.id === criteriaId);
                  if (!criterion) return null;
                  
                  return (
                    <div key={criteriaId} className="space-y-1">
                      <div className="flex items-center justify-between text-sm">
                        <span className="truncate">{criterion.text}</span>
                        <span className={`font-medium ${getScoreColor(score)}`}>
                          {score}%
                        </span>
                      </div>
                      <Progress value={score} className="h-1" />
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Detailed Analysis */}
      <Tabs defaultValue="analysis" className="w-full">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="analysis">Analysis</TabsTrigger>
          <TabsTrigger value="criteria">Criteria</TabsTrigger>
        </TabsList>

        <TabsContent value="analysis">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <Award className="w-5 h-5 text-primary" />
                <span>Evaluation Summary</span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div>
                  <h4 className="font-medium mb-2">Justification</h4>
                  <p className="text-muted-foreground leading-relaxed">
                    {candidate.justification || 'No justification available.'}
                  </p>
                </div>
                
                {candidate.recommendations && candidate.recommendations.length > 0 && (
                  <div>
                    <h4 className="font-medium mb-2 flex items-center space-x-2">
                      <Lightbulb className="w-4 h-4 text-warning" />
                      <span>Recommendations</span>
                    </h4>
                    <ul className="space-y-2">
                      {candidate.recommendations.map((rec, index) => (
                        <li key={index} className="flex items-start space-x-2">
                          <span className="w-2 h-2 bg-primary rounded-full mt-2 flex-shrink-0"></span>
                          <span className="text-muted-foreground">{rec}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="criteria">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <AlertCircle className="w-5 h-5 text-primary" />
                <span>Criteria Evaluation</span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {candidate.criteriaEvaluations && candidate.criteriaEvaluations.length > 0 ? (
                <div className="space-y-4">
                  {candidate.criteriaEvaluations.map((evaluation, index) => (
                    <div key={evaluation.criterionId} className="border rounded-lg p-4 space-y-3">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <h4 className="font-medium text-foreground mb-2">
                            {evaluation.criterionText}
                          </h4>
                          <div className="flex items-center space-x-2">
                            {evaluation.isMet ? (
                              <CheckCircle className="w-5 h-5 text-success flex-shrink-0" />
                            ) : (
                              <XCircle className="w-5 h-5 text-destructive flex-shrink-0" />
                            )}
                            <Badge 
                              variant={evaluation.isMet ? "default" : "destructive"}
                              className={evaluation.isMet ? "bg-success text-white" : ""}
                            >
                              {evaluation.isMet ? "MET" : "NOT MET"}
                            </Badge>
                            <span className={`text-sm font-medium ${getScoreColor(evaluation.score)}`}>
                              {evaluation.score}%
                            </span>
                          </div>
                        </div>
                      </div>
                       <div>
                         <h5 className="text-sm font-medium text-muted-foreground mb-1">Assessment Evidence:</h5>
                         <p className="text-sm text-foreground leading-relaxed">
                           {evaluation.justification}
                         </p>
                       </div>
                      <Progress value={evaluation.score} className="h-2" />
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  <AlertCircle className="w-12 h-12 mx-auto mb-4 opacity-50" />
                  <p>No criteria evaluation available</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>


      </Tabs>
    </div>
  );
};

export default CandidateDetail;