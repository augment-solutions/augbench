# Changelog

All notable changes to this project will be documented in this file.

## [0.2.0] - 2024-12-19

### Added
- **Tree-sitter WASM support** for true AST parsing in AST similarity metric
- Grammar files for JavaScript, TypeScript, and Python in `grammars/` directory
- Validator checks for tree-sitter grammar file availability
- **AST similarity test script** (`scripts/test-ast-similarity.mjs`) for manual validation
- Comprehensive AST testing documentation in `docs/AST_Testing.md`
- Token optimization for LLM evaluator metrics with diff-first policy
- Enhanced Cursor CLI troubleshooting documentation in Installation_Usage.md
- Comprehensive unit test coverage for adapters, metrics, and prompt templates
- Centralized LLM metric prompt templates in `src/metrics/promptTemplates.js`

### Changed
- **PR_Recreate mode**: Now selects PRs with ≥2 files changed; threshold is fixed (not configurable)
- **BREAKING**: Simplified adapter architecture - removed `AugmentCLIAdapter` in favor of `ShellCommandAdapter`
- All agents now use `commandTemplate` configuration via `ShellCommandAdapter`
- Enhanced `DiffMetric` to include untracked files and handle binary files properly
- Improved LLM metric prompts with concise, token-efficient templates
- Enhanced `ShellCommandAdapter` logging with detailed error diagnostics
- Replaced misleading "skeleton complete" message with accurate completion status

### Fixed
- **CRITICAL**: PR_Recreate mode now detects squash/rebase merges, not just traditional merge commits
- Added missing `debug` and `success` methods to `Logger` class to prevent runtime errors

### Improved
- **PR_Recreate Prompt Generation**: Now uses LLM-based generation with actual PR descriptions instead of generic templates
- **AST Similarity**: Now uses web-tree-sitter WASM for true structural analysis with graceful fallback
- **Diff Metrics**: Now detects untracked files via `git ls-files --others --exclude-standard`
- **Binary File Handling**: Excludes binary files from line count calculations
- **LLM Token Efficiency**: Prefers unified diffs over full output when smaller than 70% of original
- **Error Diagnostics**: Enhanced logging shows full command, exit codes, and stderr tail
- **Prompt Quality**: Standardized format with clear criteria bullets and consistent scoring

### Technical Details
- `PRAnalyzer.findRecentMergedPRs()` now examines ALL PRs from last 12 months (no artificial limits)
- **Enhanced PR Detection**: Now detects merge commits, squash merges, and rebase merges using commit message patterns
- PR selection: examines all commits in time window → filters for PR patterns → filters by ≥2 files changed → selects N most recent → sorts chronologically
- Time window optimized to 12 months for comprehensive PR candidate search
- Supports repositories using any merge strategy (GitHub's "Create merge commit", "Squash and merge", "Rebase and merge")
- File change counting includes all git statuses: Added, Modified, Renamed, Copied, Deleted
- `PromptGenerator` now supports both topic-based (LLM_Evaluator) and PR-based (PR_Recreate) prompt generation
- PR_Recreate mode uses `generatePromptForPR()` with sophisticated LLM processing of PR descriptions
- `ASTSimilarityMetric` implements full WASM tree-sitter with weighted feature comparison
- Grammar files downloaded for JavaScript, TypeScript, and Python (402KB, 1.38MB, 447KB)
- `AdapterFactory` now uses minimal mapping logic with `commandTemplate` support
- `LLMEvaluatorMetric` implements `optimizePayload()` with graceful fallback to truncation
- All LLM metrics use centralized prompt templates from `METRIC_PROMPTS`
- Enhanced test coverage in `src/tests/unit/` for all modified components

### Documentation
- Updated `docs/Metrics.md` with new diff behavior and LLM evaluation policies
- Added Cursor CLI troubleshooting section to `docs/Installation_Usage.md`
- Documented token optimization strategies and payload selection logic

### Migration Guide
- **Agent Configuration**: Ensure all agents have `commandTemplate` in `settings.json`
- **No Breaking Changes**: Existing `settings.json` configurations remain compatible
- **Improved Reliability**: Enhanced error reporting helps diagnose agent execution issues

### Files Modified
- `src/adapters/AdapterFactory.js` - Simplified to use ShellCommandAdapter only
- `src/adapters/AugmentCLIAdapter.js` - Removed (functionality moved to ShellCommandAdapter)
- `src/adapters/ShellCommandAdapter.js` - Enhanced logging and error reporting
- `src/cli/BenchmarkRunner.js` - Fixed completion status message
- `src/metrics/DiffMetric.js` - Added untracked file detection and binary file handling
- `src/metrics/LLMEvaluatorMetric.js` - Added token optimization with diff-first policy
- `src/metrics/MetricsFactory.js` - Updated to use centralized prompt templates
- `src/metrics/promptTemplates.js` - New file with token-efficient LLM prompts
- `docs/Installation_Usage.md` - Added Cursor troubleshooting section
- `docs/Metrics.md` - Updated diff behavior and LLM evaluation documentation

### Tests Added
- `src/tests/unit/adapters/AdapterFactory.test.js` - Adapter factory mapping tests
- `src/tests/unit/metrics/DiffMetric.test.js` - Diff metric with untracked files tests
- `src/tests/unit/metrics/LLMEvaluatorMetric.test.js` - Token optimization tests
- `src/tests/unit/metrics/promptTemplates.test.js` - Prompt template validation tests
