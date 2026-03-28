require('dotenv').config();
const express = require('express');
const OpenAI = require('openai').default;
const path = require('path');
const fs = require('fs');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const client = new OpenAI({
  apiKey: process.env.PERPLEXITY_API_KEY,
  baseURL: 'https://api.perplexity.ai',
});

const SYSTEM_PROMPT = fs.readFileSync(path.join(__dirname, 'prompt.md'), 'utf-8');

app.post('/api/chat', async (req, res) => {
  const { messages } = req.body;

  if (!messages || !Array.isArray(messages)) {
    return res.status(400).json({ error: 'Invalid messages format' });
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('Access-Control-Allow-Origin', '*');

  try {
    const stream = await client.chat.completions.create({
      model: 'sonar',
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        ...messages,
      ],
      stream: true,
    });

    for await (const chunk of stream) {
      if (res.writableEnded) break;
      const text = chunk.choices[0]?.delta?.content;
      if (text) res.write(`data: ${JSON.stringify({ text })}\n\n`);
    }

    if (!res.writableEnded) {
      res.write('data: [DONE]\n\n');
      res.end();
    }
  } catch (err) {
    console.error('API error:', err);
    if (!res.headersSent) {
      res.status(500).json({ error: err.message });
    } else if (!res.writableEnded) {
      res.write(`data: ${JSON.stringify({ error: err.message })}\n\n`);
      res.end();
    }
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Resume website running at http://localhost:${PORT}`);
});
