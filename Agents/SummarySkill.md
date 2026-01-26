# C Project Module Summarizer

## Purpose
Analyze C project modules (.c + .h pairs) using VSCode LSP and generate a lightweight module index for quick navigation. This is the **first step** in a modular API documentation system.

**Role in the overall workflow:**
- This skill: Generate `module_index.md` (navigation layer)
- Future skill: Generate `api/{module}.md` (detailed API documentation)
- Coordinated by: A top-level command that chains these skills together

## Usage
When user requests to "summarize modules" or "generate module overview" for a C project, use this skill to:
1. Find all .c/.h module pairs in the project
2. Extract LSP symbols (function names, struct names, etc.)
3. Generate keyword + description for each module using isolated sub-agents
4. Categorize modules by functionality
5. Output as `docs/module_index.md` - a lightweight index for agent navigation

## Implementation Steps

### Step 1: Discover Module Pairs
```bash
# Find all .c files and check for corresponding .h files
find . -type f -name "*.c" ! -path "*/build/*" ! -path "*/test/*" | sort
```

For each .c file found, check if a corresponding .h exists in the same directory.

### Step 2: Analyze Each Module Independently

For each module pair, perform these actions **without loading other modules**:

1. **Open the .h file** (if exists) in VSCode
2. **Request LSP symbols** for the .h file:
   - Use VSCode command: `vscode.executeDocumentSymbolProvider`
   - Extract: function declarations, struct definitions, enum definitions, macro definitions
   - Categorize by symbol type (Function, Struct, Enum, Variable, etc.)

3. **Open the .c file** in VSCode
4. **Request LSP symbols** for the .c file:
   - Extract ALL function names (both public and static)
   - Extract: global variables, static variables
   - Note: LSP can extract symbols even from files with 1000+ lines efficiently

5. **Generate function name list**:
   - Public functions (declared in .h)
   - Static functions (internal to .c)
   - Count: e.g., "8 public functions, 12 static helper functions"

6. **Optional: Read file header comments** (first 20-30 lines only):
   - Look for module-level documentation blocks
   - If no header comment exists, skip this step
   - Don't read the entire file - LSP symbols provide sufficient context

### Step 3: Generate Module Summary (Isolated Context)

**CRITICAL: Use Task tool to create an independent sub-agent for each module**

This ensures true context isolation - each analysis starts with a clean slate and cannot access information from other modules.

For each module, launch a separate analysis agent:

```python
Task(
  subagent_type: "general-purpose",
  description: f"Analyze module {module_name}",
  prompt: f"""
Analyze this C module and provide:
1. A single keyword (2-4 words) that captures the module's primary responsibility
2. A 2-3 sentence description of what this module does

Module Name: {module_name}

Public Functions (from .h):
{list_of_public_function_names}

Static/Internal Functions (from .c):
{list_of_static_function_names}

Data Structures:
{struct_enum_names}

Statistics:
- {count} public functions
- {count} static functions
- {count} structs/enums

File Header Comment (if available):
{header_comment}

Rules:
- Infer module purpose primarily from function names and their patterns
- Focus on the "what" not the "how"
- No code examples or implementation details
- No cross-references to other modules (you don't have access to them anyway)
- Keep it high-level and user-focused

Output format:
Keyword: [2-4 word phrase]
Description: [2-3 sentences explaining module purpose and main responsibilities]
"""
)
```

**Why Task tool is required:**
- ✅ Each sub-agent starts with empty context window
- ✅ Physically impossible to reference other modules
- ✅ Can run multiple analyses in parallel (faster)
- ✅ True isolation, not just "following rules"

**Expected Output Format from each sub-agent:**
```
Keyword: [2-4 word phrase]
Description: [2-3 sentences explaining module purpose and main responsibilities]
```

### Step 4: Collect Results and Compile Module Index

**Workflow:**
1. Wait for all sub-agents to complete their analysis
2. Collect each sub-agent's output (Keyword + Description)
3. Group modules by functionality/category (infer from keywords and file paths)
4. Compile into `docs/module_index.md`

**Implementation note:**
- You can launch sub-agents in parallel (e.g., 5-10 at a time) to speed up analysis
- Store results in a list/dictionary as they complete
- Automatically categorize modules based on keywords or directory structure
- Sort modules within each category alphabetically

---

## Output Format: `docs/module_index.md`

**Purpose:** This is a lightweight navigation index for agents to quickly find relevant modules without loading all API details.

**Structure:**

