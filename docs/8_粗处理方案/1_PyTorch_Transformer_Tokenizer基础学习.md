# PyTorch、Transformer、Tokenizer 基础学习

> 目标：用 2-3 天快速建立底层认知，为后续 Hugging Face 微调实战打基础
> 环境：Google Colab（免费 GPU）或本地 Python 环境
> 前置要求：Python 基本语法（变量、函数、循环、字典）

---

## 第一部分：PyTorch — 深度学习的基础设施

### 1.1 PyTorch 是什么

一句话：**PyTorch 是一个用 GPU 加速矩阵运算、并且能自动求导的数学库。**

神经网络的所有计算，无论多复杂，底层都是矩阵乘法。PyTorch 做两件事：
1. 把矩阵运算放到 GPU 上并行执行（快几十到几百倍）
2. 自动计算"每个参数该往哪个方向调整"（自动求导）

### 1.2 环境准备

打开 Google Colab（https://colab.research.google.com），新建一个 notebook。
Colab 自带 PyTorch，不需要安装。如果是本地环境：

```bash
pip install torch
```

### 1.3 动手：Tensor（张量）基本操作

Tensor 就是多维数组，是 PyTorch 中所有数据的载体。

```python
import torch

# ========== 创建 Tensor ==========

# 一维（向量）
a = torch.tensor([1.0, 2.0, 3.0])
print(a)          # tensor([1., 2., 3.])
print(a.shape)    # torch.Size([3])

# 二维（矩阵）
b = torch.tensor([[1.0, 2.0], [3.0, 4.0], [5.0, 6.0]])
print(b)          # 3x2 的矩阵
print(b.shape)    # torch.Size([3, 2])

# 随机初始化（模型的初始参数就是这样生成的）
c = torch.randn(3, 4)   # 3行4列，值从标准正态分布采样
print(c)

# ========== 基本运算 ==========

x = torch.tensor([1.0, 2.0, 3.0])
y = torch.tensor([4.0, 5.0, 6.0])

print(x + y)       # 逐元素加法: tensor([5., 7., 9.])
print(x * y)       # 逐元素乘法: tensor([4., 10., 18.])
print(x @ y)       # 点积(内积): tensor(32.)  → 1*4 + 2*5 + 3*6

# 矩阵乘法
A = torch.randn(3, 4)   # 3x4
B = torch.randn(4, 5)   # 4x5
C = A @ B                # 3x5  （矩阵乘法：前者列数 = 后者行数）
print(C.shape)           # torch.Size([3, 5])
```

**理解要点**：
- 模型的权重（参数）就是一堆 Tensor
- 输入数据也会被转成 Tensor
- 模型计算就是 Tensor 之间做矩阵乘法和激活函数

### 1.4 动手：GPU 加速

```python
# 检查是否有 GPU（Colab 里选 Runtime → Change runtime type → T4 GPU）
print(torch.cuda.is_available())   # True 表示有 GPU

# 把 Tensor 放到 GPU 上
if torch.cuda.is_available():
    x_gpu = torch.randn(1000, 1000).cuda()
    y_gpu = torch.randn(1000, 1000).cuda()

    # 这个矩阵乘法在 GPU 上执行，比 CPU 快很多
    z_gpu = x_gpu @ y_gpu
    print(z_gpu.shape)   # torch.Size([1000, 1000])
    print(z_gpu.device)  # cuda:0
```

**理解要点**：
- `.cuda()` 把数据/模型搬到 GPU 上
- 训练时模型和数据必须在同一个设备上（都在 CPU 或都在 GPU）
- Hugging Face 的 `device_map="auto"` 会自动处理这件事

### 1.5 动手：自动求导 — PyTorch 最核心的能力

这是训练能工作的根本原因。不需要你手写微积分，PyTorch 自动帮你算。

```python
# 假设我们要学习一个简单的函数：y = w * x + b
# 其中 w 和 b 是要学习的参数

w = torch.tensor(2.0, requires_grad=True)   # requires_grad=True 告诉 PyTorch "追踪这个参数"
b = torch.tensor(1.0, requires_grad=True)

# 前向计算
x = torch.tensor(3.0)
y_pred = w * x + b      # 预测值 = 2*3+1 = 7
y_true = torch.tensor(10.0)  # 真实值是 10

# 计算误差（loss）
loss = (y_pred - y_true) ** 2   # 均方误差 = (7-10)² = 9
print(f"loss = {loss.item()}")  # 9.0

# 反向传播 — 自动算出 w 和 b 各自该怎么调
loss.backward()

print(f"w 的梯度 = {w.grad}")  # -18.0 → 说明 w 应该增大（梯度为负，往正方向调）
print(f"b 的梯度 = {b.grad}")  # -6.0  → 说明 b 也应该增大
```

