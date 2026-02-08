# Universal Codebase Documenter

语言无关的代码仓文档自动生成 Skill。通过多阶段 Agent 协作，分析任意代码仓并生成完整的架构、模块、API 文档。

## 支持语言

TypeScript/JavaScript, Python, Go, Rust, Java/Kotlin, C/C++, C#, Ruby, PHP, Swift（通过文件扩展名自动检测）

## 输出结构

```
workspace/docs/
├── 01-architecture-overview.md
├── 02-module-relationships.md
├── modules/{module-name}.md
├── api/{module-name}-api.md
└── 05-summary-hub.md
```

## Agent 清单

| Agent | 文件 | 调用方式 |
|-------|------|----------|
| ArchitectureAnalyzer | `Agents/ArchitectureAnalyzerSkill.md` | Phase 1, Task 子 Agent, 1 次 |
| RelationshipMapper | `Agents/RelationshipMapperSkill.md` | Phase 2, Task 子 Agent, 按批次 |
| ModuleAnalyzer | `Agents/ModuleAnalyzerSkill.md` | Phase 3, Task 子 Agent, 每模块独立 |
| APIExtractor | `Agents/APIExtractorSkill.md` | Phase 4, Task 子 Agent, 每模块独立 |
| Summarizer | `Agents/SummarizerSkill.md` | Phase 5, Task 子 Agent, 1 次 |
| **Supervisor** | `Agents/SupervisorSkill.md` | **每个 Phase 完成后**, Task 子 Agent, 1 次 |

---

# Workflow

**你（Orchestrator）就是 SKILL.md 的执行者。** 按以下阶段顺序执行，每个阶段调用对应的 Agent。所有中间数据通过 `workspace/` 文件交换，Agent 之间不直接通信。

## 通信协议

- 你是唯一操作 `checklist.json` 的角色
- 子 Agent 通过 Task 工具调用，结果写入 workspace JSON 文件
- 你读取结果并更新 checklist
- 所有路径使用相对路径

## Supervisor 审查循环（适用于每个 Phase）

每个 Phase 完成基础 Schema 验证后，执行以下统一的 Supervisor 审查循环：

```
Phase N 子 Agent 完成 → 基础 Schema 验证
    ↓
调用 Supervisor（Task 子 Agent）
    ↓
读取 workspace/reviews/phase-{N}-review.json
    ↓
switch(verdict):
  approved → 进入 Phase N+1
  approved_with_actions → 逐条执行 actions → 进入 Phase N+1
  rejected → 重做 Phase N（reject 计数 +1，≥3 则 escalate）
  escalate → 暂停，报告用户
```

**actions 执行规则**：
- `retry_module` → 重新调用对应子 Agent 分析该模块
- `skip_module` → 更新 checklist 该模块状态为 `skipped`
- `update_checklist` → 按指定 field/value 修改 checklist
- `adjust_config` → 记录配置调整，应用到下一阶段
- `flag_for_user` → 记录到最终报告，不阻塞流程

**审查决策存放目录**：`workspace/reviews/`

**reject 计数**：每个 Phase 维护独立的 reject 计数器，连续 rejected ≥ 3 次自动升级为 escalate。

---

## Phase 0: Discovery（你自己执行）

> 不调用子 Agent，由你直接完成。

### 步骤

1. **扫描目标代码仓**，用 Glob 识别所有源代码文件，按扩展名检测语言：

   | 扩展名 | 语言 |
   |--------|------|
   | `.ts/.tsx/.js/.jsx` | TypeScript/JavaScript |
   | `.py` | Python |
   | `.go` | Go |
   | `.rs` | Rust |
   | `.java/.kt` | Java/Kotlin |
   | `.c/.h` | C/C++ |
   | `.cs` | C# |
   | `.rb` | Ruby |
   | `.php` | PHP |
   | `.swift` | Swift |

2. **生成 `workspace/index/file-index.json`**：
   ```json
   [
     { "id": "f001", "path": "src/auth/index.ts", "language": "typescript", "lines": 245, "sizeBytes": 8120 }
   ]
   ```
   **CRITICAL**: 单条记录 < 200 bytes。

3. **模块分组** → `workspace/index/module-index.json`：
   ```json
   [
     { "id": "m001", "name": "auth", "files": ["f001", "f002"], "category": "core", "primaryLanguage": "typescript" }
   ]
   ```
   分组策略：同一目录下的相关文件归为一个模块。

4. **初始化 `workspace/checklist.json`**：按 `checklist-schema.json` 格式创建，所有模块所有阶段设为 `pending`，全局 phases 中 `discovery` 设为 `completed`。

