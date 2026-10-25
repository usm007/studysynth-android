const fs = require('fs');

const data = JSON.parse(fs.readFileSync('./pwa/data/generated_ncert_judiciary_questions.json', 'utf-8'));

let md = '# NCERT Class 8 Civics — Generated Question Bank\n';
md += '## Chapter 4: The Role of the Judiciary in Our Society\n\n';
md += `- **Source Document:** \`${data.source.file}\`\n`;
md += `- **Subject / Level:** ${data.source.title}\n`;
md += `- **Pages Analyzed:** ${data.source.pages_analyzed} of ${data.source.total_pages_in_pdf} pages in textbook PDF\n`;
md += `- **Total Questions Generated:** ${data.production_question_bank.length + data.conceptual_reasoning_v2_bank.length} items (${data.production_question_bank.length} production items + ${data.conceptual_reasoning_v2_bank.length} conceptual reasoning proof items)\n\n`;
md += '---\n\n';

md += '## Part I: Verified Production Questions\n\n';
data.production_question_bank.forEach((q, idx) => {
  md += `### Question ${idx + 1} [${q.id}]\n`;
  md += `- **Subtype:** \`${q.question_subtype}\`\n`;
  md += `- **Answer Key:** **${q.answer_key}**\n\n`;
  md += `**Stem:**\n> ${q.stem}\n\n`;
  md += `**Options:**\n`;
  q.options.forEach((opt) => {
    const mark = opt.is_correct
      ? ' **(CORRECT ANSWER)**'
      : ` *(Distractor Origin: \`${opt.distractor_origin || 'pool'}\`)*`;
    md += `- **${opt.key})** ${opt.text}${mark}\n`;
  });
  md += `\n**Supporting Excerpt:**\n> "${q.supporting_excerpt}"\n\n`;
  md += `**Explanation:**\n${q.explanation}\n\n`;
  md += '---\n\n';
});

md += '## Part II: Conceptual Reasoning V2 Items (With Proof Traces)\n\n';
data.conceptual_reasoning_v2_bank.forEach((q, idx) => {
  md += `### Conceptual Item ${idx + 1} [${q.id}]\n`;
  md += `- **Subtype:** \`${q.question_subtype}\`\n`;
  md += `- **Cognitive Difficulty:** \`${q.difficulty}\`\n`;
  md += `- **Reasoning Operator:** \`${q.proof_trace ? q.proof_trace.operator : q.primary_operator}\`\n`;
  md += `- **Answer Key:** **${q.answer_key}**\n\n`;
  md += `**Stem:**\n> ${q.stem}\n\n`;
  md += `**Options:**\n`;
  q.options.forEach((opt) => {
    const mark = opt.is_correct
      ? ' **(CORRECT ANSWER)**'
      : ` *(Transformation: \`${opt.transformation_type || 'misconception'}\`)*`;
    md += `- **${opt.key})** ${opt.text}${mark}\n`;
  });
  md += `\n**Proof Trace & Inference Steps:**\n`;
  if (q.proof_trace && Array.isArray(q.proof_trace.steps)) {
    q.proof_trace.steps.forEach((step) => {
      md += `- ${step}\n`;
    });
  }
  md += `\n**Supporting Excerpt:**\n> "${q.supporting_excerpt}"\n\n`;
  md += `**Explanation:**\n${q.explanation}\n\n`;
  md += '---\n\n';
});

fs.writeFileSync('./pwa/data/generated_ncert_judiciary_questions.md', md, 'utf-8');
console.log('Successfully written markdown question bank to: pwa/data/generated_ncert_judiciary_questions.md');