**理解要点**：
- `requires_grad=True`：告诉 PyTorch "这个参数需要被训练"
- `loss.backward()`：从 loss 反向推导出每个参数的梯度（该怎么调整）
- `w.grad`：w 的梯度，告诉优化器 w 应该往哪个方向调、调多少
- 这就是"训练"的本质——不断重复"预测 → 算误差 → 反向传播 → 更新参数"

### 1.6 动手：一个完整的训练循环

把上面的过程循环起来，就是训练：

```python
import torch

# 目标：让模型学会 y = 3x + 2 这个函数

# 训练数据
X = torch.tensor([1.0, 2.0, 3.0, 4.0, 5.0])
Y = torch.tensor([5.0, 8.0, 11.0, 14.0, 17.0])   # y = 3x + 2

# 随机初始化参数（模型一开始不知道答案）
w = torch.tensor(0.0, requires_grad=True)
b = torch.tensor(0.0, requires_grad=True)
lr = 0.01  # 学习率：每次调整的步幅

print("训练前: w={:.2f}, b={:.2f}".format(w.item(), b.item()))

for epoch in range(100):
    # 前向传播
    Y_pred = w * X + b

    # 计算误差
    loss = ((Y_pred - Y) ** 2).mean()

    # 反向传播
    loss.backward()

    # 更新参数（手动梯度下降）
    with torch.no_grad():
        w -= lr * w.grad
        b -= lr * b.grad

    # 清零梯度（PyTorch 会累加梯度，所以每轮要清零）
    w.grad.zero_()
    b.grad.zero_()

    if (epoch + 1) % 20 == 0:
        print(f"Epoch {epoch+1}: loss={loss.item():.4f}, w={w.item():.4f}, b={b.item():.4f}")

print("\n训练后: w={:.2f}, b={:.2f}".format(w.item(), b.item()))
# 预期结果：w ≈ 3.00, b ≈ 2.00
```

运行这段代码，你会看到 w 从 0 逐渐趋近 3，b 趋近 2，loss 逐渐趋近 0。
**这就是所有深度学习训练的核心循环，无论模型多大，原理都是这个。**

### 1.7 PyTorch 小结

| 概念 | 你需要记住的 |
|------|------------|
| Tensor | 多维数组，所有数据和参数的载体 |
| `.cuda()` | 把数据搬到 GPU 加速 |
| `requires_grad=True` | 标记"这个参数需要被训练" |
| `loss.backward()` | 自动算出所有参数的梯度 |
| 训练循环 | 前向 → 算 loss → 反向 → 更新参数 → 重复 |

> 后续使用 Hugging Face 时，上面这些全被封装了。但当你看到训练日志里 loss 在下降时，你就知道背后在发生什么。

---

## 第二部分：Transformer — 模型的架构设计

### 2.1 Transformer 是什么

一句话：**Transformer 是一种让每个词都能"看到"其他所有词来理解上下文的模型架构。**

GPT、Qwen、LLaMA、BERT 都是基于 Transformer 构建的，只是用了不同的部分或做了一些变体。

### 2.2 从直觉理解 Self-Attention

考虑这句话："小明把球踢给了**他**"

"他"指的是谁？人类知道"他"不是"小明"自己（因为有"踢给"），而是上下文中的另一个人。模型怎么做到这一点？靠 **Self-Attention**。

Self-Attention 的直觉：**每个词对其他所有词打一个"相关性分数"，然后根据分数融合信息。**

```
处理"他"这个词时：
  "他" 对 "小明" 的关注度 → 0.6（很高，因为"他"很可能指代"小明"）
  "他" 对 "球"   的关注度 → 0.1（低）
  "他" 对 "踢给" 的关注度 → 0.2（中，动词和代词有语法关联）
  "他" 对 "了"   的关注度 → 0.1（低）
```

### 2.3 Q-K-V 机制详解

Attention 的计算用三个向量：Query、Key、Value。

