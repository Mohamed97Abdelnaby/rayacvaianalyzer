-- Fix critical security issues

-- 1. Drop the overly permissive RLS policy that allows everyone to view CV evaluation prompts
DROP POLICY IF EXISTS "CV evaluation prompts are viewable by everyone" ON public.cv_evaluation_prompts;

-- 2. Create a restrictive policy that only allows edge functions to access prompts
-- Edge functions run with service role, so we'll allow service role access only
CREATE POLICY "CV evaluation prompts are only accessible by edge functions" 
ON public.cv_evaluation_prompts 
FOR SELECT 
USING (auth.role() = 'service_role');

-- 3. Fix the function security path vulnerability in update_updated_at_column
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER 
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = ''
AS $function$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$function$;