### 完成条件
- `file-index.json` 已写入
- `module-index.json` 已写入
- `checklist.json` 已初始化，`phases.discovery = "completed"`

### Supervisor 审查

```
Task(subagent_type="general-purpose", prompt="""
你是 Supervisor。

请阅读以下指令文件获取完整审查流程：
<read_file>/Agents/SupervisorSkill.md</read_file>

当前 Phase: 0 (discovery)
工作目录: {workspace_path}

输入：
- workspace/checklist.json
- workspace/index/file-index.json
- workspace/index/module-index.json
- /constraints.md

输出：workspace/reviews/phase-0-review.json
""")
```

**决策执行**：
1. 读取 `workspace/reviews/phase-0-review.json`
2. 将 `moduleNotes` 写入 checklist 各模块的 `supervisorNotes`
3. 按 verdict 执行：
   - `approved` → 进入 Phase 1
   - `approved_with_actions` → 逐条执行 actions → 进入 Phase 1
   - `rejected` → 重做 Phase 0（reject 计数 +1，≥3 则 escalate）
   - `escalate` → 暂停，报告用户

---

## Phase 1: Architecture → 调用 `Agents/ArchitectureAnalyzerSkill.md`

> 1 次 Task 调用。

### 前置检查
读取 `checklist.json`，确认 `phases.discovery == "completed"`。

### 调用

```
更新 checklist: phases.architecture = "in_progress"

Task(subagent_type="general-purpose", prompt="""
你是 ArchitectureAnalyzer。

请阅读以下指令文件获取完整分析流程：
<read_file>/Agents/ArchitectureAnalyzerSkill.md</read_file>

工作目录: {workspace_path}
目标代码仓: {target_repo_path}

输入：
- workspace/index/file-index.json
- workspace/index/module-index.json
- 目标代码仓源文件

输出：workspace/architecture/architecture-result.json

请严格按照 ArchitectureAnalyzerSkill.md 中的步骤执行。
""")
```

### 后处理
1. 验证 `architecture-result.json` 格式完整性
2. 更新 checklist：`phases.architecture = "completed"`，所有模块 `architecture = "completed"`
3. 验证失败 → 重试最多 3 次，仍失败则 `phases.architecture = "failed"`

### Supervisor 审查

```
Task(subagent_type="general-purpose", prompt="""
你是 Supervisor。

请阅读以下指令文件获取完整审查流程：
<read_file>/Agents/SupervisorSkill.md</read_file>

当前 Phase: 1 (architecture)
工作目录: {workspace_path}

输入：
- workspace/checklist.json
- workspace/architecture/architecture-result.json
- /constraints.md

输出：workspace/reviews/phase-1-review.json
""")
```

**决策执行**：
1. 读取 `workspace/reviews/phase-1-review.json`
2. 将 `moduleNotes` 写入 checklist 各模块的 `supervisorNotes`
3. 按 verdict 执行：
   - `approved` → 进入 Phase 2
   - `approved_with_actions` → 逐条执行 actions → 进入 Phase 2
   - `rejected` → 重做 Phase 1（reject 计数 +1，≥3 则 escalate）
   - `escalate` → 暂停，报告用户

---

## Phase 2: Relationships → 调用 `Agents/RelationshipMapperSkill.md`

> 按批次调用，每批 ≤ 20 个模块。

### 前置检查
确认 `phases.architecture == "completed"`。

### 调用（对每批模块）

```
更新 checklist: phases.relationships = "in_progress"

// 从 checklist 筛选 relationships == "pending" 的模块，每批 20 个
Task(subagent_type="general-purpose", prompt="""
你是 RelationshipMapper。

请阅读以下指令文件获取完整分析流程：
<read_file>/Agents/RelationshipMapperSkill.md</read_file>

工作目录: {workspace_path}
当前批次模块 ID: {module_ids_batch}

输入：
- workspace/index/file-index.json
- workspace/index/module-index.json
- workspace/architecture/architecture-result.json
- 目标代码仓源文件

输出（追加写入）：
- workspace/relationships/import-graph-edges.json
- workspace/relationships/data-flow-edges.json
- workspace/relationships/communication-patterns.json

输出必须符合 schemas/relationship-edges.schema.json。
""")
```

### 后处理
1. 每批完成后更新对应模块 `relationships = "completed"`
2. 所有批次完成后合并 relationships 文件，去重
3. Schema 验证，更新 `phases.relationships = "completed"`

### Supervisor 审查