**用图书馆类比理解**：

```
你去图书馆找一本书：
  - Query（Q）= 你的需求："我想找一本关于保研的书"
  - Key（K）  = 每本书封面上的标签："保研指南"、"考研数学"、"英语四级"...
  - Value（V）= 每本书的实际内容

过程：
  1. 用你的 Q 和每本书的 K 做比较 → 算出相关性分数
  2. "保研指南"的分数最高
  3. 按分数加权取出 V（主要取"保研指南"的内容，少量参考其他）
```

在 Transformer 中，每个 token 同时扮演三个角色——它既是查询者（Q），也是被查询的（K），也有自己的内容（V）：

```python
# Attention 计算的伪代码（帮助理解，不需要你实现）

# 每个 token 的表示向量乘以三个不同的权重矩阵，得到 Q K V
Q = token_embeddings @ W_Q   # (序列长度, d_model) @ (d_model, d_k) → (序列长度, d_k)
K = token_embeddings @ W_K
V = token_embeddings @ W_V

# 计算注意力分数：Q 和 K 的点积（类似余弦相似度）
scores = Q @ K.T / sqrt(d_k)   # (序列长度, 序列长度) 的矩阵

# Softmax 归一化，让分数变成概率分布（总和为 1）
attention_weights = softmax(scores)

# 按权重加权求和 V
output = attention_weights @ V
```

### 2.4 动手：可视化 Attention

在 Colab 中运行，直观看到 Attention 在做什么：

```python
import torch
import torch.nn.functional as F

# 模拟一个 4 个 token 的句子，每个 token 用 8 维向量表示
seq_len = 4
d_model = 8

tokens = torch.randn(seq_len, d_model)
token_names = ["清华", "计算机", "保研", "要求"]

# 模拟 Q K V 权重矩阵
W_Q = torch.randn(d_model, d_model)
W_K = torch.randn(d_model, d_model)

Q = tokens @ W_Q
K = tokens @ W_K

# 计算注意力分数
scores = Q @ K.T / (d_model ** 0.5)
attention = F.softmax(scores, dim=-1)

# 打印注意力矩阵
print("Attention 矩阵（每行表示一个 token 对其他 token 的关注度）：")
print(f"{'':>8}", end="")
for name in token_names:
    print(f"{name:>8}", end="")
print()

for i, name in enumerate(token_names):
    print(f"{name:>8}", end="")
    for j in range(seq_len):
        print(f"{attention[i][j].item():>8.3f}", end="")
    print()
```

输出类似：

```
              清华    计算机      保研      要求
    清华     0.312   0.198    0.287    0.203
  计算机     0.156   0.445    0.201    0.198
    保研     0.267   0.221    0.301    0.211
    要求     0.189   0.312    0.256    0.243
```

每一行的数字加起来等于 1，表示这个 token 把多少注意力分配给了其他 token。

> 注意：这里是随机权重，所以注意力分布没有实际语义含义。经过训练后，模型会学会把注意力集中在真正相关的 token 上。

### 2.5 多头注意力（Multi-Head Attention）

实际 Transformer 不止一组 Q-K-V，而是同时用多组（多头），每组关注不同的东西：

```
Head 1：关注语法关系（"要求"关注"保研"因为是动宾结构）
Head 2：关注实体关系（"保研"关注"清华"因为是学校-动作关系）  
Head 3：关注相邻词（每个词关注前后的词）
...

最终把多头的结果拼接起来 → 模型同时理解了多种关系
```

### 2.6 Transformer 的完整结构

```
输入 token IDs
      │
      ▼
┌──────────────┐
│ Token Embedding │  把 ID 转成向量（查表操作）
│ + 位置编码      │  加上位置信息（让模型知道词序）
└──────┬───────┘
       │
       ▼
┌──────────────────────────┐
│ Transformer Block × N 层  │  ← N 通常是 6~96 层不等
│                          │
│  ┌─────────────────┐     │
│  │ Multi-Head       │     │
│  │ Self-Attention    │     │  每个 token 关注所有 token
│  └────────┬────────┘     │
│           │              │
│  ┌────────▼────────┐     │
│  │ Feed Forward     │     │  两层全连接网络，做非线性变换
│  │ Network (FFN)    │     │
│  └────────┬────────┘     │
│           │              │
└───────────┼──────────────┘
            │  （重复 N 次）
            ▼
    最终每个 token 的表示向量
            │
            ▼
    线性层 → Softmax → 预测下一个 token 的概率
```

