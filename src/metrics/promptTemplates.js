/**
 * Centralized LLM evaluation prompt templates
 * Each prompt is designed to be token-efficient while maintaining evaluation quality
 */

export const METRIC_PROMPTS = {
  completeness: `Rate completeness 1-10. Does the response address ALL prompt requirements?

Criteria:
• All specified tasks/features implemented
• No missing functionality or components  
• Edge cases and requirements covered
• Complete solution provided

Respond: "Score: X - one-line justification"`,

  technical_correctness: `Rate technical accuracy 1-10. Check syntax, APIs, and best practices.

Criteria:
• Correct syntax and language usage
• Proper API calls and method usage
• Follows established best practices
• No technical errors or bugs
• Appropriate error handling

Respond: "Score: X - one-line justification"`,

  functional_correctness: `Rate functionality 1-10. Would this code work as intended?

Criteria:
• Logic flows correctly
• Handles expected inputs properly
• Edge cases considered
• Would execute without runtime errors
• Achieves stated objectives

Respond: "Score: X - one-line justification"`,

  clarity: `Rate code clarity 1-10. Is it readable and well-structured?

Criteria:
• Clear variable and function names
• Logical code organization
• Appropriate comments where needed
• Consistent formatting and style
• Easy to understand and maintain

Respond: "Score: X - one-line justification"`,

  instruction_adherence: `Rate instruction following 1-10. Did it follow ALL specific constraints?

Criteria:
• Followed all explicit requirements
• Respected specified constraints
• Used required technologies/approaches
• Adhered to formatting requirements
• Completed task as requested

Respond: "Score: X - one-line justification"`
};
