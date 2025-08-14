import * as XLSX from 'xlsx';
import { CVFile, EvaluationCriteria } from '@/contexts/ResultsContext';

export const createExcelWorkbook = (candidates: CVFile[], criteria: EvaluationCriteria[]) => {
  const workbook = XLSX.utils.book_new();

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
     Math.round((candidates.filter(c => c.isApproved).length / candidates.length) * 100) + '%', ''],
    ['✅ Approved', candidates.filter(c => c.isApproved).length, '', 'Average Score', 
     Math.round(candidates.reduce((sum, c) => sum + (c.llmScore || 0), 0) / candidates.length) + '%', ''],
    ['❌ Rejected', candidates.filter(c => !c.isApproved).length, '', 'Top Score', 
     Math.max(...candidates.map(c => c.llmScore || 0)) + '%', ''],
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
    ['Rank', 'Candidate Name', 'LLM Score', 'ATS Score', 'Status', 'Experience'],
    ...candidates
      .sort((a, b) => (b.llmScore || 0) - (a.llmScore || 0))
      .map((c, index) => [
        `#${index + 1}`,
        c.name.replace(/\.[^/.]+$/, "").substring(0, 25),
        c.llmScore + '%',
        c.atsScore ? c.atsScore + '%' : 'N/A',
        c.isApproved ? '✅ Approved' : '❌ Rejected',
        c.yearsOfExperience ? c.yearsOfExperience + ' years' : 'N/A'
      ])
  ];

  const summarySheet = XLSX.utils.aoa_to_sheet(summaryData);
  
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
      alignment: { horizontal: "center", vertical: "center" },
      border: {
        top: { style: "thick", color: { rgb: colors.primary } },
        bottom: { style: "thick", color: { rgb: colors.primary } },
        left: { style: "thick", color: { rgb: colors.primary } },
        right: { style: "thick", color: { rgb: colors.primary } }
      }
    };
  }

  // Style section headers with gradient-like effect
  const sectionHeaders = [5, 10, 14, 17]; // Row indices for section headers
  sectionHeaders.forEach(rowIndex => {
    const cell = summarySheet[XLSX.utils.encode_cell({ r: rowIndex, c: 0 })];
    if (cell) {
      cell.s = {
        font: { bold: true, sz: 12, color: { rgb: colors.white } },
        fill: { fgColor: { rgb: colors.dark } },
        alignment: { horizontal: "left", vertical: "center" },
        border: {
          top: { style: "medium", color: { rgb: colors.dark } },
          bottom: { style: "medium", color: { rgb: colors.dark } },
          left: { style: "medium", color: { rgb: colors.dark } },
          right: { style: "medium", color: { rgb: colors.dark } }
        }
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
          alignment: { horizontal: "center", vertical: "center" },
          border: {
            top: { style: "thin", color: { rgb: colors.primary } },
            bottom: { style: "thin", color: { rgb: colors.primary } },
            left: { style: "thin", color: { rgb: colors.primary } },
            right: { style: "thin", color: { rgb: colors.primary } }
          }
        };
      }
    }
  });

  // Color-code status cells
  for (let row = 19; row <= summaryRange.e.r; row++) {
    const statusCell = summarySheet[XLSX.utils.encode_cell({ r: row, c: 4 })];
    if (statusCell && statusCell.v) {
      const isApproved = statusCell.v.toString().includes('Approved');
      statusCell.s = {
        font: { bold: true, color: { rgb: colors.white } },
        fill: { fgColor: { rgb: isApproved ? colors.success : colors.danger } },
        alignment: { horizontal: "center", vertical: "center" }
      };
    }
  }

  // Add alternating row colors for data rows
  for (let row = 19; row <= summaryRange.e.r; row++) {
    const isEvenRow = (row - 19) % 2 === 0;
    for (let col = 0; col < 6; col++) {
      if (col === 4) continue; // Skip status column (already styled)
      const cell = summarySheet[XLSX.utils.encode_cell({ r: row, c: col })];
      if (cell) {
        cell.s = {
          fill: { fgColor: { rgb: isEvenRow ? colors.white : colors.light } },
          alignment: { horizontal: col === 0 ? "center" : "left", vertical: "center" },
          border: {
            top: { style: "thin", color: { rgb: colors.medium } },
            bottom: { style: "thin", color: { rgb: colors.medium } },
            left: { style: "thin", color: { rgb: colors.medium } },
            right: { style: "thin", color: { rgb: colors.medium } }
          }
        };
      }
    }
  }

  XLSX.utils.book_append_sheet(workbook, summarySheet, '📊 Dashboard');

  // Create enhanced individual candidate sheets
  candidates
    .sort((a, b) => (b.llmScore || 0) - (a.llmScore || 0))
    .forEach((candidate, index) => {
      const candidateName = candidate.name.replace(/\.[^/.]+$/, "").substring(0, 20);
      const rank = index + 1;
      
      const candidateData = [
        [`👤 CANDIDATE PROFILE #${rank}`, '', '', ''],
        ['', '', '', ''],
        [`${candidateName}`, '', '', candidate.isApproved ? '✅ APPROVED' : '❌ REJECTED'],
        ['', '', '', ''],
        ['📋 BASIC INFORMATION', '', '', ''],
        ['Full Name:', candidateName, '', ''],
        ['Experience:', candidate.yearsOfExperience ? `${candidate.yearsOfExperience} years` : 'Not specified', '', ''],
        ['Ranking:', `#${rank} out of ${candidates.length}`, '', ''],
        ['', '', '', ''],
        ['📊 SCORE BREAKDOWN', '', '', ''],
        ['LLM Score:', `${candidate.llmScore || 0}%`, '', ''],
        ...(candidate.atsScore ? [['ATS Score:', `${candidate.atsScore}%`, '', '']] : []),
        ['Performance Tier:', 
         (candidate.llmScore || 0) >= 80 ? '🏆 Excellent' :
         (candidate.llmScore || 0) >= 60 ? '⭐ Good' :
         (candidate.llmScore || 0) >= 40 ? '⚠️ Average' : '❌ Below Average', '', ''],
        ['', '', '', ''],
        ['📝 EVALUATION SUMMARY', '', '', ''],
        ['Overall Assessment:', candidate.justification || 'No detailed assessment provided', '', ''],
        ['', '', '', '']
      ];

      // Add detailed criteria evaluation with enhanced formatting
      if (candidate.criteriaEvaluations && candidate.criteriaEvaluations.length > 0) {
        candidateData.push(
          ['🎯 CRITERIA EVALUATION', '', '', ''],
          ['Criterion', 'Score', 'Result', 'Comments'],
          ...candidate.criteriaEvaluations.map(ce => [
            ce.criterionText.length > 35 ? ce.criterionText.substring(0, 32) + '...' : ce.criterionText,
            `${ce.score}%`,
            ce.isMet ? '✅ Met' : '❌ Not Met',
            ce.justification.length > 50 ? ce.justification.substring(0, 47) + '...' : ce.justification
          ]),
          ['', '', '', '']
        );
      }

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

      // Add detailed technical scores if available
      if (candidate.detailedScores) {
        candidateData.push(
          ['🔧 TECHNICAL ASSESSMENT', '', '', ''],
          ['Skill Area', 'Score', 'Level', 'Notes'],
          ...Object.entries(candidate.detailedScores).map(([category, score]) => [
            category.charAt(0).toUpperCase() + category.slice(1),
            `${score}%`,
            score >= 80 ? 'Expert' : score >= 60 ? 'Proficient' : score >= 40 ? 'Intermediate' : 'Beginner',
            ''
          ])
        );
      }

      const candidateSheet = XLSX.utils.aoa_to_sheet(candidateData);
      
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
          alignment: { horizontal: "center", vertical: "center" },
          border: {
            top: { style: "thick", color: { rgb: colors.primary } },
            bottom: { style: "thick", color: { rgb: colors.primary } },
            left: { style: "thick", color: { rgb: colors.primary } },
            right: { style: "thick", color: { rgb: colors.primary } }
          }
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
        const isApproved = candidate.isApproved;
        candidateSheet['D3'].s = {
          font: { bold: true, color: { rgb: colors.white } },
          fill: { fgColor: { rgb: isApproved ? colors.success : colors.danger } },
          alignment: { horizontal: "center", vertical: "center" },
          border: {
            top: { style: "medium", color: { rgb: isApproved ? colors.success : colors.danger } },
            bottom: { style: "medium", color: { rgb: isApproved ? colors.success : colors.danger } },
            left: { style: "medium", color: { rgb: isApproved ? colors.success : colors.danger } },
            right: { style: "medium", color: { rgb: isApproved ? colors.success : colors.danger } }
          }
        };
      }

      // Style section headers
      for (let row = 0; row <= range.e.r; row++) {
        const cellA = candidateSheet[XLSX.utils.encode_cell({ r: row, c: 0 })];
        if (cellA && cellA.v && typeof cellA.v === 'string') {
          // Section headers (with emojis)
          if (/^[📋📊📝🎯💪📈💡🔧]/.test(cellA.v)) {
            cellA.s = {
              font: { bold: true, sz: 12, color: { rgb: colors.white } },
              fill: { fgColor: { rgb: colors.dark } },
              alignment: { horizontal: "left", vertical: "center" },
              border: {
                top: { style: "medium", color: { rgb: colors.dark } },
                bottom: { style: "medium", color: { rgb: colors.dark } },
                left: { style: "medium", color: { rgb: colors.dark } },
                right: { style: "medium", color: { rgb: colors.dark } }
              }
            };
          }
          // Table headers
          else if (['Criterion', 'Skill Area'].includes(cellA.v)) {
            for (let col = 0; col < 4; col++) {
              const headerCell = candidateSheet[XLSX.utils.encode_cell({ r: row, c: col })];
              if (headerCell) {
                headerCell.s = {
                  font: { bold: true, color: { rgb: colors.white } },
                  fill: { fgColor: { rgb: colors.primary } },
                  alignment: { horizontal: "center", vertical: "center" },
                  border: {
                    top: { style: "thin", color: { rgb: colors.primary } },
                    bottom: { style: "thin", color: { rgb: colors.primary } },
                    left: { style: "thin", color: { rgb: colors.primary } },
                    right: { style: "thin", color: { rgb: colors.primary } }
                  }
                };
              }
            }
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
      XLSX.utils.book_append_sheet(workbook, candidateSheet, sheetName);
    });

  return workbook;
};

export const downloadExcelWorkbook = (workbook: XLSX.WorkBook, filename: string = 'cv_evaluation_results.xlsx') => {
  XLSX.writeFile(workbook, filename);
};