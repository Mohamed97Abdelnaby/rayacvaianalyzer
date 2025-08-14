import React, { useState, useCallback, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Upload, FileText, Archive, FolderOpen, Plus, X, Star, CheckCircle, XCircle, BarChart3, Zap, Settings, Download, Eye, ArrowRight } from 'lucide-react';
import { useResults, CVFile, EvaluationCriteria } from '@/contexts/ResultsContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Separator } from '@/components/ui/separator';
import { useToast } from '@/hooks/use-toast';
import { ChatBot } from '@/components/ChatBot/ChatBot';
import { supabase } from '@/integrations/supabase/client';
import * as XLSX from 'xlsx';

interface ExcelData {
  headers: string[];
  rows: any[][];
  sheetName: string;
}

const CVEvaluationPlatform = () => {
  const navigate = useNavigate();
  const { 
    cvFiles, 
    setCvFiles, 
    criteria, 
    setCriteria, 
    overallScore, 
    setOverallScore, 
    enableATS, 
    setEnableATS 
  } = useResults();
  
  const [newCriterion, setNewCriterion] = useState('');
  const [isEvaluating, setIsEvaluating] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [chatBotOpen, setChatBotOpen] = useState(false);
  const [showSuccessToast, setShowSuccessToast] = useState<string | null>(null);
  const { toast } = useToast();
  
  // Refs for UI actions
  const fileInputRef = useRef<HTMLInputElement>(null);
  const criteriaInputRef = useRef<HTMLTextAreaElement>(null);

  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    const files = Array.from(e.dataTransfer.files);
    handleFiles(files);
  }, []);

  const parseExcelFile = async (file: File): Promise<ExcelData | null> => {
    try {
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: 'array' });
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
      
      if (jsonData.length === 0) return null;
      
      const headers = jsonData[0] as string[];
      const rows = jsonData.slice(1) as any[][];
      
      return {
        headers,
        rows,
        sheetName
      };
    } catch (error) {
      console.error('Error parsing Excel file:', error);
      return null;
    }
  };

  // Convert file to base64
  const convertFileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => {
        const result = reader.result as string;
        // Remove data URL prefix to get pure base64
        const base64 = result.split(',')[1];
        resolve(base64);
      };
      reader.onerror = reject;
    });
  };

  // Extract text from file using Azure Document Intelligence
  const extractTextFromFile = async (cvFile: CVFile): Promise<string | undefined> => {
    try {
      setCvFiles((prev: CVFile[]) => prev.map((f: CVFile) => 
        f.id === cvFile.id 
          ? { ...f, extractionStatus: 'extracting' }
          : f
      ));

      const base64Data = await convertFileToBase64(cvFile.file);
      
      console.log('Starting Azure Document Intelligence extraction for:', cvFile.name);
      
      const { data: azureResponse, error: azureError } = await supabase.functions.invoke('extract-cv-with-azure', {
        body: {
          fileName: cvFile.name,
          fileType: cvFile.file.type,
          fileData: base64Data
        }
      });

      if (azureError) {
        console.error('Azure extraction error:', azureError);
        throw new Error(`Azure extraction failed: ${azureError.message}`);
      }

      if (azureResponse?.success && azureResponse?.extractedText) {
        console.log('Azure extraction successful, text length:', azureResponse.extractedText.length);
        
        setCvFiles((prev: CVFile[]) => prev.map((f: CVFile) => 
          f.id === cvFile.id 
            ? { 
                ...f, 
                extractionStatus: 'completed',
                extractedText: azureResponse.extractedText
              }
            : f
        ));
        
        return azureResponse.extractedText;
      } else {
        throw new Error('Azure extraction returned no text');
      }
    } catch (error) {
      console.error('File extraction error:', error);
      setCvFiles((prev: CVFile[]) => prev.map((f: CVFile) => 
        f.id === cvFile.id 
          ? { ...f, extractionStatus: 'error' }
          : f
      ));
      throw error;
    }
  };

  const evaluateCV = async (cvFile: CVFile, extractedText?: string): Promise<void> => {
    const textToUse = extractedText || cvFile.extractedText;
    if (!textToUse) return;

    try {
      setCvFiles((prev: CVFile[]) => prev.map((f: CVFile) => 
        f.id === cvFile.id 
          ? { ...f, status: 'evaluating' }
          : f
      ));

      const { data: response, error } = await supabase.functions.invoke('evaluate-cv', {
        body: {
          extractedText: textToUse,
          criteria,
          enableATS,
          overallScore
        }
      });

      if (error) throw new Error(error.message);

      if (response?.success) {
        setCvFiles((prev: CVFile[]) => prev.map((f: CVFile) => 
          f.id === cvFile.id 
            ? { 
                ...f, 
                status: 'completed',
                isApproved: response.isApproved,
                justification: response.justification,
                llmScore: response.llmScore,
                atsScore: response.atsScore,
                yearsOfExperience: response.yearsOfExperience,
                detailedScores: response.detailedScores,
                criteriaEvaluations: response.criteriaEvaluations,
                strengths: response.strengths,
                weaknesses: response.weaknesses,
                recommendations: response.recommendations
              }
            : f
        ));
      } else {
        throw new Error(response?.error || 'Evaluation failed');
      }
    } catch (error) {
      console.error('Error evaluating CV:', error);
      setCvFiles((prev: CVFile[]) => prev.map((f: CVFile) => 
        f.id === cvFile.id 
          ? { ...f, status: 'error' }
          : f
      ));
      throw error;
    }
  };

  const handleFiles = async (files: File[]) => {
    const newFiles: CVFile[] = [];
    
    for (const file of files) {
      if (file.type === 'application/pdf' || 
          file.type === 'application/msword' || 
          file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
          file.type === 'application/zip' ||
          file.type === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
          file.type === 'application/vnd.ms-excel' ||
          file.type.startsWith('image/')) {
        
        const newFile: CVFile = {
          id: Math.random().toString(36).substr(2, 9),
          name: file.name,
          file,
          status: 'uploading',
          extractionStatus: 'pending'
        };
        newFiles.push(newFile);
      }
    }

    setCvFiles((prev: CVFile[]) => [...prev, ...newFiles.map((f: CVFile) => ({ ...f, status: 'uploaded' as const }))]);
    
    if (newFiles.length > 0) {
      toast({
        title: "Files uploaded successfully",
        description: `${newFiles.length} file(s) added for evaluation`,
      });
    }
  };

  const addCriterion = () => {
    if (newCriterion.trim()) {
      const criterion: EvaluationCriteria = {
        id: Math.random().toString(36).substr(2, 9),
        text: newCriterion.trim(),
        isMandatory: false,
        weight: 1
      };
      setCriteria((prev: EvaluationCriteria[]) => [...prev, criterion]);
      setNewCriterion('');
    }
  };

  const removeCriterion = (id: string) => {
    setCriteria((prev: EvaluationCriteria[]) => prev.filter((c: EvaluationCriteria) => c.id !== id));
  };

  const updateCriterion = (id: string, updates: Partial<EvaluationCriteria>) => {
    setCriteria((prev: EvaluationCriteria[]) => prev.map((c: EvaluationCriteria) => c.id === id ? { ...c, ...updates } : c));
  };

  const startEvaluation = async () => {
    if (cvFiles.length === 0) {
      toast({
        title: "No files selected",
        description: "Please upload CV files before starting evaluation",
        variant: "destructive"
      });
      return;
    }

    if (criteria.length === 0) {
      toast({
        title: "No criteria defined",
        description: "Please add evaluation criteria before starting",
        variant: "destructive"
      });
      return;
    }

    setIsEvaluating(true);
    
    // Navigate to loading page first
    navigate('/loading');

    try {
      // Process each file sequentially: extract then evaluate
      for (const file of cvFiles) {
        try {
          let extractedText = file.extractedText;
          
          // Step 1: Extract text if not already extracted
          if (!extractedText && file.extractionStatus !== 'completed') {
            extractedText = await extractTextFromFile(file);
          }

          // Step 2: Evaluate with the extracted text
          if (extractedText) {
            await evaluateCV(file, extractedText);
          } else {
            console.warn(`Skipping evaluation for ${file.name} - no extracted text available`);
          }
        } catch (fileError) {
          console.error(`Error processing file ${file.name}:`, fileError);
          // Continue with next file even if this one fails
        }
      }

      const completedFiles = cvFiles.filter(f => f.status === 'completed').length;
      
      toast({
        title: "Evaluation completed",
        description: `Successfully evaluated ${completedFiles} out of ${cvFiles.length} CVs`,
      });

      // Navigate to results after completion
      navigate('/results');
    } catch (error) {
      console.error('Evaluation error:', error);
      toast({
        title: "Evaluation failed",
        description: "Some files could not be processed. Please try again.",
        variant: "destructive"
      });
    } finally {
      setIsEvaluating(false);
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  // Handle chatbot actions
  const handleChatBotAction = (action: any) => {
    switch (action.type) {
      case 'enable-ats':
        setEnableATS(true);
        setShowSuccessToast('ATS evaluation enabled');
        break;
      case 'disable-ats':
        setEnableATS(false);
        setShowSuccessToast('ATS evaluation disabled');
        break;
      case 'focus-criteria':
        criteriaInputRef.current?.focus();
        setShowSuccessToast('Criteria input focused');
        break;
      case 'add-criteria':
        if (action.criteriaText) {
          const criterion: EvaluationCriteria = {
            id: Math.random().toString(36).substr(2, 9),
            text: action.criteriaText,
            isMandatory: action.isMandatory || false,
            weight: action.weight || 1
          };
          setCriteria((prev: EvaluationCriteria[]) => [...prev, criterion]);
          setShowSuccessToast(`Added criteria: ${action.criteriaText}`);
        }
        break;
      case 'open-uploader':
        fileInputRef.current?.click();
        setShowSuccessToast('File uploader opened');
        break;
      case 'start-evaluation':
        if (cvFiles.length > 0 && criteria.length > 0) {
          startEvaluation();
          setShowSuccessToast('Evaluation started');
        } else {
          setShowSuccessToast('Please upload files and add criteria first');
        }
        break;
      case 'show-results':
        navigate('/results');
        setShowSuccessToast('Navigating to results');
        break;
    }
  };

  // Clear success toast after 3 seconds
  useEffect(() => {
    if (showSuccessToast) {
      const timer = setTimeout(() => setShowSuccessToast(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [showSuccessToast]);

  // Get context for chatbot
  const getChatBotContext = () => {
    return `Platform state: ${cvFiles.length} files uploaded, ${criteria.length} criteria defined, ATS ${enableATS ? 'enabled' : 'disabled'}, ${isEvaluating ? 'currently evaluating' : 'ready for evaluation'}`;
  };

  return (
    <div className={`min-h-screen bg-gradient-subtle p-6 transition-all duration-300 ${chatBotOpen ? 'lg:mr-80 xl:mr-96' : ''}`}>
      <div className="max-w-7xl mx-auto space-y-8">
        
        {/* Success Toast */}
        {showSuccessToast && (
          <div className="fixed top-4 right-4 bg-success text-success-foreground px-4 py-2 rounded-lg shadow-lg z-50 animate-fade-in">
            {showSuccessToast}
          </div>
        )}

        {/* Header */}
        <div className="text-center space-y-4 animate-fade-in">
          <div className="inline-flex items-center space-x-2 px-4 py-2 bg-gradient-primary rounded-full text-primary-foreground shadow-glow">
            <BarChart3 className="w-5 h-5" />
            <span className="font-semibold">CV Evaluation Platform</span>
          </div>
          <h1 className="text-4xl font-bold bg-gradient-hero bg-clip-text text-transparent">
            Smart CV Analysis & Scoring
          </h1>
          <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
            Upload multiple CVs and define custom criteria for intelligent evaluation using AI-powered analysis
          </p>
        </div>

        <div className="grid lg:grid-cols-3 gap-8">
          {/* Upload Section */}
          <div className="lg:col-span-2 space-y-6">
            <Card className="shadow-medium hover-lift animate-slide-up">
              <CardHeader>
                <CardTitle className="flex items-center space-x-2">
                  <Upload className="w-5 h-5 text-primary" />
                  <span>Upload CVs</span>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Drag and Drop Area */}
                <div
                  className={`border-2 border-dashed rounded-lg p-8 text-center transition-all duration-300 hover-glow cursor-pointer
                    ${dragActive ? 'border-primary bg-primary/5 shadow-glow' : 'border-border hover:border-primary/50'}
                  `}
                  onDragEnter={handleDrag}
                  onDragLeave={handleDrag}
                  onDragOver={handleDrag}
                  onDrop={handleDrop}
                  onClick={() => fileInputRef.current?.click()}
                >
                  <div className="space-y-4">
                    <div className="flex justify-center space-x-4">
                      <div className="p-3 bg-primary/10 rounded-full">
                        <FileText className="w-8 h-8 text-primary" />
                      </div>
                      <div className="p-3 bg-accent/10 rounded-full">
                        <Archive className="w-8 h-8 text-accent" />
                      </div>
                      <div className="p-3 bg-success/10 rounded-full">
                        <FolderOpen className="w-8 h-8 text-success" />
                      </div>
                    </div>
                    <div>
                      <p className="text-lg font-semibold">Drop files here or click to browse</p>
                      <p className="text-muted-foreground">
                        Supports PDF, DOC, DOCX, Excel files, images and ZIP archives
                      </p>
                    </div>
                  </div>
                  <input
                    ref={fileInputRef}
                    type="file"
                    multiple
                    accept=".pdf,.doc,.docx,.zip,.xlsx,.xls,.jpg,.jpeg,.png,.gif,.bmp,.tiff"
                    className="hidden"
                    onChange={(e) => handleFiles(Array.from(e.target.files || []))}
                  />
                </div>

                {/* Uploaded Files */}
                {cvFiles.length > 0 && (
                  <div className="space-y-3">
                    <h3 className="font-semibold flex items-center space-x-2">
                      <FileText className="w-4 h-4" />
                      <span>Uploaded Files ({cvFiles.length})</span>
                    </h3>
                    <div className="space-y-2 max-h-64 overflow-y-auto">
                      {cvFiles.map((file) => (
                        <div key={file.id} className="flex items-center justify-between p-3 bg-card rounded-lg shadow-soft">
                          <div className="flex items-center space-x-3">
                            <FileText className="w-5 h-5 text-primary" />
                            <div>
                              <p className="font-medium">{file.name}</p>
                              <p className="text-sm text-muted-foreground">
                                {file.file.size ? formatFileSize(file.file.size) : 'Unknown size'}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center space-x-3">
                            <div className="flex flex-col items-end space-y-1">
                              {file.extractionStatus && file.extractionStatus !== 'pending' && (
                                <Badge variant={
                                  file.extractionStatus === 'completed' ? 'default' :
                                  file.extractionStatus === 'extracting' ? 'secondary' :
                                  file.extractionStatus === 'error' ? 'destructive' : 'outline'
                                } className="text-xs">
                                  {file.extractionStatus === 'extracting' ? 'Extracting' : 
                                   file.extractionStatus === 'completed' ? 'Text extracted' :
                                   file.extractionStatus === 'error' ? 'Extract failed' : file.extractionStatus}
                                </Badge>
                              )}
                              <Badge variant={
                                file.status === 'completed' ? 'default' :
                                file.status === 'evaluating' ? 'secondary' :
                                file.status === 'error' ? 'destructive' : 'outline'
                              }>
                                {file.status}
                              </Badge>
                            </div>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setCvFiles((prev: CVFile[]) => prev.filter((f: CVFile) => f.id !== file.id))}
                            >
                              <X className="w-4 h-4" />
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Results Preview */}
            {cvFiles.some(f => f.status === 'completed') && (
              <Card className="shadow-medium hover-lift animate-scale-in">
                <CardHeader>
                  <CardTitle className="flex items-center justify-between">
                    <div className="flex items-center space-x-2">
                      <BarChart3 className="w-5 h-5 text-primary" />
                      <span>Evaluation Complete</span>
                    </div>
                    <Button 
                      onClick={() => navigate('/results')}
                      className="bg-gradient-primary hover-glow"
                    >
                      View Results
                      <ArrowRight className="w-4 h-4 ml-2" />
                    </Button>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="text-center p-4 bg-primary/5 rounded-lg">
                      <div className="text-2xl font-bold text-primary">
                        {cvFiles.filter(f => f.status === 'completed').length}
                      </div>
                      <div className="text-sm text-muted-foreground">Evaluated</div>
                    </div>
                    <div className="text-center p-4 bg-success/5 rounded-lg">
                      <div className="text-2xl font-bold text-success">
                        {cvFiles.filter(f => f.isApproved).length}
                      </div>
                      <div className="text-sm text-muted-foreground">Approved</div>
                    </div>
                    <div className="text-center p-4 bg-warning/5 rounded-lg">
                      <div className="text-2xl font-bold text-warning">
                        {cvFiles.filter(f => f.status === 'completed').length > 0 
                          ? Math.round(cvFiles.filter(f => f.status === 'completed')
                              .reduce((sum, f) => sum + (f.llmScore || 0), 0) / 
                              cvFiles.filter(f => f.status === 'completed').length)
                          : 0}%
                      </div>
                      <div className="text-sm text-muted-foreground">Avg Score</div>
                    </div>
                  </div>
                  <div className="mt-4 text-center">
                    <p className="text-sm text-muted-foreground mb-3">
                      Click "View Results" to see detailed analysis for each candidate
                    </p>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>

          {/* Criteria & Settings */}
          <div className="space-y-6">
            <Card className="shadow-medium hover-lift animate-slide-up">
              <CardHeader>
                <CardTitle className="flex items-center space-x-2">
                  <Settings className="w-5 h-5 text-primary" />
                  <span>Evaluation Criteria</span>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Add Criterion */}
                <div className="space-y-2">
                  <Textarea
                    ref={criteriaInputRef}
                    placeholder="Enter evaluation criterion (e.g., 'Bachelor's degree in Computer Science')"
                    value={newCriterion}
                    onChange={(e) => setNewCriterion(e.target.value)}
                    className="min-h-[80px]"
                  />
                  <Button onClick={addCriterion} className="w-full bg-gradient-primary hover-glow">
                    <Plus className="w-4 h-4 mr-2" />
                    Add Criterion
                  </Button>
                </div>

                {/* Criteria List */}
                {criteria.length > 0 && (
                  <div className="space-y-3">
                    <h4 className="font-semibold">Criteria ({criteria.length})</h4>
                    <div className="space-y-2 max-h-96 overflow-y-auto">
                      {criteria.map((criterion) => (
                        <div key={criterion.id} className="p-3 bg-secondary rounded-lg space-y-3">
                          <div className="flex items-start justify-between">
                            <p className="text-sm flex-1">{criterion.text}</p>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => removeCriterion(criterion.id)}
                            >
                              <X className="w-4 h-4" />
                            </Button>
                          </div>
                          
                          <div className="flex items-center justify-between">
                            <div className="flex items-center space-x-2">
                              <Switch
                                checked={criterion.isMandatory}
                                onCheckedChange={(checked) => updateCriterion(criterion.id, { isMandatory: checked })}
                              />
                              <Label className="text-xs">Mandatory</Label>
                              {criterion.isMandatory && <Star className="w-3 h-3 text-warning" />}
                            </div>
                            
                            <div className="flex items-center space-x-2">
                              <Label className="text-xs">Weight:</Label>
                              <Input
                                type="number"
                                min="1"
                                max="5"
                                value={criterion.weight}
                                onChange={(e) => updateCriterion(criterion.id, { weight: Number(e.target.value) })}
                                className="w-16 h-8 text-xs"
                              />
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <Separator />

                {/* Overall Score Target */}
                <div className="p-3 bg-secondary rounded-lg space-y-3">
                  <Label className="font-semibold flex items-center space-x-2">
                    <Star className="w-4 h-4 text-warning" />
                    <span>Overall Score Target</span>
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    Set the target score threshold for evaluation
                  </p>
                  <div className="flex items-center space-x-3">
                    <Input
                      type="number"
                      min="0"
                      max="100"
                      value={overallScore}
                      onChange={(e) => setOverallScore(Number(e.target.value))}
                      className="w-20 text-center"
                    />
                    <span className="text-sm text-muted-foreground">%</span>
                    <div className="flex-1">
                      <Progress value={overallScore} className="h-2" />
                    </div>
                  </div>
                </div>

                <Separator />

                {/* ATS Toggle */}
                <div className="flex items-center justify-between p-3 bg-secondary rounded-lg">
                  <div className="space-y-1">
                    <Label className="font-semibold flex items-center space-x-2">
                      <Zap className="w-4 h-4 text-accent" />
                      <span>ATS Evaluation</span>
                    </Label>
                    <p className="text-xs text-muted-foreground">
                      Run additional ATS-style parsing and keyword matching
                    </p>
                  </div>
                  <Switch
                    checked={enableATS}
                    onCheckedChange={setEnableATS}
                  />
                </div>

                {/* Start Evaluation */}
                <Button 
                  onClick={startEvaluation}
                  disabled={isEvaluating || cvFiles.length === 0 || criteria.length === 0}
                  className="w-full bg-gradient-primary hover-glow shadow-medium"
                  size="lg"
                >
                  {isEvaluating ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                      Evaluating...
                    </>
                  ) : (
                    <>
                      <BarChart3 className="w-4 h-4 mr-2" />
                      Start Evaluation
                    </>
                  )}
                </Button>
              </CardContent>
            </Card>

            {/* Quick Stats */}
            {cvFiles.length > 0 && (
              <Card className="shadow-medium animate-bounce-soft">
                <CardContent className="pt-6">
                  <div className="grid grid-cols-2 gap-4 text-center">
                    <div>
                      <p className="text-2xl font-bold text-primary">{cvFiles.length}</p>
                      <p className="text-sm text-muted-foreground">Total CVs</p>
                    </div>
                    <div>
                      <p className="text-2xl font-bold text-success">{cvFiles.filter(f => f.status === 'completed').length}</p>
                      <p className="text-sm text-muted-foreground">Evaluated</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </div>
      <ChatBot
        onAction={handleChatBotAction}
        isOpen={chatBotOpen}
        onToggle={setChatBotOpen}
        context={getChatBotContext()}
      />
    </div>
  );
};

export default CVEvaluationPlatform;