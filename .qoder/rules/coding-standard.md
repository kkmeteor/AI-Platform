---
trigger: always_on
alwaysApply: true
---

# 编码规范

本规则适用于项目中所有代码文件的编写，AI助手在生成或修改代码时必须遵守以下规范。

## 命名规范

- 变量名使用 camelCase：`userName`、`orderList`
- 常量使用 UPPER_SNAKE_CASE：`MAX_RETRY_COUNT`、`API_BASE_URL`
- 类名/接口名使用 PascalCase：`UserService`、`IRepository`
- 私有字段以下划线开头：`_logger`、`_connectionString`
- 布尔变量以 is/has/can 开头：`isActive`、`hasPermission`
- 事件处理器以 On 开头：`OnClick`、`OnDataReceived`

## 代码格式

- 缩进使用 4 个空格（C#）或 2 个空格（TypeScript/JavaScript）
- 每行代码不超过 120 个字符
- 使用大括号换行风格（Allman风格）用于 C#：
  ```csharp
  if (condition)
  {
      DoSomething();
  }
  ```
- 使用 K&R 风格用于 TypeScript/JavaScript：
  ```typescript
  if (condition) {
    doSomething();
  }
  ```

## 注释规范

- 公共方法必须有 XML 文档注释（C#）或 JSDoc 注释（TypeScript）
- 注释应说明"为什么"而非"是什么"
- 禁止残留无用的注释代码块，使用版本控制系统代替注释

## 错误处理

- 所有外部调用（HTTP请求、数据库操作）必须有 try-catch 包裹
- 异常信息必须包含上下文信息，禁止空 catch 块
- 使用项目统一的日志框架记录错误，禁止直接 Console.Write
