---
name: weather-query
description: Query current weather information by city name. Use when the user asks about weather, temperature, or climate conditions for a specific city or location.
---

# Weather Query

## Instructions

When the user asks about weather for a city, follow these steps:

1. Extract the city name from the user's query
2. Use the `search_web` tool to query real-time weather data
3. Present the results in a clear, structured format

## Query Strategy

Use `search_web` with a query like: `"{city name} current weather"`

If the city name is ambiguous, ask the user to clarify (e.g., multiple cities with the same name in different countries).

## Output Format

Present weather information in this format:

```
🌍 {City Name} 当前天气

🌡️ 温度: {temperature}
🌤️ 天气状况: {condition}
💧 湿度: {humidity}
💨 风速: {wind}
📊 体感温度: {feels_like}
```

## Guidelines

- Always show temperature in Celsius (°C)
- If the user provides a Chinese city name, search in Chinese for better results
- Include the data retrieval timestamp so the user knows the data freshness
- If weather data is unavailable, inform the user and suggest checking a dedicated weather website
