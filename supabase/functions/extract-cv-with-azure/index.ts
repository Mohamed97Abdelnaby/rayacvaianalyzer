import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Rate limiting
const requestCounts = new Map<string, { count: number; resetTime: number }>();
const RATE_LIMIT = 10; // requests per window
const RATE_WINDOW = 60000; // 1 minute

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const current = requestCounts.get(ip);
  
  if (!current || now > current.resetTime) {
    requestCounts.set(ip, { count: 1, resetTime: now + RATE_WINDOW });
    return true;
  }
  
  if (current.count >= RATE_LIMIT) {
    return false;
  }
  
  current.count++;
  return true;
}

async function callAzureDocumentIntelligence(fileData: string, fileName: string, fileType: string): Promise<any> {
  // Access Supabase secrets
  const azureKey = Deno.env.get('AZURE_DOCUMENT_INTELLIGENCE_KEY');
  const azureEndpoint = Deno.env.get('AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT');
  
  console.log('Azure endpoint:', azureEndpoint ? 'configured' : 'missing');
  console.log('Azure key:', azureKey ? 'configured' : 'missing');
  
  if (!azureKey || !azureEndpoint) {
    throw new Error(`Azure Document Intelligence credentials not configured. Key: ${azureKey ? 'set' : 'missing'}, Endpoint: ${azureEndpoint ? 'set' : 'missing'}`);
  }

  // Ensure endpoint has the correct format
  const cleanEndpoint = azureEndpoint.replace(/\/$/, '');
  console.log('Using endpoint:', cleanEndpoint);

  // Improved base64 to binary conversion with better error handling
  let binaryData: Uint8Array;
  try {
    // Remove data URL prefix if present
    const cleanBase64 = fileData.replace(/^data:[^;]+;base64,/, '');
    
    // Decode base64 to binary with proper Unicode handling
    const decoded = atob(cleanBase64);
    binaryData = new Uint8Array(decoded.length);
    for (let i = 0; i < decoded.length; i++) {
      binaryData[i] = decoded.charCodeAt(i);
    }
    
    console.log(`File processing: ${fileName}, Size: ${binaryData.length} bytes, Type: ${fileType}`);
  } catch (error) {
    console.error('Base64 decoding failed:', error);
    throw new Error('Invalid base64 file data format');
  }
  
  // Determine correct Content-Type based on file type
  const getContentType = (type: string): string => {
    const typeMap: { [key: string]: string } = {
      'application/pdf': 'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/msword': 'application/msword',
      'image/jpeg': 'image/jpeg',
      'image/png': 'image/png',
      'image/tiff': 'image/tiff',
      'image/bmp': 'image/bmp'
    };
    return typeMap[type] || 'application/octet-stream';
  };

  const contentType = getContentType(fileType);
  console.log(`Using Content-Type: ${contentType}`);
  
  // Try multiple API endpoint patterns for Document Intelligence
  const endpointPatterns = [
    `/formrecognizer/documentModels/prebuilt-read:analyze?api-version=2023-07-31`,
    `/documentintelligence/documentModels/prebuilt-read:analyze?api-version=2023-07-31`,
    `/formrecognizer/v2.1/prebuilt/read/analyze`,
    `/documentintelligence/documentModels/prebuilt-read:analyze?api-version=2024-02-29-preview`
  ];
  
  let lastError: any;
  
  for (const pattern of endpointPatterns) {
    const analyzeUrl = `${cleanEndpoint}${pattern}`;
    console.log(`Trying endpoint pattern: ${analyzeUrl}`);
    
    try {
      const analyzeResponse = await fetch(analyzeUrl, {
        method: 'POST',
        headers: {
          'Ocp-Apim-Subscription-Key': azureKey,
          'Content-Type': contentType,
          'Accept': 'application/json',
        },
        body: binaryData,
      });

      if (analyzeResponse.ok) {
        console.log(`Success with endpoint pattern: ${pattern}`);
        return await handleSuccessfulResponse(analyzeResponse, azureKey);
      } else {
        const errorText = await analyzeResponse.text();
        lastError = {
          pattern,
          status: analyzeResponse.status,
          statusText: analyzeResponse.statusText,
          url: analyzeUrl,
          response: errorText
        };
        console.warn(`Failed with pattern ${pattern}:`, lastError);
      }
    } catch (error) {
      lastError = { pattern, error: error.message };
      console.warn(`Error with pattern ${pattern}:`, error);
    }
  }
  
  // If all patterns failed, throw the last error
  console.error('All endpoint patterns failed. Last error:', lastError);
  throw new Error(`Azure analysis failed with all endpoint patterns. Last error: ${lastError.status || 'Network error'} - ${lastError.response || lastError.error}`);
}