```markdown
# Module Index
Generated: {timestamp}

快速导航：根据功能找到对应模块

---

## {Category_1} (e.g., Hardware Control)

### {module_1_name}
**Keyword:** {keyword}
**Files:** `{module_1}.c`, `{module_1}.h`
**Purpose:** {one-line summary from description}
**API Count:** {public_function_count} public functions
**Details:** → [api/{module_1}.md](api/{module_1}.md)

### {module_2_name}
**Keyword:** {keyword}
**Files:** `{module_2}.c`, `{module_2}.h`
**Purpose:** {one-line summary from description}
**API Count:** {public_function_count} public functions
**Details:** → [api/{module_2}.md](api/{module_2}.md)

---

## {Category_2} (e.g., Communication)

### {module_3_name}
**Keyword:** {keyword}
**Files:** `{module_3}.c`, `{module_3}.h`
**Purpose:** {one-line summary from description}
**API Count:** {public_function_count} public functions
**Details:** → [api/{module_3}.md](api/{module_3}.md)

---

[... repeat for all categories ...]

---

## Quick Search by Function

当你知道需要什么功能时，快速定位模块：

- **{Function_Type_1}** → {module_a}, {module_b}, {module_c}
- **{Function_Type_2}** → {module_d}, {module_e}
- **{Function_Type_3}** → {module_f}

{Generate this section by inferring from module keywords and descriptions}

---

## Statistics

- Total Modules: {count}
- Total Public APIs: {sum_of_all_public_functions}
- Categories: {category_count}
```

---

**Categorization Guidelines:**

Infer categories from keywords and file paths. Common categories include:

- **Hardware Control** - Modules controlling physical devices (fan, relay, motor, etc.)
- **Sensor & Measurement** - ADC, sensor reading, data acquisition
- **Communication** - UART, CAN, SPI, I2C protocols
- **System Management** - Initialization, configuration, watchdog, fault handling
- **Data Storage** - Flash, EEPROM, file systems
- **Algorithm & Processing** - Filtering, calculations, control loops
- **User Interface** - Display, buttons, LED indicators
- **Power Management** - Battery, charging, power modes

---

**Quick Search Generation:**

Group modules by common use cases. Examples:

- **初始化硬件** → List modules with `init` in function names
- **读取传感器数据** → List modules with sensor/adc keywords
- **发送/接收数据** → List communication-related modules
- **错误处理/保护** → List fault/watchdog/safety modules
- **配置参数** → List modules with config/settings keywords

---

**Note:** The `api/{module}.md` links will be generated by a separate skill (not part of this skill)

## VSCode LSP Commands to Use

Access these through VSCode's command palette or programmatically:

1. **Document Symbols**: 
   - Command: `vscode.executeDocumentSymbolProvider`
   - Returns: List of symbols (functions, structs, variables) with their kinds
   
2. **Document Outline**:
   - UI: View → Outline panel
   - Shows hierarchical structure of current file

3. **Go to Symbol**:
   - Command: `workbench.action.gotoSymbol`
   - Quick navigation to see all symbols

## Example Workflow
```bash
# 1. Main agent: Find modules
$ find . -name "*.c" | head -3
./src/fan_control.c
./src/relay_control.c
./src/sensor_manager.c

# 2. Main agent: Extract LSP symbols for fan_control
# Open fan_control.h → Get symbols → See: fan_init(), fan_switch_mode(), fan_get_speed()
# Open fan_control.c → Get symbols → See: static functions, implementation details
# Read header comments → See: "Fan control subsystem for thermal management"

# 3. Main agent: Launch Task tool for fan_control analysis
Task(
  subagent_type: "general-purpose",
  description: "Analyze fan_control module",
  prompt: "Analyze this module...\nPublic Functions: fan_init, fan_switch_mode, fan_get_speed\n..."
)

# 3a. Sub-agent (independent context): Receives only fan_control info
# Sub-agent output:
Keyword: Fan Thermal Management
Description: Manages cooling fan operations including initialization, mode switching,
and speed monitoring. Provides interface for thermal management system to control
fan behavior based on temperature conditions.

# 4. Main agent: Launch Task tool for relay_control (parallel or sequential)
# This sub-agent has ZERO knowledge of fan_control - fresh context
Task(
  subagent_type: "general-purpose",
  description: "Analyze relay_control module",
  prompt: "Analyze this module...\nPublic Functions: relay_init, relay_set_state, ...\n..."
)

# 5. Main agent: Collect all results and compile markdown
```

**Key point:** Each module analysis happens in a separate sub-agent = true isolation

## Important Constraints

### What to INCLUDE in analysis:
- **Complete list of function names** - most important for inferring module purpose
  - Example: `fan_init()`, `fan_set_speed()`, `fan_get_status()` → clearly a fan control module
- Function counts and visibility (e.g., "5 public functions, 3 static helpers")
- Struct/enum names that indicate data domain
- Naming patterns that reveal module responsibility
  - Prefixes like `adc_`, `uart_`, `relay_` indicate module scope
  - Verb patterns like `init`, `start`, `stop`, `read`, `write` show operations
- Header comments (if they exist and add context)

