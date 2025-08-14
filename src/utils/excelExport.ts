import * as XLSX from 'xlsx';
import { CVFile, EvaluationCriteria } from '@/contexts/ResultsContext';

export const createExcelWorkbook = (candidates: CVFile[], criteria: EvaluationCriteria[]) => {
  const workbook = XLSX.utils.book_new();

  // Create summary sheet
  const summaryData = [
    ['CV Evaluation Results Summary'],
    [''],
    ['Generated on:', new Date().toLocaleDateString()],
    ['Total Candidates:', candidates.length],
    ['Approved Candidates:', candidates.filter(c => c.isApproved).length],
    ['Rejected Candidates:', candidates.filter(c => !c.isApproved).length],
    ['Average Score:', Math.round(candidates.reduce((sum, c) => sum + (c.llmScore || 0), 0) / candidates.length) + '%'],
    [''],
    ['Evaluation Criteria:'],
    ...criteria.map(c => [`• ${c.text}`, c.isMandatory ? 'Mandatory' : 'Optional', `Weight: ${c.weight}%`]),
    [''],
    ['Candidates Overview:'],
    ['Name', 'LLM Score', 'ATS Score', 'Status', 'Experience (Years)', 'Final Decision'],
    ...candidates.map(c => [
      c.name.replace(/\.[^/.]+$/, ""),
      c.llmScore + '%',
      c.atsScore ? c.atsScore + '%' : 'N/A',
      c.isApproved ? 'Approved' : 'Rejected',
      c.yearsOfExperience || 'N/A',
      c.justification || 'N/A'
    ])
  ];

  const summarySheet = XLSX.utils.aoa_to_sheet(summaryData);
  
  // Style the summary sheet
  summarySheet['!cols'] = [
    { wch: 25 }, { wch: 15 }, { wch: 15 }, { wch: 12 }, { wch: 20 }, { wch: 50 }
  ];

  // Add header styling
  const summaryRange = XLSX.utils.decode_range(summarySheet['!ref'] || 'A1');
  for (let col = summaryRange.s.c; col <= summaryRange.e.c; col++) {
    const headerCell = summarySheet[XLSX.utils.encode_cell({ r: 12, c: col })];
    if (headerCell) {
      headerCell.s = {
        font: { bold: true },
        fill: { fgColor: { rgb: "366092" } },
        alignment: { horizontal: "center" }
      };
    }
  }

  XLSX.utils.book_append_sheet(workbook, summarySheet, 'Summary');

  // Create individual candidate sheets
  candidates.forEach((candidate, index) => {
    const candidateName = candidate.name.replace(/\.[^/.]+$/, "").substring(0, 25); // Excel sheet name limit
    
    const candidateData = [
      [`Candidate Evaluation: ${candidateName}`],
      [''],
      ['Personal Information:'],
      ['Name:', candidateName],
      ['Years of Experience:', candidate.yearsOfExperience || 'Not specified'],
      [''],
      ['Scores:'],
      ['LLM Score:', (candidate.llmScore || 0) + '%'],
      ...(candidate.atsScore ? [['ATS Score:', candidate.atsScore + '%']] : []),
      ['Final Status:', candidate.isApproved ? 'APPROVED' : 'REJECTED'],
      [''],
      ['Overall Justification:'],
      [candidate.justification || 'No justification provided'],
      [''],
    ];

    // Add criteria evaluations if available
    if (candidate.criteriaEvaluations && candidate.criteriaEvaluations.length > 0) {
      candidateData.push(
        ['Detailed Criteria Evaluation:'],
        ['Criterion', 'Score', 'Met', 'Justification'],
        ...candidate.criteriaEvaluations.map(ce => [
          ce.criterionText,
          ce.score + '%',
          ce.isMet ? 'YES' : 'NO',
          ce.justification
        ])
      );
      candidateData.push(['']);
    }

    // Add strengths
    if (candidate.strengths && candidate.strengths.length > 0) {
      candidateData.push(
        ['Strengths:'],
        ...candidate.strengths.map(strength => [`• ${strength}`]),
        ['']
      );
    }

    // Add weaknesses
    if (candidate.weaknesses && candidate.weaknesses.length > 0) {
      candidateData.push(
        ['Areas for Improvement:'],
        ...candidate.weaknesses.map(weakness => [`• ${weakness}`]),
        ['']
      );
    }

    // Add recommendations
    if (candidate.recommendations && candidate.recommendations.length > 0) {
      candidateData.push(
        ['Recommendations:'],
        ...candidate.recommendations.map(rec => [`• ${rec}`]),
        ['']
      );
    }

    // Add detailed scores if available
    if (candidate.detailedScores) {
      candidateData.push(
        ['Detailed Scoring Breakdown:'],
        ['Category', 'Score'],
        ...Object.entries(candidate.detailedScores).map(([category, score]) => [
          category.charAt(0).toUpperCase() + category.slice(1),
          score + '%'
        ])
      );
    }

    const candidateSheet = XLSX.utils.aoa_to_sheet(candidateData);
    
    // Set column widths
    candidateSheet['!cols'] = [
      { wch: 30 }, { wch: 15 }, { wch: 10 }, { wch: 60 }
    ];

    // Style the candidate sheet
    const range = XLSX.utils.decode_range(candidateSheet['!ref'] || 'A1');
    
    // Style the title
    const titleCell = candidateSheet['A1'];
    if (titleCell) {
      titleCell.s = {
        font: { bold: true, sz: 14 },
        fill: { fgColor: { rgb: "4F46E5" } },
        alignment: { horizontal: "center" }
      };
    }

    // Style section headers
    for (let row = 0; row <= range.e.r; row++) {
      const cellA = candidateSheet[XLSX.utils.encode_cell({ r: row, c: 0 })];
      if (cellA && cellA.v && typeof cellA.v === 'string') {
        if (cellA.v.includes(':') && !cellA.v.includes('•')) {
          cellA.s = {
            font: { bold: true },
            fill: { fgColor: { rgb: "E5E7EB" } }
          };
        }
      }
    }

    // Add approval/rejection color coding
    const statusRowIndex = candidateData.findIndex(row => 
      Array.isArray(row) && row[0] === 'Final Status:'
    );
    if (statusRowIndex >= 0) {
      const statusCell = candidateSheet[XLSX.utils.encode_cell({ r: statusRowIndex, c: 1 })];
      if (statusCell) {
        statusCell.s = {
          font: { bold: true },
          fill: { 
            fgColor: { 
              rgb: candidate.isApproved ? "10B981" : "EF4444" 
            } 
          }
        };
      }
    }

    const sheetName = `${index + 1}_${candidateName}`.substring(0, 31); // Excel limit
    XLSX.utils.book_append_sheet(workbook, candidateSheet, sheetName);
  });

  return workbook;
};

export const downloadExcelWorkbook = (workbook: XLSX.WorkBook, filename: string = 'cv_evaluation_results.xlsx') => {
  XLSX.writeFile(workbook, filename);
};