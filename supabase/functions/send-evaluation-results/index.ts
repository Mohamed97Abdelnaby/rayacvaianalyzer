import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import * as XLSX from 'https://esm.sh/xlsx@0.18.5'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface EmailRequest {
  to: string
  candidates: Array<{
    name: string
    score: number
    atsScore?: number
    approved: boolean
    experience?: number
    justification?: string
    strengths?: string[]
    weaknesses?: string[]
    recommendations?: string[]
  }>
  criteria: Array<{
    text: string
    isMandatory: boolean
    weight: number
  }>
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { to, candidates, criteria }: EmailRequest = await req.json()

    // Create Excel workbook
    const workbook = XLSX.utils.book_new()

    // Create summary sheet
    const summaryData = [
      ['CV Evaluation Results Summary', '', '', ''],
      ['Generated on:', new Date().toLocaleDateString(), '', ''],
      ['', '', '', ''],
      ['Total Candidates:', candidates.length, '', ''],
      ['Approved:', candidates.filter(c => c.approved).length, '', ''],
      ['Rejected:', candidates.filter(c => !c.approved).length, '', ''],
      ['Average Score:', Math.round(candidates.reduce((sum, c) => sum + c.score, 0) / candidates.length) + '%', '', ''],
      ['', '', '', ''],
      ['Evaluation Criteria:', '', '', ''],
      ...criteria.map(c => ['', c.text, c.isMandatory ? 'Mandatory' : 'Optional', c.weight + '%']),
      ['', '', '', ''],
      ['Candidate Overview:', '', '', ''],
      ['Name', 'Score', 'Status', 'Experience'],
      ...candidates.map(c => [c.name, c.score + '%', c.approved ? 'Approved' : 'Rejected', c.experience ? c.experience + ' years' : 'N/A'])
    ]

    const summarySheet = XLSX.utils.aoa_to_sheet(summaryData)
    XLSX.utils.book_append_sheet(workbook, summarySheet, 'Summary')

    // Create individual sheets for each candidate
    candidates.forEach((candidate, index) => {
      const candidateData = [
        ['Candidate Details', '', ''],
        ['Name:', candidate.name, ''],
        ['LLM Score:', candidate.score + '%', ''],
        ['ATS Score:', candidate.atsScore ? candidate.atsScore + '%' : 'N/A', ''],
        ['Experience:', candidate.experience ? candidate.experience + ' years' : 'N/A', ''],
        ['Status:', candidate.approved ? 'Approved' : 'Rejected', ''],
        ['', '', ''],
        ['Evaluation Summary:', '', ''],
        [candidate.justification || 'No justification provided', '', ''],
        ['', '', ''],
        ['Strengths:', '', ''],
        ...(candidate.strengths || []).map(s => [s, '', '']),
        ['', '', ''],
        ['Areas for Improvement:', '', ''],
        ...(candidate.weaknesses || []).map(w => [w, '', '']),
        ['', '', ''],
        ['Recommendations:', '', ''],
        ...(candidate.recommendations || []).map(r => [r, '', ''])
      ]

      const candidateSheet = XLSX.utils.aoa_to_sheet(candidateData)
      const sheetName = candidate.name.substring(0, 31) // Excel sheet name limit
      XLSX.utils.book_append_sheet(workbook, candidateSheet, sheetName)
    })

    // Convert workbook to buffer
    const excelBuffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' })
    const base64Excel = btoa(String.fromCharCode(...new Uint8Array(excelBuffer)))

    // Create simple email body
    const emailHtml = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; }
            .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 20px; text-align: center; border-radius: 8px; }
            .content { padding: 20px; }
          </style>
        </head>
        <body>
          <div class="header">
            <h1>CV Evaluation Results</h1>
          </div>
          
          <div class="content">
            <p>Hello,</p>
            
            <p>Please find attached the comprehensive CV evaluation results for ${candidates.length} candidates.</p>
            
            <p>The Excel workbook contains:</p>
            <ul>
              <li>Summary sheet with overview of all candidates</li>
              <li>Individual sheets for each candidate with detailed evaluation</li>
              <li>Scores, strengths, weaknesses, and recommendations</li>
            </ul>
            
            <p>Best regards,<br/>CV Evaluation Platform</p>
          </div>
        </body>
      </html>
    `

    // Send email with Excel attachment using Resend
    const resendApiKey = Deno.env.get('RESEND_API_KEY')
    
    if (!resendApiKey) {
      throw new Error('RESEND_API_KEY not configured. Please add it in Supabase secrets.')
    }

    const emailResponse = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${resendApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'CV Evaluation <noreply@yourdomain.com>', // Update this with your verified domain
        to: [to],
        subject: 'CV Evaluation Results',
        html: emailHtml,
        attachments: [{
          filename: `CV_Evaluation_Results_${new Date().toISOString().split('T')[0]}.xlsx`,
          content: base64Excel,
          type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        }]
      }),
    })

    if (!emailResponse.ok) {
      const errorData = await emailResponse.text()
      throw new Error(`Email service error: ${emailResponse.status} - ${errorData}`)
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: 'Email sent successfully with Excel attachment',
        excelSize: excelBuffer.length
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )

  } catch (error) {
    console.error('Error sending email:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )
  }
})