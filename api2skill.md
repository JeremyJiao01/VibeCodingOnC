针对嵌入式 C/H 项目的适配方案
既然你已经有了解析 .h 和 .c 文件的 skill，下一步是设计嵌入式专用的 IR 结构和输出格式：
1. 定义嵌入式 IR 结构
```typescript
// 嵌入式项目的中间表示
interface EmbeddedSkillDocument {
  meta: EmbeddedMeta;
  modules: ModuleDocument[];        // 模块/外设分组
  dataTypes: DataTypeGroupDocument[]; // 结构体/枚举分组
  hardwareAbstractions: HALDocument[]; // HAL 层描述（可选）
}

interface ModuleDocument {
  name: string;           // 例如 "GPIO", "UART", "SPI"
  header: string;         // 对应的 .h 文件路径
  description?: string;
  functions: FunctionDocument[];
  dependencies?: string[]; // 依赖的其他模块
}

interface FunctionDocument {
  name: string;           // 函数名
  signature: string;      // 完整函数签名
  module: string;         // 所属模块
  brief?: string;         // 简要描述
  description?: string;   // 详细描述
  parameters: ParameterDocument[];
  returnValue?: ReturnDocument;
  usage?: string;         // 使用示例代码
  seeAlso?: string[];     // 相关函数
  // 嵌入式特有字段
  isInterrupt?: boolean;  // 是否是中断处理函数
  isBlocking?: boolean;   // 是否阻塞
  reentrant?: boolean;    // 是否可重入
}

interface DataTypeGroupDocument {
  prefix: string;         // 例如 "GPIO_", "UART_"
  types: DataTypeDocument[];
}

interface DataTypeDocument {
  name: string;
  kind: "struct" | "enum" | "typedef" | "union" | "macro";
  description?: string;
  fields?: FieldDocument[];
  enumValues?: string[];
}
```

### 2. 输出目录结构
```
{project-name}-skill/
├── SKILL.md                        # 入口文件：项目概述
├── references/
│   ├── modules/                    # 按模块分组
│   │   ├── gpio.md                 # GPIO 模块索引
│   │   ├── uart.md                 # UART 模块索引
│   │   └── ...
│   ├── functions/                  # 单个函数详情
│   │   ├── GPIO_Init.md
│   │   ├── GPIO_ReadPin.md
│   │   ├── UART_Transmit.md
│   │   └── ...
│   ├── types/                      # 数据类型定义
│   │   ├── GPIO/
│   │   │   ├── _index.md
│   │   │   ├── GPIO_TypeDef.md
│   │   │   └── GPIO_InitTypeDef.md
│   │   └── UART/
│   │       └── ...
│   └── hal-overview.md             # HAL 层整体说明
```
3. 嵌入式专用模板示例
SKILL.md（入口模板）：
```markdown---
name: <%= it.meta.name %>
description: <%= it.meta.description %>
target: <%= it.meta.targetMCU %>  # 例如 "STM32F4", "ESP32"
---

# <%= it.meta.title %>

## How to Use This Skill

**Directory structure:**

references/
├── modules/    # <%= it.modules.length %> 外设模块
├── functions/  # <%= it.totalFunctions %> 个 API 函数
└── types/      # <%= it.dataTypes.length %> 个数据类型分组

**Navigation flow:**
1. 找到需要的模块 → `references/modules/<module>.md`
2. 查看模块的函数列表
3. 阅读具体函数 → `references/functions/<function>.md`
4. 如需了解参数类型 → `references/types/<prefix>/<type>.md

## Modules
<% it.modules.forEach(m => { -%>
- **<%= m.name %>** → `references/modules/<%= m.name.toLowerCase() %>.md` (<%= m.functions.length %> funcs)
<% }) -%>
```
function.md.eta（函数模板）：
``` markdown
# <%= it.name %>

**Module:** [<%= it.module %>](../modules/<%= it.module.toLowerCase() %>.md)
**Header:** `<%= it.header %>`

<%= it.signature %>


<%= it.brief %>

<% if (it.description) { %>
## Description
<%= it.description %>
<% } %>

## Parameters
| Name | Type | Direction | Description |
|------|------|-----------|-------------|
<% it.parameters.forEach(p => { -%>
| `<%= p.name %>` | `<%= p.type %>` | <%= p.direction %> | <%= p.description %> |
<% }) %>

<% if (it.returnValue) { %>
## Return Value
**Type:** `<%= it.returnValue.type %>`
<%= it.returnValue.description %>
<% } %>

<% if (it.usage) { %>
## Example

<%= it.usage %>

<% } %>

<% if (it.isInterrupt) { %>
⚠️ **Interrupt Handler** - This function runs in interrupt context
<% } %>

<% if (it.seeAlso) { %>
## See Also
<% it.seeAlso.forEach(fn => { -%>
- [<%= fn %>](../functions/<%= fn %>.md)
<% }) %>
<% } %>
```
4. 实现步骤建议

Parser 阶段：利用你已有的 skill，将 .h/.c 解析结果转换为上述 IR 结构
增强解析：从代码中提取更多嵌入式相关元数据，例如：

Doxygen 注释 (@brief, @param, @return, @note)
函数属性（__attribute__((interrupt)) 等）
模块依赖关系


Renderer 阶段：创建嵌入式专用的 Eta 模板，复用原项目的 TemplateRenderer 架构
分组策略：可以按以下方式分组函数：

按文件前缀（GPIO_, UART_）
按所在头文件
按功能层级（HAL/LL/Driver）