**GPT / Qwen 这类模型**用的是 Decoder-only 结构，即只有上图的架构，加上一个限制：每个 token 只能关注它**前面**的 token（不能偷看后面的），这就是"自回归"——一个字一个字地生成。

### 2.7 Transformer 小结

| 概念 | 你需要记住的 |
|------|------------|
| Self-Attention | 让每个 token 能看到其他所有 token，理解上下文 |
| Q-K-V | Query 找 Key 算相关度，按相关度取 Value |
| 多头 | 多组 Attention 同时关注不同关系 |
| Transformer Block | Attention + FFN，重复堆叠 N 层 |
| GPT/Qwen 架构 | Decoder-only，只看前面的 token，逐个生成 |

---

## 第三部分：Tokenizer — 人类语言与数字的桥梁

### 3.1 为什么需要 Tokenizer

模型只能做数学运算，输入必须是数字。Tokenizer 的工作：

```
编码：文字 → 数字（token IDs）→ 送入模型
解码：模型输出数字 → 转回文字 → 返回给用户
```

### 3.2 Token 的切分方式

为什么不直接一个字一个数字？因为效率问题：

```
字级别切分："清" "华" "大" "学" → 4 个 token
            词汇表需要几千个汉字，但无法处理没见过的新词

词级别切分："清华大学" → 1 个 token
            词汇表会非常巨大，新词（如网络用语）无法处理

BPE 切分（实际使用）："清华" "大学" → 2 个 token
            高频的字组合并成一个 token，低频的拆开
            平衡了效率和覆盖度
```

### 3.3 动手：体验真实的 Tokenizer

```python
# 安装（Colab 中运行，本地需要先 pip install transformers）
# pip install transformers

from transformers import AutoTokenizer

# 加载 Qwen2.5 的 Tokenizer（这就是你将来微调时用的同一个）
tokenizer = AutoTokenizer.from_pretrained("Qwen/Qwen2.5-0.5B-Instruct")

text = "清华大学计算机系的保研要求是什么"

# ========== 编码：文字 → token IDs ==========
token_ids = tokenizer.encode(text)
print(f"原文: {text}")
print(f"Token IDs: {token_ids}")
print(f"Token 数量: {len(token_ids)}")

# ========== 查看每个 token 对应的文字 ==========
tokens = tokenizer.tokenize(text)
print(f"Token 切分: {tokens}")

# ========== 解码：token IDs → 文字 ==========
decoded = tokenizer.decode(token_ids)
print(f"解码还原: {decoded}")
```

输出类似：

```
原文: 清华大学计算机系的保研要求是什么
Token IDs: [101592, 88213, 103775, 9370, 101037, ...]
Token 数量: 8
Token 切分: ['清华大学', '计算机', '系', '的', '保研', '要求', '是', '什么']
```

### 3.4 动手：对比不同文本的 Token 数量

```python
from transformers import AutoTokenizer

tokenizer = AutoTokenizer.from_pretrained("Qwen/Qwen2.5-0.5B-Instruct")

texts = [
    "保研",
    "清华大学计算机系的保研要求是什么",
    "我想了解清华大学计算机科学与技术系的推荐免试研究生申请条件和具体流程",
    "Hello world",
    "The quick brown fox jumps over the lazy dog",
]

for text in texts:
    ids = tokenizer.encode(text)
    tokens = tokenizer.tokenize(text)
    print(f"[{len(ids):>3} tokens] {text}")
    print(f"           切分: {tokens}")
    print()
```

**动手观察**：
- 同样意思的话，表述越长 token 越多
- 常见词（清华大学）可能合并为 1 个 token
- 稀有词会被拆成多个 token
- 中文和英文的 token 效率不同

### 3.5 动手：Special Tokens

每个模型的 Tokenizer 还有一些特殊标记：

