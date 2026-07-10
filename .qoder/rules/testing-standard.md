---
trigger: model_decision
description: 当用户要求编写单元测试、集成测试或涉及测试相关代码时应用此规则
---

# 测试规范

当 AI 助手生成测试代码或协助编写测试用例时，必须遵守以下规范。

## 测试框架与结构

- 单元测试使用 xUnit 框架（C#）或 Jest 框架（TypeScript/JavaScript）
- 测试类命名：`{被测类名}Tests`，如 `UserServiceTests`
- 测试方法命名：`{方法名}_{场景}_{预期结果}`，如 `GetUser_WhenUserNotFound_ThrowsException`
- 测试文件放在与源代码对应的 `Tests` 项目/目录中

## 测试编写原则

- 遵循 AAA 模式：Arrange → Act → Assert
- 每个测试方法只验证一个行为
- 使用 Mock 隔离外部依赖，禁止在单元测试中调用真实数据库或HTTP服务
- 测试数据使用 Builder 模式或 Object Mother 模式构造

```csharp
[Fact]
public async Task GetUser_WhenUserExists_ReturnsUserDto()
{
    // Arrange
    var userId = 1;
    var expectedName = "Test User";
    _mockRepository.Setup(r => r.GetByIdAsync(userId))
        .ReturnsAsync(new User { Id = userId, Name = expectedName });

    // Act
    var result = await _service.GetUserAsync(userId);

    // Assert
    Assert.Equal(expectedName, result.Name);
}
```

## 覆盖率要求

- 核心业务逻辑测试覆盖率不低于 80%
- 每个公共方法至少包含：正常路径、边界条件、异常路径 三个测试用例
- 修复 Bug 时必须同时添加回归测试

## 集成测试

- 集成测试标注 `[Trait("Category", "Integration")]`
- 使用 TestServer 或 WebApplicationFactory 创建测试主机
- 测试完成后清理测试数据，不污染数据库