### What to EXCLUDE:
- Detailed function signatures
- Implementation logic
- Cross-module dependencies
- Specific algorithms or data structures

### Context Isolation (Technical Enforcement):
- **MUST use Task tool** to create independent sub-agents for each module
- Each sub-agent has a separate context window - physically cannot see other modules
- This is **technical isolation**, not just instruction-based isolation
- Do NOT analyze multiple modules in the same agent/conversation thread
- Each module summary is truly self-contained by design

**Why this matters:**
- Without Task tool: Agent accumulates context, can "remember" previous modules
- With Task tool: Each analysis is genuinely independent, ensures unbiased summaries

## Output Location

Save the generated module index to:
```
./docs/module_index.md
```

**Directory structure after this skill:**
```
docs/
  └── module_index.md       # Generated by this skill

# Future structure (after API extraction skill):
docs/
  ├── module_index.md       # Generated by SummarySkill
  └── api/                  # Generated by future APIExtractorSkill
      ├── fan_control.md
      ├── relay_control.md
      └── ...
```

If `docs/` doesn't exist, create it.

## Error Handling

- If .h file is missing: Note "Header-only: No" and proceed with .c file only
- If LSP fails: Fall back to regex parsing for function names (scan for `^[a-zA-Z_].*\(`)
- If module has no functions: Note "Configuration/Data Module" and describe based on structs/macros

## Success Criteria

A well-generated `module_index.md` should:
1. ✅ Have one entry per .c file found
2. ✅ Each entry has a concise keyword (not generic like "utility")
3. ✅ Purpose statements focus on business function, not technical details
4. ✅ No module description mentions another module by name
5. ✅ **Each module analyzed using separate Task tool invocation** (context isolation)
6. ✅ Modules properly categorized (Hardware/Sensor/Communication/etc.)
7. ✅ "Quick Search" section includes 5-10 common use cases
8. ✅ Statistics section is accurate
9. ✅ File is lightweight (<50KB) for fast agent loading
10. ✅ Links to `api/{module}.md` are present (even though files don't exist yet)

## Example Output

**File:** `docs/module_index.md`

```markdown
# Module Index
Generated: 2026-01-26 14:30:00

快速导航：根据功能找到对应模块

---

## Hardware Control

### fan_control
**Keyword:** Fan Thermal Management
**Files:** `fan_control.c`, `fan_control.h`
**Purpose:** 控制冷却风扇的初始化、模式切换和速度监控
**API Count:** 5 public functions
**Details:** → [api/fan_control.md](api/fan_control.md)

### relay_control
**Keyword:** Relay Switching Logic
**Files:** `relay_control.c`, `relay_control.h`
**Purpose:** 高压继电器控制，包含预充电序列和接触清理算法
**API Count:** 8 public functions
**Details:** → [api/relay_control.md](api/relay_control.md)

---

## Sensor & Measurement

### adc_manager
**Keyword:** Analog Signal Acquisition
**Files:** `adc_manager.c`, `adc_manager.h`
**Purpose:** 多通道 ADC 采样，提供校准、滤波和单位转换
**API Count:** 12 public functions
**Details:** → [api/adc_manager.md](api/adc_manager.md)

### sensor_manager
**Keyword:** Sensor Data Processing
**Files:** `sensor_manager.c`, `sensor_manager.h`
**Purpose:** 统一管理多个传感器数据采集和处理
**API Count:** 6 public functions
**Details:** → [api/sensor_manager.md](api/sensor_manager.md)

---

## Communication

### uart_driver
**Keyword:** Serial Communication
**Files:** `uart_driver.c`, `uart_driver.h`
**Purpose:** UART 串口通信驱动，支持中断和 DMA 模式
**API Count:** 10 public functions
**Details:** → [api/uart_driver.md](api/uart_driver.md)

---

## Quick Search by Function

当你知道需要什么功能时，快速定位模块：

- **初始化硬件** → fan_control, relay_control, uart_driver, adc_manager
- **读取传感器数据** → adc_manager, sensor_manager
- **发送/接收数据** → uart_driver
- **控制执行器** → fan_control, relay_control
- **数据处理** → sensor_manager, adc_manager

---

## Statistics

- Total Modules: 5
- Total Public APIs: 41
- Categories: 3
```

## Usage in Claude Code

To use this skill, tell Claude Code:
```
"Use the C Project Module Summarizer skill to analyze all modules in this project
and create a module index. Process each module independently."
```

Claude Code will then:
1. Run the find command to locate all .c/.h module pairs
2. For each module, extract LSP symbols (function names, structs, etc.)
3. Launch independent sub-agents to generate keyword + description for each module
4. Group modules by category (inferred from keywords/paths)
5. Generate Quick Search section based on common use cases
6. Compile into `./docs/module_index.md`

**Note:** This skill only generates the module index (navigation layer). API details are generated by a separate skill.
