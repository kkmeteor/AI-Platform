import os
from openai import OpenAI

client = OpenAI(
    # 若没有配置环境变量，请用百炼API Key将下行替换为：api_key="sk-xxx"
    api_key='sk-ws-H.EYXLDDP.8wmy.MEUCIQCbt_QH9gNoa8Kiiy8nfe90hg0piWQHtt4QmE32ZfwFBAIgCIEd-3qc1xX_P-tayBoyDkHSUfu2a80Fp-qM9hiEQ6o',
    # base_url="https://dashscope.aliyuncs.com/compatible-mode/v1",
    base_url = "https://ws-qyk02a1kdek3t012.cn-beijing.maas.aliyuncs.com/compatible-mode/v1"
)

completion = client.chat.completions.create(
    # 模型列表：https://help.aliyun.com/zh/model-studio/getting-started/models
    model="qwen3.8-27b",
    messages=[
        {"role": "system", "content": "You are a helpful assistant."},
        {"role": "user", "content": "你是谁？"},
    ]
)
print(completion.model_dump_json())