# 硬性约束

本文件定义 Universal Codebase Documenter 所有 Agent 必须遵守的硬性约束。

---

## 一、Token 与批次限制

1. 单次 Task 子 Agent 调用上下文 < **100-200K tokens**
2. 批次大小默认 **20 个文件**，可根据文件平均大小调整（大文件减少批次量）
3. 单个文件超过 **2000 行**时，分段读取，优先读取导出/公开接口部分

## 二、文件与路径命名

1. 所有生成的文件名使用**小写加连字符**：`module-detail.md`、`api-reference.md`
2. 模块 ID 格式：`m001`、`m002`...（三位零填充）
3. workspace 内所有路径使用**相对路径**，禁止绝对路径
4. JSON 文件中路径分隔符统一使用 `/`

## 三、字段最小长度

| 字段 | 最小长度 |
|------|----------|
| `responsibility` | 50 字符 |
| `description` | 20 字符 |
| `coreLogic` | 100 字符 |
| 模块名称 | 2 字符 |

不满足最小长度时，Agent 必须补充分析直到达标，而非填充无意义内容。

## 四、JSON Schema 验证

1. 所有中间产物 JSON 必须通过对应 `schemas/*.schema.json` 验证
2. 验证失败时最多重试 **3 次**
3. 第 3 次仍失败，标记模块为 `failed`，记录错误到 `checklist.json` 的 `errors[]`
4. 失败模块设置 `reviewRequired: true`

## 五、Mermaid 图约束

1. 每张图最多 **50 个节点**
2. 节点 ID 仅使用**字母、数字、下划线**（禁止连字符、空格、特殊字符）
3. 超过 50 节点时，自动按类别拆分为子图
4. 边标签长度 ≤ 30 字符
5. 使用 `graph TD` 或 `graph LR` 方向，禁止混合方向

## 六、Checklist 协议

1. **分派前**：读取 `checklist.json`，筛选 `pending` 状态模块组成批次
2. **执行中**：更新模块状态为 `in_progress`
3. **完成后**：更新为 `completed`；失败则 `failed` + 写入 `errors[]`
4. **阶段推进**：所有模块完成/失败/跳过后，推进全局 `phases` 状态
5. **断点续传**：重新调用时从 `checklist.json` 未完成处继续
6. **并发安全**：同一时刻只有 Orchestrator 写 checklist，子 Agent 返回结果后由 Orchestrator 统一更新

## 七、中间产物规范

1. 每个中间产物 JSON 文件体积 < **500KB**
2. `file-index.json` 单条记录 < **200 bytes**
3. 数组字段使用确定类型，禁止 `any[]`
4. 所有 JSON 使用 **2 空格缩进**
5. 日期格式：ISO 8601（`2026-02-08T10:00:00Z`）

## 八、输出文档规范

1. 所有输出 Markdown 使用 UTF-8 编码
2. 标题层级从 `#` 开始，不跳级
3. 代码块必须标注语言标识符
4. 内部链接使用相对路径
5. 每个模块文档包含返回导航链接

## 九、错误处理

1. 文件读取失败：记录错误，跳过该文件，继续处理其他文件
2. 模块分析失败：重试最多 3 次，仍失败标记 `reviewRequired`
3. 模板渲染失败：输出原始 JSON 数据作为降级方案
4. 子 Agent 超时：Orchestrator 记录超时，标记模块为 `failed`

## 十、禁止事项

1. **禁止**在子 Agent 之间直接传递大量源代码文本
2. **禁止**在 JSON 中间产物中存储完整源代码（仅存储分析结果）
3. **禁止**修改目标代码仓的任何文件
4. **禁止**生成超过 50 节点的单张 Mermaid 图
5. **禁止**跳过 Schema 验证直接写入最终文档

## 十一、Supervisor 协议

1. Supervisor 在每个 Phase 完成后被调用**一次**
2. Supervisor 拥有**执行权**，Orchestrator 无条件执行其 actions
3. Supervisor 不直接调用子 Agent，通过 actions 指令 Orchestrator 执行
4. 决策 JSON 必须符合 `schemas/review-decision.schema.json`
5. `rejected` 最多连续 2 次，第 3 次自动升级为 `escalate`
6. Supervisor 审查超时则视为 `approved`（不阻塞流程）
7. Supervisor 的 `supervisorNotes` 写入 checklist 对应模块
8. `workspace/reviews/` 目录保留所有历史审查记录

## 十二、层次结构分析约束

1. **自底向上分层策略**：从直接包含代码文件的文件夹（L0）开始，逐层向上构建
2. **L0 层（叶子文件夹）定义**：该文件夹内直接包含源代码文件，且其子文件夹（如有）不包含代码文件
3. **层次关系验证**：每层的 `childLayers` 必须指向真实存在的下一层文件夹
4. **职责描述要求**：每个文件夹的 `responsibility` 描述 ≥ 20 字符，基于实际代码内容推断
5. **层级深度限制**：最多记录到 L5 层，超过 L5 的归并到 L5
6. **Mermaid 图层次展示**：架构图必须体现自底向上的层次关系，使用 subgraph 按层分组
7. **排除目录**：node_modules、.git、build、dist、coverage、.cache 等非源码目录不参与层次分析
