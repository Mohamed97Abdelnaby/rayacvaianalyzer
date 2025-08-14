import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const openAIApiKey = Deno.env.get('OPENAI_API_KEY');

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Rate limiting
const rateLimit = new Map()

const checkRateLimit = (ip: string): boolean => {
  const now = Date.now()
  const windowMs = 60 * 1000 // 1 minute
  const maxRequests = 10 // 10 requests per minute

  if (!rateLimit.has(ip)) {
    rateLimit.set(ip, { count: 1, resetTime: now + windowMs })
    return true
  }

  const limit = rateLimit.get(ip)
  if (now > limit.resetTime) {
    rateLimit.set(ip, { count: 1, resetTime: now + windowMs })
    return true
  }

  if (limit.count >= maxRequests) {
    return false
  }

  limit.count++
  return true
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Rate limiting
    const clientIP = req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || 'unknown'
    if (!checkRateLimit(clientIP)) {
      console.warn(`Rate limit exceeded for IP: ${clientIP}`)
      return new Response(
        JSON.stringify({ error: 'Rate limit exceeded. Please try again later.' }),
        { 
          status: 429, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }
    const { message, context } = await req.json();

    // Define tools for OpenAI function calling
    const tools = [
      {
        type: "function",
        function: {
          name: "enable_ats",
          description: "Enable ATS (Applicant Tracking System) functionality when user wants to use ATS features",
          parameters: {
            type: "object",
            properties: {},
            required: []
          }
        }
      },
      {
        type: "function",
        function: {
          name: "disable_ats",
          description: "Disable ATS (Applicant Tracking System) functionality when user wants to turn off ATS features",
          parameters: {
            type: "object",
            properties: {},
            required: []
          }
        }
      },
      {
        type: "function",
        function: {
          name: "open_file_uploader",
          description: "Open the file upload dialog when user wants to upload CVs, files, or documents",
          parameters: {
            type: "object",
            properties: {
              uploadType: {
                type: "string",
                enum: ["files", "folder", "drag-drop"],
                description: "Type of upload the user is requesting"
              }
            },
            required: ["uploadType"]
          }
        }
      },
      {
        type: "function",
        function: {
          name: "focus_criteria_input",
          description: "Focus on the criteria input field when user wants to add or create evaluation criteria",
          parameters: {
            type: "object",
            properties: {},
            required: []
          }
        }
      },
      {
        type: "function",
        function: {
          name: "add_criteria",
          description: "Add evaluation criteria directly when user provides specific criteria text",
          parameters: {
            type: "object",
            properties: {
              criteriaText: {
                type: "string",
                description: "The evaluation criteria text to add"
              },
              isMandatory: {
                type: "boolean",
                description: "Whether this criteria should be marked as mandatory",
                default: false
              },
              weight: {
                type: "number",
                description: "Weight/importance of this criteria (1-5)",
                default: 1
              }
            },
            required: ["criteriaText"]
          }
        }
      },
      {
        type: "function",
        function: {
          name: "start_evaluation",
          description: "Start the CV evaluation process when user is ready to analyze uploaded CVs",
          parameters: {
            type: "object",
            properties: {},
            required: []
          }
        }
      },
      {
        type: "function",
        function: {
          name: "show_results",
          description: "Show or navigate to the results section when user wants to view evaluation results",
          parameters: {
            type: "object",
            properties: {},
            required: []
          }
        }
      }
    ];

    const systemPrompt = `You are an AI assistant for a CV evaluation platform. You help users with:

1. **Criteria Management**: Help create, refine, and improve evaluation criteria for CV screening
2. **Platform Navigation**: Guide users through uploading files, setting up evaluations, and understanding results
3. **Best Practices**: Provide expert advice on CV evaluation and recruitment screening
4. **Troubleshooting**: Help resolve issues and optimize the evaluation process
5. **UI Actions**: Use the available functions to perform actions when users request them

Current platform context: ${context || 'User is on the main evaluation platform'}

IMPORTANT: When users want to perform actions like:
- Upload files/CVs/documents (including "as folder") → use open_file_uploader function
- Enable ATS functionality → use enable_ats function
- Disable ATS functionality → use disable_ats function
- Add/create evaluation criteria manually → use focus_criteria_input function  
- Add specific criteria directly → use add_criteria function with the criteria text
- Start/begin evaluation → use start_evaluation function
- View/show results → use show_results function

Always call the appropriate function when the user's intent matches these actions. Be natural and helpful in your responses.`;

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openAIApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: message }
        ],
        tools: tools,
        tool_choice: "auto",
        temperature: 0.7,
        max_tokens: 500,
      }),
    });

    const data = await response.json();
    const reply = data.choices[0].message.content;
    const toolCalls = data.choices[0].message.tool_calls || [];

    // Process function calls into actions
    const actions = [];
    for (const toolCall of toolCalls) {
      const functionName = toolCall.function.name;
      const args = JSON.parse(toolCall.function.arguments || '{}');
      
      switch (functionName) {
        case 'enable_ats':
          actions.push({ type: 'enable-ats' });
          break;
        case 'disable_ats':
          actions.push({ type: 'disable-ats' });
          break;
        case 'open_file_uploader':
          actions.push({ type: 'open-uploader', uploadType: args.uploadType });
          break;
        case 'focus_criteria_input':
          actions.push({ type: 'focus-criteria' });
          break;
        case 'add_criteria':
          actions.push({ 
            type: 'add-criteria', 
            criteriaText: args.criteriaText,
            isMandatory: args.isMandatory || false,
            weight: args.weight || 1
          });
          break;
        case 'start_evaluation':
          actions.push({ type: 'start-evaluation' });
          break;
        case 'show_results':
          actions.push({ type: 'show-results' });
          break;
      }
    }

    return new Response(JSON.stringify({ reply, actions }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Error in chat-assistant function:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});