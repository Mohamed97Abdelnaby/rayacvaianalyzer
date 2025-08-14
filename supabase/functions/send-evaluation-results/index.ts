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

    // Create Excel workbook with enhanced styling
    const workbook = XLSX.utils.book_new()

    // Professional color palette
    const colors = {
      primary: "2563EB",      // Blue
      success: "059669",      // Green  
      warning: "D97706",      // Orange
      danger: "DC2626",       // Red
      light: "F8FAFC",        // Light gray
      medium: "E2E8F0",       // Medium gray
      dark: "475569",         // Dark gray
      white: "FFFFFF"
    };

    // Create enhanced summary sheet with professional dashboard layout
    const summaryData = [
      ['📊 CV EVALUATION DASHBOARD', '', '', '', '', ''],
      ['', '', '', '', '', ''],
      ['📅 Report Generated:', new Date().toLocaleDateString('en-US', { 
        weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' 
      }), '', '', '', ''],
      ['⏰ Time:', new Date().toLocaleTimeString(), '', '', '', ''],
      ['', '', '', '', '', ''],
      ['📈 KEY METRICS', '', '', '', '', ''],
      ['Total Candidates', candidates.length, '', 'Approval Rate', 
       Math.round((candidates.filter(c => c.approved).length / candidates.length) * 100) + '%', ''],
      ['✅ Approved', candidates.filter(c => c.approved).length, '', 'Average Score', 
       Math.round(candidates.reduce((sum, c) => sum + c.score, 0) / candidates.length) + '%', ''],
      ['❌ Rejected', candidates.filter(c => !c.approved).length, '', 'Top Score', 
       Math.max(...candidates.map(c => c.score)) + '%', ''],
      ['', '', '', '', '', ''],
      ['🎯 EVALUATION CRITERIA', '', '', '', '', ''],
      ['Criterion', 'Type', 'Weight', 'Impact Level', '', ''],
      ...criteria.map(c => [
        c.text.length > 40 ? c.text.substring(0, 37) + '...' : c.text,
        c.isMandatory ? '🔴 Mandatory' : '🟡 Optional', 
        c.weight + '%',
        c.weight >= 20 ? 'High' : c.weight >= 10 ? 'Medium' : 'Low',
        '', ''
      ]),
      ['', '', '', '', '', ''],
      ['👥 CANDIDATES OVERVIEW', '', '', '', '', ''],
      ['Rank', 'Candidate Name', 'Score', 'Status', 'Experience', ''],
      ...candidates
        .sort((a, b) => b.score - a.score)
        .map((c, index) => [
          `#${index + 1}`,
          c.name.substring(0, 25),
          c.score + '%',
          c.approved ? '✅ Approved' : '❌ Rejected',
          c.experience ? c.experience + ' years' : 'N/A',
          ''
        ])
    ]

    const summarySheet = XLSX.utils.aoa_to_sheet(summaryData)
    
    // Enhanced column widths for better readability
    summarySheet['!cols'] = [
      { wch: 8 }, { wch: 28 }, { wch: 12 }, { wch: 12 }, { wch: 16 }, { wch: 15 }
    ];

    // Professional styling for summary sheet
    const summaryRange = XLSX.utils.decode_range(summarySheet['!ref'] || 'A1');
    
    // Style main title
    if (summarySheet['A1']) {
      summarySheet['A1'].s = {
        font: { bold: true, sz: 16, color: { rgb: colors.white } },
        fill: { fgColor: { rgb: colors.primary } },
        alignment: { horizontal: "center", vertical: "center" }
      };
    }

    // Style section headers
    const sectionHeaders = [5, 10, 14, 17]; // Row indices for section headers
    sectionHeaders.forEach(rowIndex => {
      const cell = summarySheet[XLSX.utils.encode_cell({ r: rowIndex, c: 0 })];
      if (cell) {
        cell.s = {
          font: { bold: true, sz: 12, color: { rgb: colors.white } },
          fill: { fgColor: { rgb: colors.dark } },
          alignment: { horizontal: "left", vertical: "center" }
        };
      }
    });

    // Style column headers for tables
    const tableHeaders = [11, 18]; // Row indices for table headers
    tableHeaders.forEach(rowIndex => {
      for (let col = 0; col < 6; col++) {
        const cell = summarySheet[XLSX.utils.encode_cell({ r: rowIndex, c: col })];
        if (cell) {
          cell.s = {
            font: { bold: true, color: { rgb: colors.white } },
            fill: { fgColor: { rgb: colors.primary } },
            alignment: { horizontal: "center", vertical: "center" }
          };
        }
      }
    });

    // Color-code status cells
    for (let row = 19; row <= summaryRange.e.r; row++) {
      const statusCell = summarySheet[XLSX.utils.encode_cell({ r: row, c: 3 })];
      if (statusCell && statusCell.v) {
        const isApproved = statusCell.v.toString().includes('Approved');
        statusCell.s = {
          font: { bold: true, color: { rgb: colors.white } },
          fill: { fgColor: { rgb: isApproved ? colors.success : colors.danger } },
          alignment: { horizontal: "center", vertical: "center" }
        };
      }
    }

    XLSX.utils.book_append_sheet(workbook, summarySheet, '📊 Dashboard')

    // Create enhanced individual candidate sheets
    candidates
      .sort((a, b) => b.score - a.score)
      .forEach((candidate, index) => {
        const candidateName = candidate.name.substring(0, 20);
        const rank = index + 1;
        
        const candidateData = [
          [`👤 CANDIDATE PROFILE #${rank}`, '', '', ''],
          ['', '', '', ''],
          [`${candidateName}`, '', '', candidate.approved ? '✅ APPROVED' : '❌ REJECTED'],
          ['', '', '', ''],
          ['📋 BASIC INFORMATION', '', '', ''],
          ['Full Name:', candidateName, '', ''],
          ['Experience:', candidate.experience ? `${candidate.experience} years` : 'Not specified', '', ''],
          ['Ranking:', `#${rank} out of ${candidates.length}`, '', ''],
          ['', '', '', ''],
          ['📊 SCORE BREAKDOWN', '', '', ''],
          ['Score:', `${candidate.score}%`, '', ''],
          ...(candidate.atsScore ? [['ATS Score:', `${candidate.atsScore}%`, '', '']] : []),
          ['Performance Tier:', 
           candidate.score >= 80 ? '🏆 Excellent' :
           candidate.score >= 60 ? '⭐ Good' :
           candidate.score >= 40 ? '⚠️ Average' : '❌ Below Average', '', ''],
          ['', '', '', ''],
          ['📝 EVALUATION SUMMARY', '', '', ''],
          ['Overall Assessment:', candidate.justification || 'No detailed assessment provided', '', ''],
          ['', '', '', '']
        ];

        // Add strengths with professional formatting
        if (candidate.strengths && candidate.strengths.length > 0) {
          candidateData.push(
            ['💪 KEY STRENGTHS', '', '', ''],
            ...candidate.strengths.map((strength, i) => [
              `${i + 1}.`, strength, '', ''
            ]),
            ['', '', '', '']
          );
        }

        // Add improvement areas with constructive tone
        if (candidate.weaknesses && candidate.weaknesses.length > 0) {
          candidateData.push(
            ['📈 DEVELOPMENT OPPORTUNITIES', '', '', ''],
            ...candidate.weaknesses.map((weakness, i) => [
              `${i + 1}.`, weakness, '', ''
            ]),
            ['', '', '', '']
          );
        }

        // Add actionable recommendations
        if (candidate.recommendations && candidate.recommendations.length > 0) {
          candidateData.push(
            ['💡 RECOMMENDATIONS', '', '', ''],
            ...candidate.recommendations.map((rec, i) => [
              `${i + 1}.`, rec, '', ''
            ]),
            ['', '', '', '']
          );
        }

        const candidateSheet = XLSX.utils.aoa_to_sheet(candidateData)
        
        // Enhanced column widths for professional layout
        candidateSheet['!cols'] = [
          { wch: 25 }, { wch: 35 }, { wch: 15 }, { wch: 35 }
        ];

        // Professional styling for candidate sheets
        const range = XLSX.utils.decode_range(candidateSheet['!ref'] || 'A1');
        
        // Style main candidate header
        if (candidateSheet['A1']) {
          candidateSheet['A1'].s = {
            font: { bold: true, sz: 16, color: { rgb: colors.white } },
            fill: { fgColor: { rgb: colors.primary } },
            alignment: { horizontal: "center", vertical: "center" }
          };
        }

        // Style candidate name and status
        if (candidateSheet['A3']) {
          candidateSheet['A3'].s = {
            font: { bold: true, sz: 14 },
            alignment: { horizontal: "left", vertical: "center" }
          };
        }
        
        if (candidateSheet['D3']) {
          const isApproved = candidate.approved;
          candidateSheet['D3'].s = {
            font: { bold: true, color: { rgb: colors.white } },
            fill: { fgColor: { rgb: isApproved ? colors.success : colors.danger } },
            alignment: { horizontal: "center", vertical: "center" }
          };
        }

        // Style section headers
        for (let row = 0; row <= range.e.r; row++) {
          const cellA = candidateSheet[XLSX.utils.encode_cell({ r: row, c: 0 })];
          if (cellA && cellA.v && typeof cellA.v === 'string') {
            // Section headers (with emojis)
            if (/^[📋📊📝💪📈💡]/.test(cellA.v)) {
              cellA.s = {
                font: { bold: true, sz: 12, color: { rgb: colors.white } },
                fill: { fgColor: { rgb: colors.dark } },
                alignment: { horizontal: "left", vertical: "center" }
              };
            }
          }
        }

        // Add score-based conditional formatting
        for (let row = 0; row <= range.e.r; row++) {
          const scoreCell = candidateSheet[XLSX.utils.encode_cell({ r: row, c: 1 })];
          if (scoreCell && scoreCell.v && typeof scoreCell.v === 'string' && scoreCell.v.includes('%')) {
            const score = parseInt(scoreCell.v);
            let bgColor = colors.medium;
            if (score >= 80) bgColor = colors.success;
            else if (score >= 60) bgColor = colors.warning;
            else if (score < 40) bgColor = colors.danger;

            scoreCell.s = {
              font: { bold: true, color: { rgb: score >= 60 ? colors.white : colors.dark } },
              fill: { fgColor: { rgb: bgColor } },
              alignment: { horizontal: "center", vertical: "center" }
            };
          }
        }

        const sheetName = `👤 ${rank}_${candidateName}`.substring(0, 31);
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