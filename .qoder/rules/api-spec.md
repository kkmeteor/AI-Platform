---
trigger: always_on
glob: **/*.cs", "src/api/**", "**/Controllers/**", "**/Services/**
alwaysApply: true
---

# API 开发规范

当操作涉及后端 API 代码（Controllers、Services、C# 文件）时，AI助手必须遵守以下规范。

## 控制器规范

- Controller 类必须以 `Controller` 结尾，放在 `Controllers` 目录下
- 每个 Controller 只负责一个资源领域，禁止混合多个业务领域
- 使用 `[ApiController]` 和 `[Route]` 特性标注
- Action 方法必须明确指定 HTTP 方法特性：`[HttpGet]`、`[HttpPost]` 等
- 返回类型统一使用 `ActionResult<T>` 或 `IActionResult`

```csharp
[ApiController]
[Route("api/[controller]")]
public class UserController : ControllerBase
{
    [HttpGet("{id}")]
    public async Task<ActionResult<UserDto>> GetUser(int id)
    {
        // ...
    }
}
```

## 服务层规范

- 业务逻辑必须放在 Service 层，Controller 只做参数校验和调用
- Service 接口以 `I` 开头：`IUserService`
- Service 实现类注入通过 DI 容器，禁止 new 实例化
- 异步方法命名以 `Async` 结尾：`GetUserAsync`

## 数据传输规范

- 请求/响应使用独立的 DTO 类，禁止直接暴露数据库实体
- DTO 类以 `Request`/`Response`/`Dto` 后缀区分
- 分页查询统一使用 `PagedResult<T>` 包装

## 安全规范

- 所有写操作必须验证用户权限
- 敏感数据（密码、密钥）禁止在响应中返回
- 使用参数化查询，禁止拼接 SQL 字符串