```
Task(subagent_type="general-purpose", prompt="""
你是 Supervisor。

请阅读以下指令文件获取完整审查流程：
<read_file>/Agents/SupervisorSkill.md</read_file>

当前 Phase: 2 (relationships)
工作目录: {workspace_path}

输入：
- workspace/checklist.json
- workspace/relationships/import-graph-edges.json
- workspace/relationships/data-flow-edges.json
- workspace/relationships/communication-patterns.json
- /constraints.md

输出：workspace/reviews/phase-2-review.json
""")
```

**决策执行**：
1. 读取 `workspace/reviews/phase-2-review.json`
2. 将 `moduleNotes` 写入 checklist 各模块的 `supervisorNotes`
3. 按 verdict 执行：
   - `approved` → 进入 Phase 3 & 4
   - `approved_with_actions` → 逐条执行 actions → 进入 Phase 3 & 4
   - `rejected` → 重做 Phase 2（reject 计数 +1，≥3 则 escalate）
   - `escalate` → 暂停，报告用户

---

## Phase 3 & 4: Analysis + API Extraction（可并行）

> 对每个模块启动两个独立 Task，Phase 3 和 Phase 4 可并行执行。

### 前置检查
确认 `phases.relationships == "completed"`。

### Phase 3 调用 → `Agents/ModuleAnalyzerSkill.md`（每模块）

```
更新 checklist: phases.analysis = "in_progress"，当前模块 logic = "in_progress"

Task(subagent_type="general-purpose", prompt="""
你是 ModuleAnalyzer。

请阅读以下指令文件获取完整分析流程：
<read_file>/Agents/ModuleAnalyzerSkill.md</read_file>

模块 ID: {module_id}
模块名: {module_name}
源文件: {file_paths}

输出：workspace/analysis/{module_id}.json
输出必须符合 schemas/module-analysis.schema.json。
""")
```

### Phase 4 调用 → `Agents/APIExtractorSkill.md`（每模块）

```
更新 checklist: phases.apiExtraction = "in_progress"，当前模块 apis = "in_progress"

Task(subagent_type="general-purpose", prompt="""
你是 APIExtractor。

请阅读以下指令文件获取完整分析流程：
<read_file>/Agents/APIExtractorSkill.md</read_file>

模块 ID: {module_id}
模块名: {module_name}
源文件: {file_paths}

输出：workspace/apis/{module_id}-api.json
输出必须符合 schemas/api-interface.schema.json。
""")
```

### 并行策略
- **同一模块的 Phase 3 + Phase 4 可以并行**（在同一条消息中发两个 Task 调用）
- 同时最多 5-10 个 Task 在运行
- 控制总上下文 < 100-200K tokens

### 后处理
1. 每个 Task 返回后验证 JSON Schema
2. 通过 → 更新模块 `logic/apis = "completed"`
3. 失败 → 重试最多 3 次，仍失败 → `failed` + `errors[]` + `reviewRequired: true`
4. 所有模块处理完 → `phases.analysis = "completed"`, `phases.apiExtraction = "completed"`

### Supervisor 审查（Phase 3 + Phase 4 合并审查）

```
Task(subagent_type="general-purpose", prompt="""
你是 Supervisor。

请阅读以下指令文件获取完整审查流程：
<read_file>/Agents/SupervisorSkill.md</read_file>

当前 Phase: 3 (analysis) + 4 (apiExtraction) 合并审查
工作目录: {workspace_path}

输入：
- workspace/checklist.json
- workspace/analysis/m*.json（所有模块分析结果）
- workspace/apis/m*-api.json（所有 API 提取结果）
- /constraints.md

输出：
- workspace/reviews/phase-3-review.json（analysis 审查）
- workspace/reviews/phase-4-review.json（apiExtraction 审查）

请分别对 Phase 3 和 Phase 4 输出独立的审查决策文件。
""")
```

**决策执行**：
1. 分别读取 `phase-3-review.json` 和 `phase-4-review.json`
2. 将两份审查的 `moduleNotes` 合并写入 checklist 各模块的 `supervisorNotes`
3. 对每份审查分别按 verdict 执行：
   - `approved` → 该 Phase 通过
   - `approved_with_actions` → 逐条执行 actions
   - `rejected` → 重做对应 Phase 的失败模块（reject 计数 +1，≥3 则 escalate）
   - `escalate` → 暂停，报告用户
4. 两个 Phase 均通过后 → 进入 Phase 5

---

## Phase 5: Rendering → 调用 `Agents/SummarizerSkill.md` + 模板渲染

> 分两步：先调用 Summarizer 生成汇总数据，再由你渲染所有模板。

### 前置检查
确认 `phases.analysis == "completed"` 且 `phases.apiExtraction == "completed"`。

### Step 1: 调用 Summarizer

