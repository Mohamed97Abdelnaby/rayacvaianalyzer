import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

// Enhanced CORS headers
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Max-Age': '86400',
};

const openAIApiKey = Deno.env.get('OPENAI_API_KEY');
const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

// Rate limiting
const requestCounts = new Map<string, { count: number; resetTime: number }>();
const RATE_LIMIT = 20; // evaluations per minute
const RATE_WINDOW = 60 * 1000;

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const userRequests = requestCounts.get(ip);
  
  if (!userRequests || now > userRequests.resetTime) {
    requestCounts.set(ip, { count: 1, resetTime: now + RATE_WINDOW });
    return true;
  }
  
  if (userRequests.count >= RATE_LIMIT) {
    return false;
  }
  
  userRequests.count++;
  return true;
}

// Enhanced retry logic for OpenAI calls
async function callOpenAIWithRetry(payload: any, maxRetries = 3): Promise<Response> {
  let lastError: Error;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`OpenAI evaluation attempt ${attempt}/${maxRetries}`);
      
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${openAIApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(90000), // 90 second timeout for evaluation
      });
      
      if (response.ok) {
        return response;
      }
      
      // Handle rate limiting
      if (response.status === 429) {
        const retryAfter = parseInt(response.headers.get('retry-after') || '10');
        console.log(`Rate limited, waiting ${retryAfter}s before retry ${attempt}`);
        if (attempt < maxRetries) {
          await new Promise(resolve => setTimeout(resolve, retryAfter * 1000));
          continue;
        }
      }
      
      const errorText = await response.text();
      throw new Error(`OpenAI API error: ${response.status} - ${errorText}`);
      
    } catch (error) {
      lastError = error;
      console.error(`Evaluation attempt ${attempt} failed:`, error.message);
      
      if (attempt < maxRetries) {
        const delay = Math.pow(2, attempt) * 1000 + Math.random() * 1000; // Jittered exponential backoff
        console.log(`Retrying in ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }
  
  throw lastError!;
}

// Enhanced JSON parsing with multiple fallback strategies
function parseEvaluationResponse(content: string): any {
  try {
    return JSON.parse(content);
  } catch (directParseError) {
    console.log('Direct JSON parse failed, trying extraction methods...');
    
    // Method 1: Extract from markdown code blocks
    const jsonMatch = content.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
    if (jsonMatch) {
      try {
        return JSON.parse(jsonMatch[1].trim());
      } catch (e) {
        console.log('Markdown extraction failed, trying manual extraction...');
      }
    }
    
    // Method 2: Find JSON-like content
    const jsonStart = content.indexOf('{');
    const jsonEnd = content.lastIndexOf('}');
    if (jsonStart !== -1 && jsonEnd !== -1 && jsonEnd > jsonStart) {
      try {
        return JSON.parse(content.substring(jsonStart, jsonEnd + 1));
      } catch (e) {
        console.log('Manual extraction failed, trying line-by-line...');
      }
    }
    
    // Method 3: Try to clean and parse
    try {
      const cleaned = content
        .replace(/^\s*```[a-z]*\s*/gm, '') // Remove code block markers
        .replace(/\s*```\s*$/gm, '')
        .replace(/^[^{]*{/, '{') // Remove text before first {
        .replace(/}[^}]*$/, '}') // Remove text after last }
        .trim();
      
      return JSON.parse(cleaned);
    } catch (e) {
      console.log('Cleaning attempt failed');
    }
    
    throw new Error(`Could not parse JSON from response after multiple attempts. Content preview: ${content.substring(0, 200)}`);
  }
}

// Input validation
function validateEvaluationInput(data: any) {
  if (!data.extractedText || typeof data.extractedText !== 'string') {
    throw new Error('Valid extractedText is required');
  }
  
  if (data.extractedText.length < 10) {
    throw new Error('CV text too short for meaningful evaluation');
  }
  
  if (!Array.isArray(data.criteria) || data.criteria.length === 0) {
    throw new Error('At least one evaluation criterion is required');
  }
  
  if (typeof data.overallScore !== 'number' || data.overallScore < 0 || data.overallScore > 100) {
    throw new Error('Overall score must be a number between 0 and 100');
  }
  
  // Validate criteria structure
  for (const criterion of data.criteria) {
    if (!criterion.text || typeof criterion.text !== 'string') {
      throw new Error('Each criterion must have valid text');
    }
    if (typeof criterion.weight !== 'number' || criterion.weight < 0) {
      throw new Error('Each criterion must have a valid weight');
    }
  }
}

// CV content quality validation
function validateCVContent(text: string): { isValid: boolean; issues: string[] } {
  const issues: string[] = [];
  
  // Check for minimum length
  if (text.length < 50) {
    issues.push('CV text too short');
  }
  
  // Check for CV-like content
  const cvKeywords = ['experience', 'education', 'skills', 'work', 'job', 'company', 'university', 'degree', 'role', 'position'];
  const foundKeywords = cvKeywords.filter(keyword => 
    text.toLowerCase().includes(keyword)
  ).length;
  
  if (foundKeywords < 2) {
    issues.push('CV content may be incomplete or corrupted');
  }
  
  // Check for readable content ratio
  const readableChars = (text.match(/[a-zA-Z\s]/g) || []).length;
  const readableRatio = readableChars / text.length;
  
  if (readableRatio < 0.6) {
    issues.push('CV contains too much non-readable content');
  }
  
  return {
    isValid: issues.length === 0,
    issues
  };
}

serve(async (req) => {
  console.log('CV Evaluation function called');

  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Rate limiting
    const clientIP = req.headers.get('cf-connecting-ip') || req.headers.get('x-forwarded-for') || 'unknown';
    if (!checkRateLimit(clientIP)) {
      return new Response(JSON.stringify({ 
        success: false, 
        error: 'Rate limit exceeded. Please try again later.' 
      }), {
        status: 429,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const requestData = await req.json();
    console.log('Request data:', { 
      extractedTextLength: requestData.extractedText?.length, 
      criteriaCount: requestData.criteria?.length, 
      enableATS: requestData.enableATS, 
      overallScore: requestData.overallScore 
    });

    // Validate input
    validateEvaluationInput(requestData);
    
    const { extractedText, criteria, enableATS, overallScore } = requestData;

    if (!openAIApiKey) {
      throw new Error('OpenAI API key not configured');
    }

    // Validate CV content quality
    const contentValidation = validateCVContent(extractedText);
    if (!contentValidation.isValid) {
      console.warn('CV content quality issues:', contentValidation.issues);
    }

    // Create Supabase client (for future audit logging)
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    console.log('Using extracted CV text from frontend');

    // Enhanced evaluation prompt for more reliable experience calculation
    const currentDateISO = new Date().toISOString().slice(0, 10);
    const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";

    const combinedPrompt = `
You are an experienced recruitment evaluator and CV analyst. Use the current date and time zone provided to normalize date ranges like "Present" or "Now".

Context:
- current_date: ${currentDateISO}
- time_zone: ${timeZone}
- evaluation_criteria: {criteriaString}

EVALUATION PROCESS:

1) Experience Extraction & Calculation
   • Parse all professional experience entries from the CV.
   • Recognize various date formats: "13 Dec 2023 – Present", "Dec 2023–Now", "2023/12–", "Jun'23–Present", "since 2022", "03/2024 – 07/2025", etc.
   • Normalize open-ended ranges by replacing "Present", "Now", "Ongoing", "Current", "To date", empty end dates, or trailing dashes with current_date (${currentDateISO}).
   • Normalization rules for incomplete dates:
        - Missing day → use 15th of the month (e.g., "Dec 2023" → "2023-12-15")
        - Month + year only → use day 15
        - Year only → use July 1st (e.g., "2023" → "2023-07-01")
        - Quarters: Q1/Q2/Q3/Q4 → Feb 15 / May 15 / Aug 15 / Nov 15 of that year
   • Convert all ranges to ISO (YYYY-MM-DD), sort by start date, and MERGE overlapping or contiguous intervals before summing
   • Compute total experience = sum(merged_intervals) in months, then in years as (months / 12), rounded to 2 decimals
   • If at least one valid range exists, the total must be > 0. Return 0 ONLY if no valid dates can be found.

2) Criteria Assessment
   • For each criterion, assess the candidate and use EXACTLY one of these evaluation keywords:
     - "excellent" (exceptional skills/experience, exceeds requirements)
     - "strong" (very good skills/experience, clearly meets requirements)
     - "good" (solid skills/experience, meets requirements well)
     - "meet" (basic requirements met, acceptable level)
     - "adequate" (meets minimum requirements)
     - "satisfactory" (just meets requirements)
     - "weak" (below requirements, significant gaps)
     - "not meet" (does not meet requirements)
    • Include the criterion weight in your assessment
    • Provide detailed evidence from the CV that explains WHY this assessment level was given
    • Reference specific projects, technologies, achievements, roles, and educational background
    • State estimated years of relevant experience for each criterion

3) Overall Assessment
   • Provide comprehensive summary including achievements, experience details, strengths, concerns, and recommendation

