import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { Mail, Send, Loader2 } from 'lucide-react';
import { CVFile, EvaluationCriteria } from '@/contexts/ResultsContext';
import { supabase } from '@/integrations/supabase/client';

interface EmailDialogProps {
  candidates: CVFile[];
  criteria: EvaluationCriteria[];
  trigger?: React.ReactNode;
}

const EmailDialog: React.FC<EmailDialogProps> = ({ candidates, criteria, trigger }) => {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [subject, setSubject] = useState(`CV Evaluation Results - ${candidates.length} Candidates`);
  const [message, setMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();

  const handleSendEmail = async () => {
    if (!email.trim()) {
      toast({
        title: "Email Required",
        description: "Please enter a recipient email address.",
        variant: "destructive",
      });
      return;
    }

    if (!email.includes('@')) {
      toast({
        title: "Invalid Email",
        description: "Please enter a valid email address.",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);

    try {
      const candidateData = candidates
        .filter(c => c.status === 'completed')
        .map(candidate => ({
          name: candidate.name.replace(/\.[^/.]+$/, ""),
          score: candidate.llmScore || 0,
          atsScore: candidate.atsScore,
          approved: candidate.isApproved || false,
          experience: candidate.yearsOfExperience,
          justification: candidate.justification,
          strengths: candidate.strengths,
          weaknesses: candidate.weaknesses,
          recommendations: candidate.recommendations,
        }));

      const { data, error } = await supabase.functions.invoke('send-evaluation-results', {
        body: {
          to: email,
          subject: subject,
          candidates: candidateData,
          criteria: criteria,
          customMessage: message,
        },
      });

      if (error) throw error;

      toast({
        title: "Email Sent Successfully",
        description: `Evaluation results sent to ${email}`,
      });

      setOpen(false);
      setEmail('');
      setMessage('');
    } catch (error) {
      console.error('Email error:', error);
      toast({
        title: "Failed to Send Email",
        description: "There was an error sending the email. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger || (
          <Button variant="outline" size="sm">
            <Mail className="w-4 h-4 mr-2" />
            Send via Email
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Send Evaluation Results</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label htmlFor="email">Recipient Email</Label>
            <Input
              id="email"
              type="email"
              placeholder="Enter email address"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1"
            />
          </div>
          
          <div>
            <Label htmlFor="subject">Subject</Label>
            <Input
              id="subject"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              className="mt-1"
            />
          </div>
          
          <div>
            <Label htmlFor="message">Additional Message (Optional)</Label>
            <Textarea
              id="message"
              placeholder="Add a personal message..."
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={3}
              className="mt-1"
            />
          </div>
          
          <div className="bg-muted/50 p-3 rounded-lg">
            <p className="text-sm text-muted-foreground">
              This will send a detailed report including:
            </p>
            <ul className="text-xs text-muted-foreground mt-1 space-y-1">
              <li>• Summary of {candidates.filter(c => c.status === 'completed').length} candidates</li>
              <li>• Individual scores and approval status</li>
              <li>• Evaluation criteria and justifications</li>
              <li>• Strengths, weaknesses, and recommendations</li>
            </ul>
          </div>
          
          <div className="flex justify-end space-x-2">
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSendEmail} disabled={isLoading}>
              {isLoading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Sending...
                </>
              ) : (
                <>
                  <Send className="w-4 h-4 mr-2" />
                  Send Email
                </>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default EmailDialog;