```
更新 checklist: phases.rendering = "in_progress"

Task(subagent_type="general-purpose", prompt="""
你是 Summarizer。

请阅读以下指令文件获取完整指令：
<read_file>/Agents/SummarizerSkill.md</read_file>

工作目录: {workspace_path}

输入：
- workspace/checklist.json
- workspace/architecture/architecture-result.json
- workspace/index/module-index.json
- workspace/analysis/m*.json
- workspace/apis/m*-api.json

输出：workspace/summary-hub-data.json
""")
```

### Step 2: 模板渲染（你自己执行）

依次用中间产物 JSON 数据渲染 `.eta` 模板，写入 `workspace/docs/`：

| 模板 | 数据源 | 输出 | 渲染次数 |
|------|--------|------|----------|
| `templates/01-architecture-overview.md.eta` | `architecture/architecture-result.json` | `docs/01-architecture-overview.md` | 1 次 |
| `templates/02-module-relationships.md.eta` | `relationships/*.json` | `docs/02-module-relationships.md` | 1 次 |
| `templates/03-module-detail.md.eta` | `analysis/m{NNN}.json` | `docs/modules/{module-name}.md` | 每模块 |
| `templates/04-api-reference.md.eta` | `apis/m{NNN}-api.json` | `docs/api/{module-name}-api.md` | 每模块 |
| `templates/05-summary-hub.md.eta` | `summary-hub-data.json` | `docs/05-summary-hub.md` | 1 次 |

**渲染规则**：
- 读取 `.eta` 模板内容
- 用 JSON 数据替换 `<%= it.xxx %>` 变量
- `<% it.array.forEach(function(item) { %>` 展开数组
- `<% if (condition) { %>` 条件渲染
- 将结果写入 `workspace/docs/` 对应路径

### 后处理
1. 更新所有模块 `rendered = "completed"`
2. 更新 `phases.rendering = "completed"`
3. 输出最终报告：成功/失败模块统计

### Supervisor 审查

```
Task(subagent_type="general-purpose", prompt="""
你是 Supervisor。

请阅读以下指令文件获取完整审查流程：
<read_file>/Agents/SupervisorSkill.md</read_file>

当前 Phase: 5 (rendering)
工作目录: {workspace_path}

输入：
- workspace/checklist.json
- workspace/docs/（所有生成的文档）
- workspace/summary-hub-data.json
- /constraints.md

输出：workspace/reviews/phase-5-review.json
""")
```

**决策执行**：
1. 读取 `workspace/reviews/phase-5-review.json`
2. 将 `moduleNotes` 写入 checklist 各模块的 `supervisorNotes`
3. 按 verdict 执行：
   - `approved` → 流程完成，输出最终报告
   - `approved_with_actions` → 逐条执行 actions → 流程完成
   - `rejected` → 重做 Phase 5（reject 计数 +1，≥3 则 escalate）
   - `escalate` → 暂停，报告用户

---

# Checklist 管理协议

贯穿整个 workflow 的 checklist 管理规则：

1. **只有你（Orchestrator）写 checklist.json**，子 Agent 不写
2. 每次调度前读 checklist 获取当前状态
3. 子 Agent 返回后立即更新对应模块的对应阶段状态
4. 失败记录到模块 `errors[]`，连续失败 3 次设 `reviewRequired: true`
5. 阶段内所有模块处理完毕 → 推进全局 phase 状态

---

# 断点续传

当被重新调用时：

1. 检查 `workspace/checklist.json` 是否存在
2. 若存在 → 读取，找到第一个非 `completed` 的 phase
3. 在该 phase 内找 `pending` 或 `failed`（重试 < 3）的模块
4. 从该处继续执行，不重复已完成的工作

---

# 错误处理

| 场景 | 处理 |
|------|------|
| 子 Agent 返回无效 JSON | 重试该模块，最多 3 次 |
| 子 Agent 超时/崩溃 | 记录错误，标记 `failed` |
| 模板渲染失败 | 输出原始 JSON 作为降级方案 |
| >50% 模块失败 | 暂停执行，报告给用户 |

---

# 约束速查

- 完整约束见 `constraints.md`
- 批次大小：20 个文件
- 单批上下文 < 100-200K tokens
- `responsibility` ≥ 50 字符, `coreLogic` ≥ 100 字符, `description` ≥ 20 字符
- Mermaid 图 ≤ 50 节点，节点 ID 仅 `[a-zA-Z0-9_]`
- 模块 ID 格式：`m001`, `m002`...
- 文件名小写加连字符
- JSON Schema 验证，最多 3 次重试
- 禁止修改目标代码仓
