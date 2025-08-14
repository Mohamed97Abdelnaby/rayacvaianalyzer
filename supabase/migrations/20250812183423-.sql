-- Create table for CV evaluation prompts
CREATE TABLE public.cv_evaluation_prompts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  prompt_type TEXT NOT NULL,
  prompt_text TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE public.cv_evaluation_prompts ENABLE ROW LEVEL SECURITY;

-- Create policy to allow read access to all users
CREATE POLICY "CV evaluation prompts are viewable by everyone" 
ON public.cv_evaluation_prompts 
FOR SELECT 
USING (true);

-- Insert the three prompts
INSERT INTO public.cv_evaluation_prompts (prompt_type, prompt_text, description) VALUES
('extract_experience', 'Between the triple ticks you will be given a CV text extracted from PDF, Please extract the candidate work experience' || E'\n' || ''''''{CVText}''''''', 'Extracts work experience from CV text'),
('calculate_experience_years', 'Between the triple ticks you will be given a job candidate work experience, Please calculate the number of years of experience' || E'\n' || ''''''{WorkExperience}''''''', 'Calculates total years of experience from work experience text'),
('evaluate_candidate', 'Evaluate the candidate who has {YearsOfExperience} years of experience with the CV given between the triple ticks using the following criterias: {criteriaString}' || E'\n' || ''''''{CVText}''''''', 'Evaluates candidate against specified criteria');

-- Create function to update timestamps
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for automatic timestamp updates
CREATE TRIGGER update_cv_evaluation_prompts_updated_at
BEFORE UPDATE ON public.cv_evaluation_prompts
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();