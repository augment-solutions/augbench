# Metrics System

Augbench provides a comprehensive metrics system to evaluate AI coding assistants across multiple dimensions.

## Metric Categories

### Deterministic Metrics
Objective measurements that produce consistent results:
- **Response Time**: Execution duration
- **Diff Metrics**: Code change statistics
- **AST Similarity**: Structural code comparison (PR_Recreate only)

### LLM-Assessed Metrics
Subjective quality assessments using evaluator LLM (0-10 scale):
- **Completeness**: Task completion thoroughness
- **Technical Correctness**: Implementation accuracy
- **Functional Correctness**: Logical correctness
- **Clarity**: Code readability and organization
- **Instruction Adherence**: Prompt requirement following

## Detailed Metric Descriptions

### Response Time (`response_time`)

**Type**: Deterministic  
**Scale**: Seconds (floating point)  
**Availability**: All modes

Measures the total execution time from prompt input to completion.

**Implementation**:
```javascript
const start = process.hrtime.bigint();
await agentExecution();
const end = process.hrtime.bigint();
const seconds = Number(end - start) / 1e9;
```

**Interpretation**:
- Lower values indicate faster execution
- Consider task complexity when comparing
- Useful for performance benchmarking

### Diff Metrics (`diff_metrics`)

**Type**: Deterministic  
**Scale**: Integer counts  
**Availability**: All modes

Analyzes code changes made by the agent.

**Structure**:
```json
{
  "diff_metrics": {
    "files_added": 2,
    "files_modified": 5,
    "files_deleted": 1,
    "lines_added": 150,
    "lines_modified": 75,
    "lines_deleted": 25
  }
}
```

**Implementation**:
- Uses `git diff --name-status` and `git diff --numstat` for tracked changes
- Uses `git ls-files --others --exclude-standard` to detect untracked files
- Counts untracked files as "added" files with 0 lines until committed
- Excludes binary files (detected by "-" in numstat output)
- Handles mixed scenarios with both tracked and untracked changes

**Interpretation**:
- Higher values may indicate more comprehensive changes
- Consider baseline complexity and requirements
- Useful for understanding agent behavior patterns

### AST Similarity (`ast_similarity`)

**Type**: Deterministic  
**Scale**: 0-10 (10 = identical structure)  
**Availability**: PR_Recreate mode only

Compares structural similarity between agent and human implementations.

**Implementation**:
- Uses web-tree-sitter (WASM) for true AST parsing when grammar files are available
- Supports JavaScript (.js, .jsx, .mjs), TypeScript (.ts, .tsx), and Python (.py)
- Falls back to text-based comparison for unsupported languages or when WASM fails
- Compares only files changed in the PR
- Grammar files located in `grammars/` directory

**Algorithm**:
```javascript
// AST-based comparison (when WASM available)
const features1 = extractASTFeatures(node1); // node types, depth, constructs
const features2 = extractASTFeatures(node2);
const similarity = compareASTFeatures(features1, features2);

// Weighted similarity: 40% node types + 30% structure + 30% constructs
const score = similarity * 10; // Scale to 0-10

// Fallback: text-based Jaccard similarity
const textSimilarity = intersection.size / union.size;
```

**Interpretation**:
- Higher scores indicate better structural alignment
- Focuses on code organization and patterns
- Independent of variable naming and comments

### Completeness (`completeness`)

**Type**: LLM-Assessed  
**Scale**: 0-10 (10 = fully complete)  
**Availability**: All modes

Evaluates how thoroughly the agent addressed all aspects of the prompt.

**Assessment Criteria**:
- All specified tasks/features implemented
- No missing functionality or components
- Edge cases and requirements covered
- Complete solution provided

**LLM Prompt Template**:
```
Rate completeness 1-10. Does the response address ALL prompt requirements?

Criteria:
• All specified tasks/features implemented
• No missing functionality or components
• Edge cases and requirements covered
• Complete solution provided

Respond: "Score: X - one-line justification"
```

**Token Optimization**:
- Uses diff-first policy: sends unified diff when available and smaller than 70% of full output
- Falls back to truncated output (4KB limit) when diff unavailable or too large
- Optimizes evaluator LLM token usage while maintaining assessment quality

### Technical Correctness (`technical_correctness`)

**Type**: LLM-Assessed  
**Scale**: 0-10 (10 = technically perfect)  
**Availability**: All modes

Evaluates the technical accuracy and best practices adherence.

**Assessment Criteria**:
- Correct syntax and language usage
- Proper API calls and method usage
- Follows established best practices
- No technical errors or bugs
- Appropriate error handling

**LLM Prompt Template**:
```
Rate technical accuracy 1-10. Check syntax, APIs, and best practices.

Criteria:
• Correct syntax and language usage
• Proper API calls and method usage
• Follows established best practices
• No technical errors or bugs
• Appropriate error handling

Respond: "Score: X - one-line justification"
```