async function handleSuccessfulResponse(analyzeResponse: Response, azureKey: string): Promise<any> {

  // Get operation location from headers
  const operationLocation = analyzeResponse.headers.get('Operation-Location') || analyzeResponse.headers.get('operation-location');
  if (!operationLocation) {
    // For some API versions, the response might be synchronous
    try {
      const syncResult = await analyzeResponse.json();
      if (syncResult.analyzeResult) {
        console.log('Received synchronous response from Azure');
        return syncResult;
      }
    } catch (e) {
      console.log('No synchronous response available');
    }
    throw new Error('No operation location returned from Azure and no synchronous result available');
  }

  console.log('Polling for results at:', operationLocation);

  // Poll for results with exponential backoff
  let result;
  let attempts = 0;
  const maxAttempts = 60; // Increased to 60 seconds max
  let waitTime = 1000; // Start with 1 second
  
  while (attempts < maxAttempts) {
    await new Promise(resolve => setTimeout(resolve, waitTime));
    
    try {
      const resultResponse = await fetch(operationLocation, {
        headers: {
          'Ocp-Apim-Subscription-Key': azureKey,
        },
      });

      if (!resultResponse.ok) {
        throw new Error(`Failed to get results: ${resultResponse.status} - ${await resultResponse.text()}`);
      }

      result = await resultResponse.json();
      console.log(`Polling attempt ${attempts + 1}: Status = ${result.status}`);
      
      if (result.status === 'succeeded') {
        console.log('Azure analysis completed successfully');
        break;
      } else if (result.status === 'failed') {
        throw new Error(`Azure analysis failed: ${result.error?.message || 'Unknown error'}`);
      }
      
      // Exponential backoff with max 5 seconds
      waitTime = Math.min(waitTime * 1.2, 5000);
      attempts++;
    } catch (error) {
      console.error(`Polling attempt ${attempts + 1} failed:`, error);
      attempts++;
      if (attempts >= maxAttempts) {
        throw error;
      }
    }
  }

  if (attempts >= maxAttempts) {
    throw new Error('Azure analysis timed out after 60 seconds');
  }

  return result;
}

function extractTextFromAzureResult(azureResult: any): string {
  try {
    // Extract content from Azure Document Intelligence result
    const content = azureResult.analyzeResult?.content || '';
    
    // Get paragraphs for better structure
    const paragraphs = azureResult.analyzeResult?.paragraphs || [];
    const tables = azureResult.analyzeResult?.tables || [];
    
    let extractedText = content;
    
    // Add table content if available
    if (tables.length > 0) {
      extractedText += '\n\nTables:\n';
      tables.forEach((table: any, index: number) => {
        extractedText += `\nTable ${index + 1}:\n`;
        table.cells?.forEach((cell: any) => {
          extractedText += `${cell.content} `;
        });
        extractedText += '\n';
      });
    }
    
    return extractedText.trim();
  } catch (error) {
    console.error('Error extracting text from Azure result:', error);
    throw new Error('Failed to extract text from Azure analysis result');
  }
}