```python
from transformers import AutoTokenizer

tokenizer = AutoTokenizer.from_pretrained("Qwen/Qwen2.5-0.5B-Instruct")

# 特殊 token
print(f"BOS (开始): {tokenizer.bos_token} → ID: {tokenizer.bos_token_id}")
print(f"EOS (结束): {tokenizer.eos_token} → ID: {tokenizer.eos_token_id}")
print(f"PAD (填充): {tokenizer.pad_token} → ID: {tokenizer.pad_token_id}")

# Chat 模板 — 这是微调时最重要的部分
messages = [
    {"role": "system", "content": "你是一个语句提纯助手"},
    {"role": "user", "content": "清华计算机保研需要什么条件"},
]

formatted = tokenizer.apply_chat_template(messages, tokenize=False)
print("\nChat 模板格式化结果：")
print(formatted)
```

**理解要点**：
- `apply_chat_template` 会把对话格式化成模型期望的格式（每个模型不同）
- 微调时，`SFTTrainer` 会自动调用这个方法处理你的训练数据
- 这就是为什么不同模型的 prompt 格式不一样

### 3.6 动手：理解 Token 和向量的关系

Token ID 进入模型后会被转成向量（Embedding），这是模型理解语义的起点：

```python
import torch
from transformers import AutoTokenizer, AutoModel

tokenizer = AutoTokenizer.from_pretrained("Qwen/Qwen2.5-0.5B-Instruct")
model = AutoModel.from_pretrained("Qwen/Qwen2.5-0.5B-Instruct", torch_dtype=torch.float16)

text = "保研要求"
inputs = tokenizer(text, return_tensors="pt")  # return_tensors="pt" 返回 PyTorch Tensor

print(f"Token IDs: {inputs['input_ids']}")
print(f"Shape: {inputs['input_ids'].shape}")   # (1, token数量)

# 取出 Embedding 层，看 token 变成向量的过程
embedding_layer = model.get_input_embeddings()
token_vectors = embedding_layer(inputs['input_ids'])

print(f"\n每个 token 被转成 {token_vectors.shape[-1]} 维向量")
print(f"向量矩阵 shape: {token_vectors.shape}")  # (1, token数量, 隐藏维度)

# 看第一个 token 的向量（只打印前10维）
print(f"\n第一个 token 的向量(前10维): {token_vectors[0][0][:10]}")
```

**理解要点**：
- 每个 token ID 查 Embedding 表得到一个高维向量（Qwen-0.5B 是 896 维）
- 这个向量是可以被训练的——训练过程中模型会调整每个 token 的向量表示
- 相似含义的 token 在训练后向量会比较接近（这就是 Embedding 的语义性）

### 3.7 Tokenizer 小结

| 概念 | 你需要记住的 |
|------|------------|
| 作用 | 文字 ↔ 数字的双向转换 |
| BPE | 高频字词组合合并，平衡效率和覆盖度 |
| Token ≠ 字 | "清华大学"可能是 1 个 token，也可能被拆成多个 |
| Special Tokens | BOS/EOS/PAD 等控制标记 |
| Chat Template | 把对话格式化成模型期望的格式，微调时自动处理 |
| Embedding | Token ID → 高维向量，是模型理解语义的起点 |

---

## 第四部分：三者如何串联 — 走一遍完整的推理流程

### 4.1 动手：手动走一遍 LLM 推理

```python
import torch
from transformers import AutoTokenizer, AutoModelForCausalLM

# 加载模型和 Tokenizer
model_name = "Qwen/Qwen2.5-0.5B-Instruct"
tokenizer = AutoTokenizer.from_pretrained(model_name)
model = AutoModelForCausalLM.from_pretrained(model_name, torch_dtype=torch.float16, device_map="auto")

# 第1步：构造输入（Tokenizer 编码）
messages = [
    {"role": "system", "content": "请提取用户问题中的学校、专业和意图，输出JSON"},
    {"role": "user", "content": "清华计算机保研需要什么条件"},
]

text = tokenizer.apply_chat_template(messages, tokenize=False, add_generation_prompt=True)
inputs = tokenizer(text, return_tensors="pt").to(model.device)

print("=== 第1步：Tokenizer 编码 ===")
print(f"输入 token 数量: {inputs['input_ids'].shape[1]}")

# 第2步：模型推理（Transformer 计算）
print("\n=== 第2步：Transformer 推理 ===")
with torch.no_grad():
    outputs = model.generate(
        **inputs,
        max_new_tokens=100,
        temperature=0.7,
        do_sample=True,
    )

print(f"输出 token 数量: {outputs.shape[1]}")
print(f"其中新生成的 token: {outputs.shape[1] - inputs['input_ids'].shape[1]}")

# 第3步：解码输出（Tokenizer 解码）
new_tokens = outputs[0][inputs['input_ids'].shape[1]:]
response = tokenizer.decode(new_tokens, skip_special_tokens=True)

print("\n=== 第3步：Tokenizer 解码 ===")
print(f"模型回答: {response}")
```

