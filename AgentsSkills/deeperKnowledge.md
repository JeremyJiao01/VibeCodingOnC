关联关系的分类与表达形式
1. 调用顺序约束（Temporal/Sequence Constraints）
这是嵌入式最重要的约束，例如必须先初始化才能使用。
```yaml
# 在 IR 中添加
interface FunctionDocument {
  # ... 原有字段 ...
  
  # 时序约束
  preconditions: Precondition[];   # 调用前必须满足的条件
  postconditions: Postcondition[]; # 调用后产生的状态
  
  # 依赖链
  mustCallBefore?: string[];  # 在调用此函数前必须调用的函数
  mustCallAfter?: string[];   # 调用此函数后必须调用的函数（如释放资源）
  mutuallyExclusive?: string[]; # 互斥函数（不能同时使用）
}

interface Precondition {
  type: "function_called" | "state" | "peripheral_enabled" | "clock_configured";
  target: string;      # 依赖的函数名或状态名
  description: string;
}
```
在文档中的呈现：
```markdown# 
UART_Transmit

## Prerequisites ⚠️
Before calling this function, you **must**:
1. ✅ Call `RCC_APB1PeriphClockCmd()` to enable UART clock
2. ✅ Call `UART_Init()` to configure baud rate and parameters  
3. ✅ Call `GPIO_Init()` to configure TX/RX pins as alternate function

## Sequence Diagram

RCC_APB1PeriphClockCmd() 
        ↓
   GPIO_Init()  ←── Configure PA9/PA10 as AF
        ↓
   UART_Init()  ←── Set baud rate, word length
        ↓
  UART_Transmit() ←── Now safe to call


## Post-call
- If using DMA, call `UART_DMACmd()` after this
- Remember to call `UART_DeInit()` when done
```

2. 状态机关系（State Machine）
很多外设有内部状态，需要明确表达：
```typescript
interface ModuleDocument {
  // ... 原有字段 ...
  
  // 状态机定义
  stateMachine?: {
    states: string[];        // 如 ["RESET", "READY", "BUSY", "ERROR"]
    initialState: string;
    transitions: StateTransition[];
  };
}

interface StateTransition {
  from: string;
  to: string;
  trigger: string;      # 触发函数
  condition?: string;   # 可选条件
}

interface FunctionDocument {
  // ... 原有字段 ...
  validStates?: string[];    # 此函数只能在这些状态下调用
  resultState?: string;      # 调用后外设进入的状态
}
````
在文档中的呈现：
```markdown
# I2C Module State Machine

    ┌─────────┐
    │  RESET  │
    └────┬────┘
         │ I2C_Init()
         ↓
    ┌─────────┐
    │  READY  │←──────────────┐
    └────┬────┘               │
         │ I2C_Master_Transmit()
         ↓                    │
    ┌─────────┐               │
    │  BUSY   │───────────────┘ (transfer complete)
    └────┬────┘
         │ (error)
         ↓
    ┌─────────┐
    │  ERROR  │── I2C_DeInit() ──→ RESET
    └─────────┘


## I2C_Master_Transmit

**Valid States:** `READY` only  
**Result State:** `BUSY` → `READY` (on success) or `ERROR` (on failure)
```
3. 资源依赖图（Resource Dependency Graph）
表达硬件资源的依赖关系：
```typescript
interface ResourceDependency {
  resource: string;       # "UART1", "DMA1_Channel4", "GPIOA"
  type: "clock" | "pin" | "dma" | "interrupt" | "peripheral";
  required: boolean;
  sharedWith?: string[];  # 与哪些功能共享此资源
}

interface FunctionDocument {
  // ... 原有字段 ...
  resourcesUsed?: ResourceDependency[];
  conflictsWith?: string[];  # 资源冲突的函数
}
```
在文档中的呈现：
```markdown
# SPI_Transmit_DMA

## Resource Requirements
| Resource | Type | Notes |
|----------|------|-------|
| SPI1 | Peripheral | Must be initialized |
| DMA1_Channel3 | DMA | Shared with DAC1 - cannot use simultaneously |
| PA5, PA6, PA7 | GPIO | SPI1 pins, must be configured as AF |
| APB2 Clock | Clock | Must be enabled |