### Functional Correctness (`functional_correctness` / `logical_correctness`)

**Type**: LLM-Assessed  
**Scale**: 0-10 (10 = logically perfect)  
**Availability**: All modes

**Note**: Both names are supported for specification compatibility.

Evaluates whether the implementation would function correctly for its intended purpose.

**Assessment Criteria**:
- Logic flow correctness
- Algorithm accuracy
- Data handling appropriateness
- Expected behavior implementation
- Business logic alignment

**Evaluation Focus**:
- Would the code work as intended?
- Are the algorithms correct?
- Does it handle data appropriately?
- Are edge cases covered?

### Clarity (`clarity`)

**Type**: LLM-Assessed  
**Scale**: 0-10 (10 = extremely clear)  
**Availability**: All modes

Evaluates code readability, organization, and maintainability.

**Assessment Criteria**:
- Variable/function naming
- Code organization and structure
- Comment quality and appropriateness
- Consistent style and formatting
- Readability for other developers

**Quality Indicators**:
- Self-documenting code
- Logical organization
- Appropriate abstraction levels
- Clear separation of concerns

### Instruction Adherence (`instruction_adherence`)

**Type**: LLM-Assessed  
**Scale**: 0-10 (10 = perfect adherence)  
**Availability**: All modes

Evaluates how well the agent followed specific instructions and constraints.

**Assessment Criteria**:
- Explicit requirement compliance
- Constraint respect (e.g., "don't modify X")
- Format requirements (e.g., "use TypeScript")
- Scope limitations (e.g., "only fix the bug")
- Style guidelines adherence

**Common Violations**:
- Ignoring explicit constraints
- Exceeding specified scope
- Wrong technology choices
- Format requirement violations

## Metric Configuration

### Settings.json Configuration
```json
{
  "metrics": [
    "response_time",
    "diff_metrics",
    "ast_similarity",
    "completeness",
    "technical_correctness",
    "functional_correctness",
    "clarity",
    "instruction_adherence"
  ]
}
```

### Mode-Specific Availability
| Metric | LLM_Evaluator | PR_Recreate |
|--------|---------------|-------------|
| response_time | ✅ | ✅ |
| diff_metrics | ✅ | ✅ |
| ast_similarity | ❌ | ✅ |
| completeness | ✅ | ✅ |
| technical_correctness | ✅ | ✅ |
| functional_correctness | ✅ | ✅ |
| clarity | ✅ | ✅ |
| instruction_adherence | ✅ | ✅ |

## LLM Evaluator Configuration

### Environment Variables
```bash
LLM_PROVIDER=anthropic
LLM_ANTHROPIC_API_KEY=your_key
LLM_MODEL=claude-3-5-sonnet-20241022
LLM_ANTHROPIC_VERSION=2023-06-01
```

### Supported Providers
- **Anthropic Claude**: Primary provider
- **OpenAI**: Alternative provider (future)

### Error Handling
- Network failures: Metric returns `null`
- API errors: Logged and metric returns `null`
- Parsing failures: Attempts multiple score extraction patterns
- Timeout: Configurable per-provider

## Metric Results Format

### Individual Run Result
```json
{
  "run_id": 1,
  "response_time": 2.45,
  "diff_metrics": {
    "files_added": 1,
    "files_modified": 3,
    "lines_added": 45
  },
  "ast_similarity": 8.5,
  "completeness": 9.0,
  "technical_correctness": 8.5,
  "functional_correctness": 9.0,
  "clarity": 7.5,
  "instruction_adherence": 8.0,
  "error": null
}
```

### Aggregated Results
- **Average**: Mean across all runs per agent
- **Charts**: Visual comparison across agents and prompts
- **Console Output**: Summary statistics

## Best Practices

### Metric Selection
1. **Purpose-driven**: Choose metrics aligned with evaluation goals
2. **Mode-appropriate**: Use AST similarity only in PR_Recreate mode
3. **Balanced**: Include both objective and subjective metrics
4. **Resource-aware**: LLM metrics require API access and cost money

### LLM Assessment Quality
1. **Clear Prompts**: Ensure evaluation criteria are well-defined
2. **Consistent Model**: Use same LLM model/version across evaluations
3. **Multiple Runs**: Average across multiple runs for reliability
4. **Validation**: Spot-check LLM assessments for reasonableness

### Performance Considerations
1. **Parallel Execution**: Enable for faster metric collection
2. **Timeout Configuration**: Set appropriate timeouts for complex tasks
3. **Error Handling**: Design for graceful degradation
4. **Resource Monitoring**: Monitor API usage and costs

### Interpretation Guidelines
1. **Context Matters**: Consider task complexity and requirements
2. **Relative Comparison**: Focus on relative performance between agents
3. **Statistical Significance**: Use multiple runs for reliable comparisons
4. **Holistic View**: Consider all metrics together, not individually
