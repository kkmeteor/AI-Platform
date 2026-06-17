---
trigger: always_on
alwaysApply: true
---

# 架构约束

本规则定义项目的整体架构约束，AI助手在设计和修改代码结构时必须遵守。

## 分层架构

项目采用分层架构，严格遵循依赖方向：

```
表现层（UI/Presentation）
    ↓ 依赖
应用层（Application/Services）
    ↓ 依赖
领域层（Domain/Entities）
    ↓ 依赖
基础设施层（Infrastructure/Data）
    ↓ 依赖
数据库访问施层（Infrastructure/Data）

```

- 依赖方向只能从上层到下层，**禁止反向依赖**
- 表现层禁止直接访问基础设施层
- 领域层不依赖任何其他层，是完全独立的

## 目录结构规范

```
src/
├── {Project}.Web/           # 表现层：控制器、视图、中间件
├── {Project}.Application/   # 应用层：服务、DTO、接口
├── {Project}.Domain/        # 领域层：实体、值对象、领域事件
└── {Project}.Infrastructure/# 基础设施层：仓储实现、外部服务
```

## 依赖注入约束

- 所有服务注册在 `Startup.cs` / `Program.cs` 中集中配置
- 使用构造函数注入，禁止属性注入或服务定位器模式
- 生命周期选择原则：
  - Singleton：无状态服务、配置类
  - Scoped：数据库上下文、请求级服务
  - Transient：轻量级有状态服务

## 数据库访问约束

- 数据访问必须通过 Repository 模式，禁止在 Service 层直接使用 DbContext
- 仓储接口定义在领域层，实现在基础设施层
- 查询使用 IQueryable 延迟执行，在 Service 层组装查询条件
- 禁止在循环中执行数据库查询（N+1 问题）

## 跨切面关注点

- 日志：使用 ILogger<T>，禁止创建自定义日志类
- 缓存：通过 ICacheService 接口统一管理
- 异常：使用全局异常处理中间件，业务异常继承自定义基类
- 配置：通过 IOptions<T> 模式读取，禁止直接 ConfigurationManager
