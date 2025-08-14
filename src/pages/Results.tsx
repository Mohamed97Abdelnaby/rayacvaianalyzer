import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { SidebarProvider } from '@/components/ui/sidebar';
import CandidateDetail from '@/components/CandidateDetail';
import { useResults } from '@/contexts/ResultsContext';
import { 
  ArrowLeft, 
  Users, 
  Search, 
  Filter, 
  Download,
  FileText,
  CheckCircle,
  XCircle,
  Trophy,
  Target
} from 'lucide-react';

const Results: React.FC = () => {
  const { candidateId } = useParams();
  const navigate = useNavigate();
  const { cvFiles, selectedCandidate, setSelectedCandidate, criteria, enableATS, overallScore } = useResults();
  
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState<'all' | 'approved' | 'rejected'>('all');
  const [sortBy, setSortBy] = useState<'score' | 'name' | 'experience'>('score');

  // Filter and sort candidates
  const filteredCandidates = cvFiles
    .filter(file => file.status === 'completed')
    .filter(file => {
      const matchesSearch = file.name.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesFilter = filterStatus === 'all' || 
        (filterStatus === 'approved' && file.isApproved) ||
        (filterStatus === 'rejected' && !file.isApproved);
      return matchesSearch && matchesFilter;
    })
    .sort((a, b) => {
      switch (sortBy) {
        case 'score':
          return (b.llmScore || 0) - (a.llmScore || 0);
        case 'name':
          return a.name.localeCompare(b.name);
        case 'experience':
          return (b.yearsOfExperience || 0) - (a.yearsOfExperience || 0);
        default:
          return 0;
      }
    });

  // Set selected candidate based on URL parameter or default to first
  useEffect(() => {
    if (candidateId) {
      const candidate = cvFiles.find(file => file.id === candidateId);
      if (candidate) {
        setSelectedCandidate(candidate);
      }
    } else if (filteredCandidates.length > 0 && !selectedCandidate) {
      setSelectedCandidate(filteredCandidates[0]);
    }
  }, [candidateId, cvFiles, filteredCandidates, selectedCandidate, setSelectedCandidate]);

  // Navigate to specific candidate
  const selectCandidate = (candidate: typeof cvFiles[0]) => {
    setSelectedCandidate(candidate);
    navigate(`/results/${candidate.id}`);
  };

  const getScoreColor = (score: number) => {
    if (score >= 80) return 'text-success';
    if (score >= 60) return 'text-warning';
    return 'text-destructive';
  };

  const approvedCount = filteredCandidates.filter(f => f.isApproved).length;
  const averageScore = filteredCandidates.length > 0 
    ? Math.round(filteredCandidates.reduce((sum, f) => sum + (f.llmScore || 0), 0) / filteredCandidates.length)
    : 0;

  const exportAllResults = () => {
    const exportData = filteredCandidates.map(candidate => ({
      name: candidate.name.replace(/\.[^/.]+$/, ""),
      score: candidate.llmScore,
      atsScore: candidate.atsScore,
      approved: candidate.isApproved,
      experience: candidate.yearsOfExperience,
      justification: candidate.justification,
    }));

    const blob = new Blob([JSON.stringify(exportData, null, 2)], { 
      type: 'application/json' 
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'cv_evaluation_results.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  if (cvFiles.length === 0) {
    return (
      <div className="min-h-screen bg-gradient-subtle flex items-center justify-center">
        <Card className="w-full max-w-md text-center">
          <CardContent className="p-8">
            <FileText className="w-16 h-16 mx-auto mb-4 text-muted-foreground" />
            <h2 className="text-xl font-semibold mb-2">No Results Available</h2>
            <p className="text-muted-foreground mb-4">
              No evaluation results found. Start by uploading and evaluating CVs.
            </p>
            <Button onClick={() => navigate('/')}>
              <ArrowLeft className="w-4 h-4 mr-2" />
              Go Back
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full bg-gradient-subtle">
        {/* Left Panel - Candidates List */}
        <div className="w-80 border-r bg-background/95 backdrop-blur-sm flex flex-col min-h-screen">
          <div className="p-4 border-b flex-shrink-0">
            <div className="flex items-center justify-between mb-4">
              <Button variant="ghost" size="sm" onClick={() => navigate('/')}>
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back
              </Button>
            </div>
            
            {/* Stats */}
            <div className="grid grid-cols-2 gap-3 mb-4">
              <Card className="p-3">
                <div className="flex items-center space-x-2">
                  <Users className="w-4 h-4 text-primary" />
                  <div>
                    <p className="text-sm font-medium">{filteredCandidates.length}</p>
                    <p className="text-xs text-muted-foreground">Candidates</p>
                  </div>
                </div>
              </Card>
              <Card className="p-3">
                <div className="flex items-center space-x-2">
                  <Trophy className="w-4 h-4 text-success" />
                  <div>
                    <p className="text-sm font-medium">{approvedCount}</p>
                    <p className="text-xs text-muted-foreground">Approved</p>
                  </div>
                </div>
              </Card>
            </div>

            <Card className="p-3 mb-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <Target className="w-4 h-4 text-primary" />
                  <span className="text-sm font-medium">Avg Score</span>
                </div>
                <span className={`font-bold ${getScoreColor(averageScore)}`}>
                  {averageScore}%
                </span>
              </div>
            </Card>

            <Button 
              onClick={exportAllResults} 
              variant="outline" 
              size="sm" 
              className="w-full mb-4"
            >
              <Download className="w-4 h-4 mr-2" />
              Export All
            </Button>
          </div>

          <div className="flex-1 overflow-hidden flex flex-col">
            {/* Filters */}
            <div className="p-4 border-b space-y-3 flex-shrink-0">
              <h3 className="font-medium text-sm">Filters & Search</h3>
              
              <div className="space-y-2">
                <Label className="text-xs">Search</Label>
                <div className="relative">
                  <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search candidates..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-8 h-9"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label className="text-xs">Filter</Label>
                <Select value={filterStatus} onValueChange={(value: any) => setFilterStatus(value)}>
                  <SelectTrigger className="h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Candidates</SelectItem>
                    <SelectItem value="approved">Approved Only</SelectItem>
                    <SelectItem value="rejected">Rejected Only</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label className="text-xs">Sort by</Label>
                <Select value={sortBy} onValueChange={(value: any) => setSortBy(value)}>
                  <SelectTrigger className="h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="score">Score</SelectItem>
                    <SelectItem value="name">Name</SelectItem>
                    <SelectItem value="experience">Experience</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Candidates List */}
            <div className="flex-1 overflow-auto">
              <div className="p-4">
                <h3 className="font-medium text-sm mb-3">Candidates ({filteredCandidates.length})</h3>
                <div className="space-y-2">
                  {filteredCandidates.map((candidate) => (
                    <button
                      key={candidate.id}
                      onClick={() => selectCandidate(candidate)}
                      className={`w-full p-3 rounded-lg border text-left transition-colors ${
                        selectedCandidate?.id === candidate.id 
                          ? 'bg-primary/10 border-primary/20' 
                          : 'hover:bg-muted/50 border-border'
                      }`}
                    >
                      <div className="flex items-start justify-between w-full">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center space-x-2 mb-1">
                            <FileText className="w-4 h-4 text-primary flex-shrink-0" />
                            <span className="font-medium truncate text-sm">
                              {candidate.name.replace(/\.[^/.]+$/, "")}
                            </span>
                          </div>
                          <div className="flex items-center justify-between">
                            <Badge 
                              variant={candidate.isApproved ? "default" : "destructive"}
                              className={`text-xs ${candidate.isApproved ? "bg-success" : ""}`}
                            >
                              {candidate.isApproved ? (
                                <CheckCircle className="w-3 h-3 mr-1" />
                              ) : (
                                <XCircle className="w-3 h-3 mr-1" />
                              )}
                              {candidate.isApproved ? "Approved" : "Rejected"}
                            </Badge>
                            <span className={`text-sm font-bold ${getScoreColor(candidate.llmScore!)}`}>
                              {candidate.llmScore}%
                            </span>
                          </div>
                          {candidate.yearsOfExperience && (
                            <div className="text-xs text-muted-foreground mt-1">
                              {candidate.yearsOfExperience} years exp.
                            </div>
                          )}
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Main Content */}
        <main className="flex-1 flex flex-col min-w-0">
          <div className="flex-1 p-6">
            {selectedCandidate ? (
              <CandidateDetail 
                candidate={selectedCandidate} 
                criteria={criteria}
                enableATS={enableATS}
              />
            ) : (
              <Card className="h-full flex items-center justify-center">
                <CardContent className="text-center">
                  <Users className="w-16 h-16 mx-auto mb-4 text-muted-foreground" />
                  <h3 className="text-lg font-semibold mb-2">Select a Candidate</h3>
                  <p className="text-muted-foreground">
                    Choose a candidate from the sidebar to view detailed evaluation results.
                  </p>
                </CardContent>
              </Card>
            )}
          </div>
        </main>
      </div>
    </SidebarProvider>
  );
};

export default Results;