function validateInput(data: any) {
  if (!data.fileName || typeof data.fileName !== 'string') {
    throw new Error('fileName is required and must be a string');
  }
  
  if (!data.fileType || typeof data.fileType !== 'string') {
    throw new Error('fileType is required and must be a string');
  }
  
  if (!data.fileData || typeof data.fileData !== 'string') {
    throw new Error('fileData is required and must be a base64 string');
  }
  
  // Validate file type
  const allowedTypes = [
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/msword',
    'image/jpeg',
    'image/png',
    'image/tiff',
    'image/bmp'
  ];
  
  if (!allowedTypes.includes(data.fileType)) {
    throw new Error(`Unsupported file type: ${data.fileType}. Allowed types: ${allowedTypes.join(', ')}`);
  }
  
  // Validate base64 format - remove data URL prefix if present
  const cleanBase64 = data.fileData.replace(/^data:[^;]+;base64,/, '');
  try {
    atob(cleanBase64);
  } catch {
    throw new Error('Invalid base64 file data format');
  }
  
  // Check file size (base64 is ~33% larger than binary)
  const fileSizeBytes = (cleanBase64.length * 3) / 4;
  const maxSizeBytes = 20 * 1024 * 1024; // Reduced to 20MB for better reliability
  const minSizeBytes = 100; // Minimum 100 bytes
  
  if (fileSizeBytes > maxSizeBytes) {
    throw new Error(`File size ${Math.round(fileSizeBytes / 1024 / 1024)}MB exceeds 20MB limit`);
  }
  
  if (fileSizeBytes < minSizeBytes) {
    throw new Error(`File size ${fileSizeBytes} bytes is too small (minimum 100 bytes)`);
  }
  
  console.log(`File validation passed: ${data.fileName}, ${Math.round(fileSizeBytes / 1024)}KB, ${data.fileType}`);
}

function assessTextQuality(text: string): { score: number; issues: string[] } {
  const issues: string[] = [];
  let score = 100;
  
  // Check text length
  if (text.length < 100) {
    issues.push('Very short text extracted');
    score -= 30;
  } else if (text.length < 300) {
    issues.push('Short text extracted');
    score -= 15;
  }
  
  // Check for CV-related keywords
  const cvKeywords = [
    'experience', 'education', 'skills', 'work', 'employment',
    'university', 'degree', 'certificate', 'project', 'responsibility'
  ];
  
  const foundKeywords = cvKeywords.filter(keyword => 
    text.toLowerCase().includes(keyword)
  ).length;
  
  if (foundKeywords < 2) {
    issues.push('Limited CV-related content detected');
    score -= 25;
  }
  
  // Check character quality (ratio of readable vs special characters)
  const readableChars = text.match(/[a-zA-Z0-9\s]/g)?.length || 0;
  const readableRatio = readableChars / text.length;
  
  if (readableRatio < 0.7) {
    issues.push('Poor text quality detected');
    score -= 20;
  }
  
  return { score: Math.max(0, score), issues };
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Rate limiting
    const clientIP = req.headers.get('x-forwarded-for') || 'unknown';
    if (!checkRateLimit(clientIP)) {
      return new Response(
        JSON.stringify({ error: 'Rate limit exceeded. Please try again later.' }),
        { 
          status: 429, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    // Parse request body
    const requestData = await req.json();
    console.log('Received extraction request for:', requestData.fileName);
    
    // Validate input
    validateInput(requestData);
    
    // Extract text using Azure Document Intelligence
    console.log('Starting Azure Document Intelligence analysis...');
    const azureResult = await callAzureDocumentIntelligence(
      requestData.fileData,
      requestData.fileName,
      requestData.fileType
    );
    
    // Extract and process text
    const extractedText = extractTextFromAzureResult(azureResult);
    console.log(`Extracted ${extractedText.length} characters from ${requestData.fileName}`);
    
    // Assess text quality
    const textQuality = assessTextQuality(extractedText);
    
    const response = {
      success: true,
      extractedText,
      textQuality,
      extractionMethod: 'azure-document-intelligence',
      metadata: {
        fileName: requestData.fileName,
        fileType: requestData.fileType,
        extractedLength: extractedText.length,
        confidence: azureResult.analyzeResult?.confidence || 'unknown'
      }
    };

    return new Response(JSON.stringify(response), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error in extract-cv-with-azure function:', error);
    
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message || 'Internal server error',
        extractedText: '',
        textQuality: { score: 0, issues: ['Extraction failed'] }
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});