**这段代码完整展示了**：
1. **Tokenizer** 把对话文字编码成 token IDs
2. **Transformer**（模型内部）处理 token，逐个生成新 token
3. **Tokenizer** 把生成的 token IDs 解码回文字

### 4.2 动手：观察模型的逐 Token 生成过程

```python
import torch
from transformers import AutoTokenizer, AutoModelForCausalLM

model_name = "Qwen/Qwen2.5-0.5B-Instruct"
tokenizer = AutoTokenizer.from_pretrained(model_name)
model = AutoModelForCausalLM.from_pretrained(model_name, torch_dtype=torch.float16, device_map="auto")

messages = [{"role": "user", "content": "1+1等于几？"}]
text = tokenizer.apply_chat_template(messages, tokenize=False, add_generation_prompt=True)
input_ids = tokenizer(text, return_tensors="pt").to(model.device)["input_ids"]

print("逐 token 生成过程：")
print("-" * 50)

generated = input_ids
for step in range(20):
    with torch.no_grad():
        output = model(generated)

    # output.logits 是模型对下一个 token 的概率预测
    next_token_logits = output.logits[:, -1, :]  # 取最后一个位置的预测

    # 取概率最大的 token
    probs = torch.softmax(next_token_logits, dim=-1)
    next_token_id = probs.argmax(dim=-1, keepdim=True)
    confidence = probs.max().item()

    # 解码这个 token
    token_text = tokenizer.decode(next_token_id[0])

    # 检查是否生成了结束标记
    if next_token_id.item() == tokenizer.eos_token_id:
        print(f"Step {step+1}: [EOS] (结束生成)")
        break

    print(f"Step {step+1}: '{token_text}' (置信度: {confidence:.3f})")

    # 把新 token 拼到序列后面，继续生成
    generated = torch.cat([generated, next_token_id], dim=-1)

print("-" * 50)
full_response = tokenizer.decode(generated[0][input_ids.shape[1]:], skip_special_tokens=True)
print(f"完整回答: {full_response}")
```

**这段代码让你看到**：
- 模型是**一个 token 一个 token 生成**的（自回归）
- 每一步模型输出一个概率分布，从中选出最可能的 token
- 置信度高的 token 说明模型很确定，低的说明模型在犹豫
- 这也是为什么 `temperature` 参数会影响输出：温度越高越随机

---

## 第五部分：连接到你的微调目标

现在你理解了 PyTorch、Transformer、Tokenizer 各自的角色，回到你的目标——微调一个语句提纯模型。

### 微调时这三者的角色

```
你的训练数据（JSON 格式的 instruction-input-output 对）
      │
      ▼
Tokenizer：把每条训练数据编码成 token IDs
      │
      ▼
Transformer（Qwen2.5-0.5B）：
      │  前向传播 → 模型预测下一个 token
      │  和训练数据中的正确 output 对比 → 算出 loss
      │  反向传播 → PyTorch 自动算出梯度
      │  只更新 LoRA 部分的参数（冻结原始参数）
      │
      ▼
重复几千步后：模型学会了"把任意问句提纯为结构化意图 JSON"
      │
      ▼
导出模型 → Ollama 部署 → 集成到 LangGraph
```

**你不需要手写上面任何一步。** `SFTTrainer` 封装了整个流程。但现在你知道每一步在做什么了。

---

## 学习检查清单

完成本文档后，你应该能回答：

- [ ] Tensor 是什么？为什么要放到 GPU 上？
- [ ] `loss.backward()` 做了什么？为什么训练时 loss 会下降？
- [ ] Self-Attention 解决了什么问题？Q-K-V 分别代表什么？
- [ ] GPT/Qwen 为什么是"一个字一个字生成"的？
- [ ] 为什么 token 不等于字？BPE 的好处是什么？
- [ ] `apply_chat_template` 在做什么？为什么微调时需要它？
- [ ] Embedding 是什么？token ID 怎么变成模型能处理的向量？

全部能答上来 → 基础认知足够了，可以进入 Hugging Face 微调实战。