## ⚠️ Resource Conflicts
This function uses DMA1_Channel3, which conflicts with:
- `DAC_DMA_Enable()` - DAC channel 1 output
- `TIM1_DMA_Cmd()` - Timer 1 update DMA

**Resolution:** Ensure only one of these features is active at a time.
```
4. 初始化序列模板（Init Sequence Patterns）
为常见场景提供完整的调用模板：
```markdown
# references/patterns/uart-polling-init.md

# Pattern: UART Polling Mode Initialization

## Complete Sequence

// Step 1: Enable clocks
RCC_APB2PeriphClockCmd(RCC_APB2Periph_GPIOA, ENABLE);
RCC_APB1PeriphClockCmd(RCC_APB1Periph_USART2, ENABLE);

// Step 2: Configure GPIO
GPIO_InitTypeDef GPIO_InitStruct;
GPIO_InitStruct.GPIO_Pin = GPIO_Pin_2 | GPIO_Pin_3;
GPIO_InitStruct.GPIO_Mode = GPIO_Mode_AF_PP;
GPIO_InitStruct.GPIO_Speed = GPIO_Speed_50MHz;
GPIO_Init(GPIOA, &GPIO_InitStruct);

// Step 3: Configure UART
USART_InitTypeDef USART_InitStruct;
USART_InitStruct.USART_BaudRate = 115200;
USART_InitStruct.USART_WordLength = USART_WordLength_8b;
// ... more config ...
USART_Init(USART2, &USART_InitStruct);

// Step 4: Enable UART
USART_Cmd(USART2, ENABLE);

// Now ready to use USART_SendData() / USART_ReceiveData()


## Dependency Graph

RCC_APB2PeriphClockCmd ──┐
                         ├──→ GPIO_Init ──┐
RCC_APB1PeriphClockCmd ──┘                │
                                          ├──→ USART_Init ──→ USART_Cmd
                                          │
                         (must complete before)

## Related Functions
- [USART_SendData](../functions/USART_SendData.md)
- [USART_ReceiveData](../functions/USART_ReceiveData.md)
```
5. 建议的 IR 结构扩展
综合以上，你的 IR 可以这样扩展：
```typescript
interface EmbeddedSkillDocument {
  meta: EmbeddedMeta;
  modules: ModuleDocument[];
  dataTypes: DataTypeGroupDocument[];
  
  // 新增：关系图
  relationships: {
    initSequences: InitSequence[];      // 初始化序列
    resourceGraph: ResourceNode[];       // 资源依赖图
    conflictMatrix: ConflictEntry[];     // 冲突矩阵
  };
  
  // 新增：使用模式
  patterns: PatternDocument[];
}

interface InitSequence {
  name: string;           // "UART DMA Mode Setup"
  description: string;
  steps: {
    order: number;
    function: string;
    purpose: string;
    optional: boolean;
  }[];
}

interface ConflictEntry {
  functionA: string;
  functionB: string;
  resource: string;
  severity: "hard" | "soft";  // hard=绝对不能同时, soft=需要注意
  resolution?: string;
}
```
6. 实现建议
信息来源可以是：

静态分析：从代码中解析调用关系（如 Doxygen @pre, @post 注释）
手动标注：创建一个 YAML/JSON 配置文件描述关键约束
参考手册：从芯片参考手册中提取初始化序列

示例配置文件：
```yaml
# embedded-constraints.yaml
modules:
  UART:
    stateMachine:
      states: [RESET, READY, BUSY_TX, BUSY_RX, ERROR]
      initial: RESET
    
    functions:
      UART_Init:
        preconditions:
          - type: clock_enabled
            target: UART_CLOCK
          - type: function_called
            target: GPIO_Init
        postconditions:
          - state: READY
      
      UART_Transmit:
        validStates: [READY]
        resultState: BUSY_TX
        conflictsWith: [UART_Receive_DMA]

patterns:
  - name: "UART Polling Setup"
    sequence:
      - RCC_APB1PeriphClockCmd
      - GPIO_Init
      - UART_Init
      - UART_Cmd
```
你觉得这种结构能覆盖你的需求吗？你现有的 skill 解析输出是什么格式的？我可以帮你设计从现有格式到这套增强 IR 的转换逻辑。