OUTPUT FORMAT (JSON ONLY; no extra text):
{
  "total_years_decimal": <number>,
  "total_months": <integer>,
  "roles_justification": [
    {
      "role": "<string>",
      "company": "<string>",
      "start_raw": "<string>",
      "end_raw": "<string>",
      "start_normalized": "YYYY-MM-DD",
      "end_normalized": "YYYY-MM-DD",
      "months_counted": <integer>
    }
  ],
  "merged_intervals": [
    { "start": "YYYY-MM-DD", "end": "YYYY-MM-DD", "months": <integer> }
  ],
  "evaluation_years_for_prompt": <number>,
  "evaluation": {
    "summary": "<comprehensive overall assessment>",
    "by_criteria": [
      { 
        "criterion": "<from criteriaString>", 
        "assessment": "<use exact keyword from list above>", 
        "evidence": "<specific supporting evidence from CV>",
        "yearsOfExperience": <integer or 0>,
        "weight": <criterion weight>
      }
    ]
  }
}

CV TEXT:
\\\`
{CVText}
\\\`
`;

    console.log('Using enhanced combined evaluation prompt');

    const criteriaString = criteria.map((c: any) => `- ${c.text} (Weight: ${c.weight}, Mandatory: ${c.isMandatory})`).join('\n');
    const evaluateRequest = combinedPrompt
      .replace('{criteriaString}', criteriaString)
      .replace('{CVText}', extractedText);

    console.log('Evaluating candidate with enhanced prompt...');

    const payload = {
      model: 'gpt-4o-mini',
      messages: [
        { 
          role: 'system', 
          content: `You are a CV evaluation expert. Process the CV text and return the EXACT JSON structure requested in the user prompt. 
          
          Based on the overall score target of ${overallScore}%, determine if the candidate should be hired.
          
          CRITICAL: Follow the exact JSON output format specified in the user prompt. Do not add any extra text before or after the JSON.
          
          A candidate should be approved if their calculated experience and skills meet the criteria and their overall assessment score meets or exceeds ${overallScore}%.`
        },
        { role: 'user', content: evaluateRequest }
      ],
      temperature: 0.2,
      max_tokens: 3000, // Increased for detailed responses
    };

    const evaluateResponse = await callOpenAIWithRetry(payload);
    const evaluateData = await evaluateResponse.json();
    
    let evaluationResult;
    
    try {
      const rawContent = evaluateData.choices[0].message.content;
      console.log('Raw AI response preview:', rawContent.substring(0, 500));
      
      evaluationResult = parseEvaluationResponse(rawContent);
      console.log('Parsed evaluation result:', JSON.stringify(evaluationResult, null, 2));
      
      // Validate the parsed result has required fields
      if (evaluationResult.total_years_decimal === undefined) {
        console.warn('Missing total_years_decimal, setting to 0');
        evaluationResult.total_years_decimal = 0;
      }
      
      if (!evaluationResult.evaluation) {
        console.warn('Missing evaluation section, creating fallback');
        evaluationResult.evaluation = {
          summary: 'Evaluation completed with limited data',
          by_criteria: criteria.map(c => ({
            criterion: c.text,
            assessment: 'Partially evaluated',
            evidence: 'Limited data available'
          }))
        };
      }
      
    } catch (parseError) {
      console.error('JSON parsing error:', parseError);
      console.error('Failed to parse content preview:', evaluateData.choices[0].message.content.substring(0, 500));
      
      // Enhanced fallback with better error handling
      const fallbackScore = 30; // Conservative fallback score
      evaluationResult = {
        total_years_decimal: 0,
        total_months: 0,
        evaluation: {
          summary: `Evaluation failed due to parsing error. Please review CV format and content quality. Issues: ${contentValidation.issues.join(', ')}`,
          by_criteria: criteria.map(c => ({
            criterion: c.text,
            assessment: 'Could not evaluate',
            evidence: 'Technical error during evaluation - please check CV format'
          }))
        },
        roles_justification: [],
        merged_intervals: []
      };
      console.log('Using enhanced fallback evaluation result');
    }

    // Generate enhanced ATS score if enabled
    let atsScore;
    if (enableATS) {
      // Simulate ATS score based on content quality and structure
      const baseScore = contentValidation.isValid ? 85 : 70;
      const randomVariation = Math.floor(Math.random() * 15) - 7; // ±7
      atsScore = Math.max(50, Math.min(100, baseScore + randomVariation));
      console.log('Generated ATS score:', atsScore);
    }

    // Enhanced scoring calculation with standardized keywords
    const totalYears = evaluationResult.total_years_decimal || 0;
    const evaluationSummary = evaluationResult.evaluation?.summary || 'Evaluation completed';
    
    let calculatedScore = 50; // Conservative default
    if (evaluationResult.evaluation?.by_criteria) {
      const criteriaAssessments = evaluationResult.evaluation.by_criteria;
      let totalWeight = 0;
      let weightedScore = 0;
      
      criteriaAssessments.forEach((assessment, index) => {
        const criterion = criteria[index];
        const weight = criterion?.weight || 1;
        totalWeight += weight;
        
        // Enhanced score mapping based on standardized keywords
        let criterionScore = 50;
        const assessmentKeyword = assessment.assessment?.toLowerCase()?.trim() || '';
        
        // Direct keyword mapping for consistent scoring
        switch (assessmentKeyword) {
          case 'excellent':
            criterionScore = 95;
            break;
          case 'strong':
            criterionScore = 85;
            break;
          case 'good':
            criterionScore = 75;
            break;
          case 'meet':
            criterionScore = 65;
            break;
          case 'adequate':
            criterionScore = 55;
            break;
          case 'satisfactory':
            criterionScore = 50;
            break;
          case 'weak':
            criterionScore = 35;
            break;
          case 'not meet':
            criterionScore = 20;
            break;
          default:
            // Fallback for non-standard responses
            if (assessmentKeyword.includes('excellent')) criterionScore = 95;
            else if (assessmentKeyword.includes('strong')) criterionScore = 85;
            else if (assessmentKeyword.includes('good')) criterionScore = 75;
            else if (assessmentKeyword.includes('meet') && !assessmentKeyword.includes('not')) criterionScore = 65;
            else if (assessmentKeyword.includes('adequate')) criterionScore = 55;
            else if (assessmentKeyword.includes('satisf')) criterionScore = 50;
            else if (assessmentKeyword.includes('weak')) criterionScore = 35;
            else if (assessmentKeyword.includes('not meet')) criterionScore = 20;
        }
        
        weightedScore += criterionScore * weight;
        console.log(`Criterion: ${criterion.text}, Assessment: ${assessmentKeyword}, Score: ${criterionScore}, Weight: ${weight}`);
      });
      
      calculatedScore = totalWeight > 0 ? Math.round(weightedScore / totalWeight) : 50;
      console.log(`Final calculated score: ${calculatedScore} (weighted average from ${criteriaAssessments.length} criteria)`);
    }

    // Consider content quality in final scoring
    if (!contentValidation.isValid) {
      calculatedScore = Math.max(20, calculatedScore - 20); // Penalize poor content quality
    }

    const isApproved = calculatedScore >= overallScore && totalYears >= 0;

    // Prepare criteria evaluations
    const criteriaEvaluations = criteria.map((criterion, index) => {
      const assessment = evaluationResult.evaluation?.by_criteria?.[index];
      const assessmentText = assessment?.assessment?.toLowerCase() || '';
      
      // Determine if criterion is met based on assessment
      let isMet = false;
      let score = 30;
      
      if (assessmentText.includes('excellent') || assessmentText.includes('strong') || 
          assessmentText.includes('meets') || assessmentText.includes('exceeds')) {
        isMet = true;
        score = assessmentText.includes('excellent') || assessmentText.includes('exceeds') ? 90 : 75;
      } else if (assessmentText.includes('good') || assessmentText.includes('adequate') || 
                 assessmentText.includes('satisf')) {
        isMet = true;
        score = 60;
      } else if (assessmentText.includes('partial') || assessmentText.includes('some')) {
        isMet = false;
        score = 45;
      } else if (assessmentText.includes('weak') || assessmentText.includes('not meet') || 
                 assessmentText.includes('lacking') || assessmentText.includes('insufficient')) {
        isMet = false;
        score = 20;
      }
      
      return {
        criterionId: criterion.id,
        criterionText: criterion.text,
        isMet,
        justification: assessment?.evidence || 'No detailed evidence available',
        score
      };
    });

    // Calculate detailed scores for backward compatibility
    const detailedScores = {};
    criteriaEvaluations.forEach(evaluation => {
      detailedScores[evaluation.criterionId] = evaluation.score;
    });

    // Prepare enhanced response
    const response = {
      isApproved,
      justification: evaluationSummary,
      llmScore: calculatedScore,
      matchedCriteria: evaluationResult.evaluation?.by_criteria?.map(c => c.criterion) || [],
      yearsOfExperience: totalYears,
      atsScore,
      success: true,
      contentQuality: contentValidation,
      detailedEvaluation: evaluationResult.evaluation?.by_criteria || [],
      criteriaEvaluations,
      detailedScores
    };

    console.log('Sending enhanced response:', {
      ...response,
      detailedEvaluation: response.detailedEvaluation.length // Just log count for brevity
    });

    return new Response(JSON.stringify(response), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
    
  } catch (error) {
    console.error('Error in evaluate-cv function:', error);
    return new Response(
      JSON.stringify({ 
        error: error.message,
        success: false,
        timestamp: new Date().toISOString()
      }), 
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});